import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Clock, RefreshCw, Bell, Eye, EyeOff, Filter, X } from "lucide-react";
import {
  getTrackedPositions,
  upsertTrackedPosition,
  markPositionInactive,
  sendPositionNotification,
  getHiddenPositions,
  addHiddenPosition,
  removeHiddenPosition,
} from "@/lib/database";
import { TrackedPosition } from "@/lib/supabaseClient";

interface Position {
  asset: string;
  size: number;
  entryPrice: number;
  pnl: number;
  pnlPercentage: number;
  liquidationPrice: number;
  address: string;
  alias?: string;
  color?: string;
  openTime?: Date;
  leverage?: number;
  side: "LONG" | "SHORT";
  sizeUSD: number;
  currentPrice: number;
  positionKey: string;
}

interface AddressWithAlias {
  address: string;
  alias?: string;
  color?: string;
  notifications_enabled?: boolean;
}

interface PositionTableProps {
  addresses?: AddressWithAlias[];
  onRefresh?: () => void;
  refreshInterval?: number;
}

const PositionTable = ({
  addresses = [],
  onRefresh = () => {},
  refreshInterval: propRefreshInterval = 60,
}: PositionTableProps) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(
    propRefreshInterval * 1000,
  ); // Convert to milliseconds
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [trackedPositions, setTrackedPositions] = useState<TrackedPosition[]>(
    [],
  );
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const [hiddenPositions, setHiddenPositions] = useState<Set<string>>(
    new Set(),
  );
  const [cryptoFilter, setCryptoFilter] = useState<string>("");
  const [traderFilter, setTraderFilter] = useState<string>("");
  const [selectedCrypto, setSelectedCrypto] = useState<string>("all");
  const [selectedTrader, setSelectedTrader] = useState<string>("all");
  const [priceCache, setPriceCache] = useState<Map<string, number>>(new Map());
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);

  const fetchCurrentPrices = async (
    assets: string[],
  ): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>();

    // Return cached prices if they're still fresh (less than 30 seconds old)
    const cacheAge = Date.now() - (priceCache.get("_timestamp") || 0);
    if (cacheAge < 30000 && priceCache.size > 1) {
      console.log("📦 Using cached prices");
      return new Map(priceCache);
    }

    try {
      // Fetch current prices from Hyperliquid API
      const response = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // data is an object where keys are asset names and values are current prices
        for (const asset of assets) {
          if (data[asset]) {
            priceMap.set(asset, parseFloat(data[asset]));
          }
        }
        // Add timestamp to cache
        priceMap.set("_timestamp", Date.now());
      }
    } catch (error) {
      console.error("Error fetching current prices:", error);
      // Return cached prices if available, even if stale
      if (priceCache.size > 1) {
        console.log("⚠️ Using stale cached prices due to API error");
        return new Map(priceCache);
      }
    }

    return priceMap;
  };

  const fetchPositions = async () => {
    setLoading(true);
    try {
      if (addresses.length === 0) {
        setPositions([]);
        setLastRefreshed(new Date());
        return;
      }

      // Load previously tracked positions in parallel
      const [previouslyTracked] = await Promise.all([getTrackedPositions()]);
      setTrackedPositions(previouslyTracked);

      const allPositions: Position[] = [];
      const currentPositionKeys = new Set<string>();
      const assetsToFetchPrices = new Set<string>();
      const newPositionNotifications: Array<{
        address: string;
        asset: string;
        side: "LONG" | "SHORT";
        size: number;
        entryPrice: number;
        alias?: string;
      }> = [];
      const positionUpdates: Array<{
        address: string;
        asset: string;
        size: number;
        entry_price: number;
        side: "LONG" | "SHORT";
        leverage: number;
        is_active: boolean;
      }> = [];

      // Batch fetch all addresses in parallel with limited concurrency
      const batchSize = 3; // Limit concurrent requests to avoid overwhelming API
      const addressBatches = [];
      for (let i = 0; i < addresses.length; i += batchSize) {
        addressBatches.push(addresses.slice(i, i + batchSize));
      }

      for (const batch of addressBatches) {
        const batchPromises = batch.map(async (addressObj) => {
          try {
            // Fetch user state from Hyperliquid API
            const response = await fetch("https://api.hyperliquid.xyz/info", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: "clearinghouseState",
                user: addressObj.address,
              }),
            });

            if (!response.ok) {
              console.error(
                `Failed to fetch data for address ${addressObj.address}:`,
                response.statusText,
              );
              return;
            }

            const data = await response.json();

            if (data && data.assetPositions) {
              for (const position of data.assetPositions) {
                if (
                  position.position &&
                  parseFloat(position.position.szi) !== 0
                ) {
                  const size = parseFloat(position.position.szi);
                  const entryPrice = parseFloat(
                    position.position.entryPx || "0",
                  );
                  const unrealizedPnl = parseFloat(
                    position.position.unrealizedPnl || "0",
                  );
                  const liquidationPrice = parseFloat(
                    position.position.liquidationPx || "0",
                  );
                  const leverage = parseFloat(
                    position.position.leverage?.value || "1",
                  );
                  const side: "LONG" | "SHORT" = size > 0 ? "LONG" : "SHORT";
                  const asset = position.position.coin;

                  // Add asset to price fetch list
                  assetsToFetchPrices.add(asset);

                  // Create position key for tracking
                  const positionKey = `${addressObj.address}-${asset}`;
                  currentPositionKeys.add(positionKey);

                  // Check if this is a new position
                  const existingPosition = previouslyTracked.find(
                    (p) =>
                      p.address === addressObj.address && p.asset === asset,
                  );

                  if (
                    !existingPosition &&
                    (addressObj.notifications_enabled ?? true)
                  ) {
                    // Queue new position notification
                    newPositionNotifications.push({
                      address: addressObj.address,
                      asset,
                      side,
                      size,
                      entryPrice,
                      alias: addressObj.alias,
                    });
                  }

                  // Queue position update
                  positionUpdates.push({
                    address: addressObj.address,
                    asset,
                    size,
                    entry_price: entryPrice,
                    side,
                    leverage,
                    is_active: true,
                  });

                  // Calculate PnL percentage
                  const notionalValue = Math.abs(size * entryPrice);
                  const pnlPercentage =
                    notionalValue > 0
                      ? (unrealizedPnl / notionalValue) * 100
                      : 0;

                  allPositions.push({
                    asset,
                    size: size,
                    entryPrice: entryPrice,
                    pnl: unrealizedPnl,
                    pnlPercentage: pnlPercentage,
                    liquidationPrice: liquidationPrice,
                    address: `${addressObj.address.slice(0, 6)}...${addressObj.address.slice(-4)}`,
                    alias: addressObj.alias,
                    color: addressObj.color,
                    openTime: undefined,
                    leverage: leverage,
                    side,
                    sizeUSD: 0, // Will be calculated after fetching prices
                    currentPrice: 0, // Will be set after fetching prices
                    positionKey,
                  });
                }
              }
            }
          } catch (addressError) {
            console.error(
              `Error fetching positions for address ${addressObj.address}:`,
              addressError,
            );
          }
        });

        // Wait for current batch to complete before processing next batch
        await Promise.all(batchPromises);

        // Small delay between batches to be respectful to API
        if (addressBatches.indexOf(batch) < addressBatches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Fetch current prices for all assets in parallel with position processing
      const [currentPrices] = await Promise.all([
        fetchCurrentPrices(Array.from(assetsToFetchPrices)),
        // Process notifications and updates in background
        Promise.all([
          // Send notifications in parallel (but don't wait for them)
          ...newPositionNotifications.map(async (notification) => {
            try {
              await sendPositionNotification(
                notification.address,
                notification.asset,
                notification.side,
                notification.size,
                notification.entryPrice,
                notification.alias,
              );
              setNotificationCount((prev) => prev + 1);
            } catch (error) {
              console.error("Error sending notification:", error);
            }
          }),
          // Update tracked positions in parallel
          ...positionUpdates.map((update) => upsertTrackedPosition(update)),
        ]).catch((error) => {
          console.error("Error processing background updates:", error);
        }),
      ]);

      setPriceCache(currentPrices);

      // Calculate USD values for positions
      const positionsWithUSD = allPositions.map((position) => {
        const currentPrice =
          currentPrices.get(position.asset) || position.entryPrice;
        // Calculate the actual USD amount invested (considering leverage)
        // For leveraged positions, the actual money put in = (size * currentPrice) / leverage
        const sizeUSD =
          Math.abs(position.size * currentPrice) / (position.leverage || 1);

        return {
          ...position,
          currentPrice,
          sizeUSD,
        };
      });

      // Mark positions as inactive if they're no longer present (in background)
      Promise.all(
        previouslyTracked
          .filter((trackedPos) => {
            const positionKey = `${trackedPos.address}-${trackedPos.asset}`;
            return !currentPositionKeys.has(positionKey);
          })
          .map((trackedPos) =>
            markPositionInactive(trackedPos.address, trackedPos.asset),
          ),
      ).catch((error) => {
        console.error("Error marking positions inactive:", error);
      });

      setPositions(positionsWithUSD);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error("Error fetching positions:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load hidden positions from Supabase
  useEffect(() => {
    const loadHiddenPositions = async () => {
      try {
        const hiddenPositionKeys = await getHiddenPositions();
        console.log(
          "📥 Loading hidden positions from Supabase:",
          hiddenPositionKeys,
        );
        setHiddenPositions(new Set(hiddenPositionKeys));
      } catch (error) {
        console.error(
          "❌ Error loading hidden positions from Supabase:",
          error,
        );
      }
    };

    loadHiddenPositions();
  }, []);

  // Note: Hidden positions are now saved directly to Supabase when toggled
  // No need for a separate useEffect to save them

  // Update refresh interval when prop changes
  useEffect(() => {
    setRefreshInterval(propRefreshInterval * 1000);
  }, [propRefreshInterval]);

  useEffect(() => {
    const loadPositions = async () => {
      if (addresses.length > 0) {
        await fetchPositions();
        setIsInitialLoad(false);
      } else {
        setPositions([]);
        setLoading(false);
        setIsInitialLoad(false);
      }
    };

    loadPositions();

    // Set up auto-refresh interval (only after initial load)
    const intervalId = setInterval(() => {
      if (addresses.length > 0 && !isInitialLoad) {
        fetchPositions();
      }
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [addresses, refreshInterval, isInitialLoad]);

  const handleRefresh = () => {
    fetchPositions();
    onRefresh();
  };

  const handleIntervalChange = (interval: number) => {
    setRefreshInterval(interval);
  };

  const toggleHidePosition = async (positionKey: string) => {
    console.log("👁️ Toggling position visibility:", positionKey);
    const isCurrentlyHidden = hiddenPositions.has(positionKey);

    try {
      if (isCurrentlyHidden) {
        // Show position - remove from Supabase
        const success = await removeHiddenPosition(positionKey);
        if (success) {
          const newHiddenPositions = new Set(hiddenPositions);
          newHiddenPositions.delete(positionKey);
          setHiddenPositions(newHiddenPositions);
          console.log("👁️ Successfully showed position:", positionKey);
        } else {
          console.error("❌ Failed to show position in Supabase");
        }
      } else {
        // Hide position - add to Supabase
        const success = await addHiddenPosition(positionKey);
        if (success) {
          const newHiddenPositions = new Set(hiddenPositions);
          newHiddenPositions.add(positionKey);
          setHiddenPositions(newHiddenPositions);
          console.log("🙈 Successfully hid position:", positionKey);
        } else {
          console.error("❌ Failed to hide position in Supabase");
        }
      }
    } catch (error) {
      console.error("❌ Error toggling position visibility:", error);
    }
  };

  const getFilteredPositions = (includeHidden: boolean = false) => {
    return positions.filter((position) => {
      // Filter by hidden status
      const isHidden = hiddenPositions.has(position.positionKey);
      if (includeHidden && !isHidden) return false;
      if (!includeHidden && isHidden) return false;

      // Filter by cryptocurrency
      if (selectedCrypto !== "all" && position.asset !== selectedCrypto) {
        return false;
      }
      if (
        cryptoFilter &&
        !position.asset.toLowerCase().includes(cryptoFilter.toLowerCase())
      ) {
        return false;
      }

      // Filter by trader
      if (selectedTrader !== "all") {
        const traderMatch =
          position.alias === selectedTrader ||
          position.address === selectedTrader;
        if (!traderMatch) return false;
      }
      if (traderFilter) {
        const traderText = (position.alias || position.address).toLowerCase();
        if (!traderText.includes(traderFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  };

  const getPaginatedPositions = (positionsList: Position[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return positionsList.slice(startIndex, endIndex);
  };

  const getTotalPages = (totalItems: number) => {
    return Math.ceil(totalItems / itemsPerPage);
  };

  const getUniqueAssets = () => {
    const assets = new Set(positions.map((p) => p.asset));
    return Array.from(assets).sort();
  };

  const getUniqueTraders = () => {
    const traders = new Set<string>();
    positions.forEach((p) => {
      if (p.alias) traders.add(p.alias);
      traders.add(p.address);
    });
    return Array.from(traders).sort();
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  const formatCurrency = (value: number, maxDigits: number = 2) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDigits,
    }).format(value);
  };

  const formatPrice = (value: number) => {
    // Show more digits for entry price accuracy
    if (value < 1) {
      return formatCurrency(value, 6);
    } else if (value < 100) {
      return formatCurrency(value, 4);
    } else {
      return formatCurrency(value, 2);
    }
  };

  const formatDate = (date: Date) => {
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  const visiblePositions = getFilteredPositions(false);
  const hiddenPositionsList = getFilteredPositions(true);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCrypto, selectedTrader, cryptoFilter, traderFilter]);

  const uniqueAssets = getUniqueAssets();
  const uniqueTraders = getUniqueTraders();

  const renderPositionTable = (
    positionsList: Position[],
    showHideButton: boolean = true,
    isHiddenTab: boolean = false,
  ) => {
    if (positionsList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-muted-foreground">
            {isHiddenTab ? "No hidden positions." : "No positions found."}
          </p>
          <p className="text-sm text-muted-foreground">
            {isHiddenTab
              ? "Hidden positions will appear here."
              : "Positions will appear here when detected."}
          </p>
        </div>
      );
    }

    const paginatedPositions = getPaginatedPositions(positionsList);
    const totalPages = getTotalPages(positionsList.length);

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Size (USD)</TableHead>
                <TableHead>Entry Price</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Leverage</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>Liquidation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Address</TableHead>
                {showHideButton && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPositions.map((position, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {position.asset}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        position.side === "LONG" ? "default" : "destructive"
                      }
                      className="font-medium"
                    >
                      {position.side}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        position.size > 0 ? "text-green-500" : "text-red-500"
                      }
                    >
                      {position.size > 0 ? "+" : ""}
                      {Math.abs(position.size) < 0.001
                        ? position.size.toExponential(3)
                        : position.size.toFixed(3)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-blue-600">
                      {formatCurrency(position.sizeUSD)}
                    </span>
                  </TableCell>
                  <TableCell>{formatPrice(position.entryPrice)}</TableCell>
                  <TableCell>{formatPrice(position.currentPrice)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">
                      {position.leverage
                        ? `${position.leverage.toFixed(1)}x`
                        : "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span
                        className={
                          position.pnl >= 0 ? "text-green-500" : "text-red-500"
                        }
                      >
                        {formatCurrency(position.pnl)}
                      </span>
                      <span
                        className={`text-xs ${position.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"}`}
                      >
                        {position.pnlPercentage >= 0 ? "+" : ""}
                        {position.pnlPercentage.toFixed(2)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {position.liquidationPrice > 0
                        ? formatPrice(position.liquidationPrice)
                        : "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {position.alias && (
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: position.color || "#3b82f6",
                            }}
                          ></div>
                          <span className="text-xs font-medium">
                            {position.alias}
                          </span>
                        </div>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {position.address}
                      </span>
                    </div>
                  </TableCell>
                  {showHideButton && (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleHidePosition(position.positionKey)}
                        className="h-8 w-8 p-0"
                      >
                        {isHiddenTab ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, positionsList.length)} of{" "}
              {positionsList.length} positions
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="w-full bg-background">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center space-x-3">
          <CardTitle className="text-xl font-semibold">Positions</CardTitle>
          {notificationCount > 0 && (
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Bell className="h-3 w-3" />
              <span>{notificationCount} new</span>
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="mr-1 h-4 w-4" />
            <span>Last updated: {formatTime(lastRefreshed)}</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {addresses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-muted-foreground">No addresses added yet.</p>
            <p className="text-sm text-muted-foreground">
              Add wallet addresses to track positions.
            </p>
          </div>
        ) : loading ? (
          <div className="w-full space-y-3">
            {isInitialLoad ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading positions...</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Fetching data from {addresses.length} address
                  {addresses.length !== 1 ? "es" : ""}
                </p>
              </div>
            ) : (
              [1, 2, 3].map((i) => (
                <div key={i} className="w-full flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Filters:</span>
              </div>

              {/* Cryptocurrency Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-sm">Crypto:</span>
                <Select
                  value={selectedCrypto}
                  onValueChange={setSelectedCrypto}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueAssets.map((asset) => (
                      <SelectItem key={asset} value={asset}>
                        {asset}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search crypto..."
                  value={cryptoFilter}
                  onChange={(e) => setCryptoFilter(e.target.value)}
                  className="w-32"
                />
                {cryptoFilter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCryptoFilter("")}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Trader Filter */}
              <div className="flex items-center space-x-2">
                <span className="text-sm">Trader:</span>
                <Select
                  value={selectedTrader}
                  onValueChange={setSelectedTrader}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueTraders.map((trader) => (
                      <SelectItem key={trader} value={trader}>
                        {trader}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Search trader..."
                  value={traderFilter}
                  onChange={(e) => setTraderFilter(e.target.value)}
                  className="w-32"
                />
                {traderFilter && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTraderFilter("")}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs for positions */}
            <Tabs defaultValue="visible" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="visible"
                  className="flex items-center space-x-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>Visible Positions ({visiblePositions.length})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="hidden"
                  className="flex items-center space-x-2"
                >
                  <EyeOff className="h-4 w-4" />
                  <span>Hidden Positions ({hiddenPositionsList.length})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="visible" className="mt-4">
                {renderPositionTable(visiblePositions, true, false)}
              </TabsContent>

              <TabsContent value="hidden" className="mt-4">
                {renderPositionTable(hiddenPositionsList, true, true)}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PositionTable;
