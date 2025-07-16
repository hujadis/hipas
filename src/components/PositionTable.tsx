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
import {
  Clock,
  RefreshCw,
  Bell,
  Eye,
  EyeOff,
  Filter,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  getTrackedPositions,
  getNewPositions,
  getClosedPositions,
  getAllTrackedPositions,
  upsertTrackedPosition,
  closeTrackedPosition,
  markPositionInactive,
  sendPositionNotification,
  getHiddenPositions,
  addHiddenPosition,
  removeHiddenPosition,
  getPositionAnalytics,
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
  refreshInterval: propRefreshInterval = 300,
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
  const [activeTab, setActiveTab] = useState<string>("active");
  const [analytics, setAnalytics] = useState<any>(null);
  const [newPositions, setNewPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [allPositions, setAllPositions] = useState<Position[]>([]);

  // Separate pagination state for each tab
  const [tabPagination, setTabPagination] = useState<Record<string, number>>({
    active: 1,
    new: 1,
    closed: 1,
    hidden: 1,
    all: 1,
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Position | null;
    direction: "asc" | "desc";
  }>({ key: null, direction: "asc" });

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

      // Load previously tracked positions and analytics in parallel
      const [
        previouslyTracked,
        analyticsData,
        newPositionsData,
        closedPositionsData,
        allPositionsData,
      ] = await Promise.all([
        getTrackedPositions(),
        getPositionAnalytics(),
        getNewPositions(1),
        getClosedPositions(),
        getAllTrackedPositions(),
      ]);
      setTrackedPositions(previouslyTracked);
      setAnalytics(analyticsData);

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
                    (p) => p.position_key === positionKey,
                  );

                  let positionStatus = "active";
                  if (!existingPosition) {
                    positionStatus = "new";
                    if (addressObj.notifications_enabled ?? true) {
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
                  } else if (existingPosition.status === "new") {
                    // Keep as new for 24 hours
                    const createdAt = new Date(
                      existingPosition.created_at || "",
                    );
                    const twentyFourHoursAgo = new Date();
                    twentyFourHoursAgo.setHours(
                      twentyFourHoursAgo.getHours() - 24,
                    );
                    positionStatus =
                      createdAt > twentyFourHoursAgo ? "new" : "active";
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
                    position_key: positionKey,
                    status: positionStatus,
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
                    address: addressObj.address,
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

      // Mark positions as closed if they're no longer present (in background)
      const positionsToClose = previouslyTracked.filter((trackedPos) => {
        return (
          trackedPos.position_key &&
          !currentPositionKeys.has(trackedPos.position_key) &&
          (trackedPos.status === "active" || trackedPos.status === "new") &&
          (trackedPos.is_active === true || trackedPos.is_active === null)
        );
      });

      // Close positions that are no longer active
      if (positionsToClose.length > 0) {
        console.log(
          "🔄 Closing positions that are no longer active:",
          positionsToClose.map((p) => p.position_key),
        );
        Promise.all(
          positionsToClose.map(async (trackedPos) => {
            if (trackedPos.position_key) {
              // Calculate final PnL based on last known price
              const currentPrice =
                currentPrices.get(trackedPos.asset) || trackedPos.entry_price;
              const finalPnl =
                (currentPrice - trackedPos.entry_price) * trackedPos.size;
              await closeTrackedPosition(
                trackedPos.position_key,
                finalPnl,
                currentPrice,
              );
            }
          }),
        )
          .then(() => {
            // Refresh tracked positions after closing
            console.log("✅ Successfully closed inactive positions");
          })
          .catch((error) => {
            console.error("❌ Error closing positions:", error);
          });
      }

      // Convert tracked positions to display format for other tabs
      const convertTrackedToDisplay = (trackedPositions: any[]) => {
        return trackedPositions.map((tp) => {
          const currentPrice = currentPrices.get(tp.asset) || tp.entry_price;
          const pnl = tp.final_pnl || (currentPrice - tp.entry_price) * tp.size;
          const notionalValue = Math.abs(tp.size * tp.entry_price);
          const pnlPercentage =
            notionalValue > 0 ? (pnl / notionalValue) * 100 : 0;
          const sizeUSD = Math.abs(tp.size * currentPrice) / (tp.leverage || 1);

          // Find matching address info for alias and color
          const addressInfo = addresses.find(
            (addr) => addr.address === tp.address,
          );

          return {
            asset: tp.asset,
            size: tp.size,
            entryPrice: tp.entry_price,
            pnl,
            pnlPercentage,
            liquidationPrice: 0, // Not available for historical positions
            address: tp.address,
            alias: addressInfo?.alias,
            color: addressInfo?.color,
            openTime:
              tp.status === "closed"
                ? new Date(tp.closed_at || tp.created_at)
                : undefined,
            leverage: tp.leverage,
            side: tp.side as "LONG" | "SHORT",
            sizeUSD,
            currentPrice,
            positionKey: tp.position_key || `${tp.address}-${tp.asset}`,
          };
        });
      };

      // Filter positions by status for different tabs
      const newPositionsFiltered = newPositionsData.filter(
        (p) => p.status === "new",
      );
      const closedPositionsFiltered = closedPositionsData.filter(
        (p) => p.status === "closed",
      );
      const historicalPositions = allPositionsData.filter(
        (p) => p.status === "closed" || p.status === "new",
      );

      const convertedNewPositions =
        convertTrackedToDisplay(newPositionsFiltered);
      const convertedClosedPositions = convertTrackedToDisplay(
        closedPositionsFiltered,
      );

      setNewPositions(convertedNewPositions);
      setClosedPositions(convertedClosedPositions);

      // For all positions, combine current active positions with historical ones
      // Create a comprehensive list without premature deduplication
      const allCombinedPositions = [
        ...positionsWithUSD,
        ...convertTrackedToDisplay(newPositionsFiltered),
        ...convertTrackedToDisplay(closedPositionsFiltered),
      ];

      setAllPositions(allCombinedPositions);

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

  const getFilteredPositions = (
    positionsList: Position[],
    includeHidden: boolean = false,
    showAllPositions: boolean = false,
  ) => {
    // Remove duplicates first by using position key - prioritize active positions over historical ones
    const uniquePositions = positionsList.reduce((acc, position) => {
      const existingIndex = acc.findIndex(
        (p) => p.positionKey === position.positionKey,
      );
      if (existingIndex === -1) {
        acc.push(position);
      } else {
        // If we find a duplicate, keep the one that's more current
        // Priority: active positions > new positions > closed positions
        const existing = acc[existingIndex];
        const existingTracked = trackedPositions.find(
          (tp) => tp.position_key === existing.positionKey,
        );
        const currentTracked = trackedPositions.find(
          (tp) => tp.position_key === position.positionKey,
        );

        // Prioritize based on status and data freshness
        const existingStatus = existingTracked?.status || "active";
        const currentStatus = currentTracked?.status || "active";

        // Keep active over new, new over closed
        if (currentStatus === "active" && existingStatus !== "active") {
          acc[existingIndex] = position;
        } else if (currentStatus === "new" && existingStatus === "closed") {
          acc[existingIndex] = position;
        } else if (
          currentStatus === existingStatus &&
          position.currentPrice > 0 &&
          existing.currentPrice === 0
        ) {
          acc[existingIndex] = position; // Replace with more current data
        }
      }
      return acc;
    }, [] as Position[]);

    return uniquePositions.filter((position) => {
      // Filter by hidden status - special handling for "All" tab
      const isHidden = hiddenPositions.has(position.positionKey);
      if (showAllPositions) {
        // For "All" tab, include both hidden and visible positions
        // No filtering by hidden status
      } else if (includeHidden && !isHidden) {
        return false; // Hidden tab - only show hidden positions
      } else if (!includeHidden && isHidden) {
        return false; // Other tabs - exclude hidden positions
      }

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

      // Filter by trader - fix the logic to properly handle address filtering
      if (selectedTrader !== "all") {
        const addressMatch = position.address === selectedTrader;
        const aliasMatch = position.alias && position.alias === selectedTrader;
        if (!addressMatch && !aliasMatch) return false;
      }
      if (traderFilter) {
        const addressText = position.address.toLowerCase();
        const aliasText = (position.alias || "").toLowerCase();
        const filterText = traderFilter.toLowerCase();
        if (
          !addressText.includes(filterText) &&
          !aliasText.includes(filterText)
        ) {
          return false;
        }
      }

      return true;
    });
  };

  const getPaginatedPositions = (positionsList: Position[], page: number) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return positionsList.slice(startIndex, endIndex);
  };

  const sortPositions = (positionsList: Position[]) => {
    if (!sortConfig.key) return positionsList;

    return [...positionsList].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      // Handle different data types
      let comparison = 0;
      if (typeof aValue === "string" && typeof bValue === "string") {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        // Convert to string for comparison
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortConfig.direction === "desc" ? -comparison : comparison;
    });
  };

  const handleSort = (key: keyof Position) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const getSortIcon = (columnKey: keyof Position) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
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
    // Get traders from all position sources
    const allPositionSources = [
      ...positions,
      ...newPositions,
      ...closedPositions,
    ];
    allPositionSources.forEach((p) => {
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

  const visiblePositions = getFilteredPositions(positions, false, false);
  const hiddenPositionsList = getFilteredPositions(
    [...positions, ...newPositions, ...closedPositions],
    true,
    false,
  );
  const filteredNewPositions = getFilteredPositions(newPositions, false, false);
  const filteredClosedPositions = getFilteredPositions(
    closedPositions,
    false,
    false,
  );
  const filteredAllPositions = getFilteredPositions(allPositions, false, true);

  // Reset to first page when filters change
  useEffect(() => {
    setTabPagination({
      active: 1,
      new: 1,
      closed: 1,
      hidden: 1,
      all: 1,
    });
  }, [selectedCrypto, selectedTrader, cryptoFilter, traderFilter]);

  // Update current page when tab changes
  const getCurrentPage = () => tabPagination[activeTab] || 1;
  const setCurrentPageForTab = (page: number) => {
    setTabPagination((prev) => ({
      ...prev,
      [activeTab]: page,
    }));
  };

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

    const sortedPositions = sortPositions(positionsList);
    const currentPage = getCurrentPage();
    const paginatedPositions = getPaginatedPositions(
      sortedPositions,
      currentPage,
    );
    const totalPages = getTotalPages(sortedPositions.length);

    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("asset")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Asset</span>
                    {getSortIcon("asset")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("side")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Side</span>
                    {getSortIcon("side")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("size")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Size</span>
                    {getSortIcon("size")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("sizeUSD")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Size (USD)</span>
                    {getSortIcon("sizeUSD")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("entryPrice")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Entry Price</span>
                    {getSortIcon("entryPrice")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("currentPrice")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Current Price</span>
                    {getSortIcon("currentPrice")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("leverage")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Leverage</span>
                    {getSortIcon("leverage")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("pnl")}
                >
                  <div className="flex items-center space-x-1">
                    <span>PnL</span>
                    {getSortIcon("pnl")}
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("liquidationPrice")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Liquidation</span>
                    {getSortIcon("liquidationPrice")}
                  </div>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort("address")}
                >
                  <div className="flex items-center space-x-1">
                    <span>Address</span>
                    {getSortIcon("address")}
                  </div>
                </TableHead>
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
                    <Badge
                      variant={(() => {
                        const trackedPos = trackedPositions.find(
                          (tp) => tp.position_key === position.positionKey,
                        );
                        if (trackedPos?.status === "new") return "default";
                        if (trackedPos?.status === "closed") return "secondary";
                        return "default";
                      })()}
                      className="text-xs"
                    >
                      {(() => {
                        const trackedPos = trackedPositions.find(
                          (tp) => tp.position_key === position.positionKey,
                        );
                        if (trackedPos?.status === "new") return "New";
                        if (trackedPos?.status === "closed") return "Closed";
                        return "Active";
                      })()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      // For active positions, find the tracked position to get creation time
                      const trackedPos = trackedPositions.find(
                        (tp) => tp.position_key === position.positionKey,
                      );

                      if (trackedPos && trackedPos.created_at) {
                        const createdAt = new Date(trackedPos.created_at);
                        const now = new Date();
                        const durationMinutes = Math.floor(
                          (now.getTime() - createdAt.getTime()) / (1000 * 60),
                        );

                        if (durationMinutes < 60) {
                          return (
                            <span className="text-xs text-muted-foreground">
                              {durationMinutes}m
                            </span>
                          );
                        } else if (durationMinutes < 1440) {
                          const hours = Math.floor(durationMinutes / 60);
                          const minutes = durationMinutes % 60;
                          return (
                            <span className="text-xs text-muted-foreground">
                              {hours}h {minutes > 0 ? `${minutes}m` : ""}
                            </span>
                          );
                        } else {
                          const days = Math.floor(durationMinutes / 1440);
                          const hours = Math.floor(
                            (durationMinutes % 1440) / 60,
                          );
                          return (
                            <span className="text-xs text-muted-foreground">
                              {days}d {hours > 0 ? `${hours}h` : ""}
                            </span>
                          );
                        }
                      } else if (position.openTime) {
                        // For closed positions, use the stored duration or calculate from openTime
                        const durationMinutes = Math.floor(
                          (Date.now() - position.openTime.getTime()) /
                            (1000 * 60),
                        );

                        if (durationMinutes < 60) {
                          return (
                            <span className="text-xs text-muted-foreground">
                              {durationMinutes}m
                            </span>
                          );
                        } else {
                          const hours = Math.floor(durationMinutes / 60);
                          return (
                            <span className="text-xs text-muted-foreground">
                              {hours}h
                            </span>
                          );
                        }
                      } else {
                        return (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        );
                      }
                    })()}
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
                      <span
                        className="font-mono text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                        onClick={() =>
                          navigator.clipboard.writeText(position.address)
                        }
                        title="Click to copy address"
                      >
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
              {Math.min(currentPage * itemsPerPage, sortedPositions.length)} of{" "}
              {sortedPositions.length} positions
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setCurrentPageForTab(Math.max(1, currentPage - 1))
                    }
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
                        onClick={() => setCurrentPageForTab(pageNum)}
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
                      setCurrentPageForTab(
                        Math.min(totalPages, currentPage + 1),
                      )
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

            {/* Analytics Summary */}
            {analytics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {analytics.totalPositions}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Positions
                  </div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${analytics.totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {formatCurrency(analytics.totalPnl)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total P&L</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {analytics.winRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-muted-foreground">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">
                    {Math.round(analytics.avgHoldingTimeMinutes / 60)}h
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Avg Hold Time
                  </div>
                </div>
              </div>
            )}

            {/* Tabs for positions */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger
                  value="active"
                  className="flex items-center space-x-1 text-xs"
                >
                  <span>Active ({visiblePositions.length})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="new"
                  className="flex items-center space-x-1 text-xs"
                >
                  <span>New ({filteredNewPositions.length})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="closed"
                  className="flex items-center space-x-1 text-xs"
                >
                  <span>Closed ({filteredClosedPositions.length})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="hidden"
                  className="flex items-center space-x-1 text-xs"
                >
                  <EyeOff className="h-3 w-3" />
                  <span>Hidden ({hiddenPositionsList.length})</span>
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  className="flex items-center space-x-1 text-xs"
                >
                  <span>All ({filteredAllPositions.length})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="mt-4">
                {renderPositionTable(visiblePositions, true, false)}
              </TabsContent>

              <TabsContent value="new" className="mt-4">
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    📈 New positions detected in the last 1 hour
                  </p>
                </div>
                {renderPositionTable(filteredNewPositions, true, false)}
              </TabsContent>

              <TabsContent value="closed" className="mt-4">
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    📊 Positions that have been closed
                  </p>
                </div>
                {renderPositionTable(filteredClosedPositions, false, false)}
              </TabsContent>

              <TabsContent value="hidden" className="mt-4">
                {renderPositionTable(hiddenPositionsList, true, true)}
              </TabsContent>

              <TabsContent value="all" className="mt-4">
                <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-sm text-purple-700 dark:text-purple-300">
                    📋 Complete position history and current positions
                  </p>
                </div>
                {renderPositionTable(filteredAllPositions, true, false)}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PositionTable;
