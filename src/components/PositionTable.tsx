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
  Clock,
  RefreshCw,
  Bell,
  Eye,
  EyeOff,
  Filter,
  X,
  FileText,
} from "lucide-react";
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

interface OpenOrder {
  asset: string;
  side: "BUY" | "SELL";
  orderType: string;
  size: number;
  limitPrice?: number;
  triggerPrice?: number;
  reduceOnly: boolean;
  address: string;
  alias?: string;
  color?: string;
  orderKey: string;
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
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);

  const fetchCurrentPrices = async (
    assets: string[],
  ): Promise<Map<string, number>> => {
    const priceMap = new Map<string, number>();

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
      }
    } catch (error) {
      console.error("Error fetching current prices:", error);
    }

    return priceMap;
  };

  const fetchOpenOrders = async () => {
    setOrdersLoading(true);
    console.log("🔍 Starting fetchOpenOrders with addresses:", addresses);

    try {
      if (addresses.length === 0) {
        console.log("⚠️ No addresses provided, setting empty orders");
        setOpenOrders([]);
        return;
      }

      const allOrders: OpenOrder[] = [];

      // Fetch open orders for each address
      for (const addressObj of addresses) {
        console.log(`🔄 Fetching orders for address: ${addressObj.address}`);

        try {
          // First, try the clearinghouseState endpoint
          const requestBody = {
            type: "clearinghouseState",
            user: addressObj.address,
          };

          console.log(`📤 API Request for ${addressObj.address}:`, requestBody);

          const response = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });

          console.log(
            `📥 Response status for ${addressObj.address}:`,
            response.status,
            response.statusText,
          );

          if (!response.ok) {
            console.error(
              `❌ Failed to fetch orders for address ${addressObj.address}:`,
              response.status,
              response.statusText,
            );

            // Try to get error details
            try {
              const errorText = await response.text();
              console.error(`❌ Error response body:`, errorText);
            } catch (e) {
              console.error(`❌ Could not read error response:`, e);
            }
            continue;
          }

          const data = await response.json();

          console.log(`📋 COMPLETE API response for ${addressObj.address}:`, {
            address: addressObj.address,
            fullResponse: JSON.stringify(data, null, 2),
            responseKeys: Object.keys(data || {}),
            hasOpenOrders: !!data?.openOrders,
            openOrdersType: typeof data?.openOrders,
            openOrdersLength: data?.openOrders ? data.openOrders.length : 0,
            openOrdersData: data?.openOrders,
          });

          // Check all possible locations for orders in the response
          const possibleOrderLocations = [
            data?.openOrders,
            data?.orders,
            data?.openPositions,
            data?.positions,
            data?.userState?.openOrders,
            data?.userState?.orders,
          ];

          console.log(`🔍 Checking all possible order locations:`, {
            address: addressObj.address,
            locations: possibleOrderLocations.map((loc, idx) => ({
              index: idx,
              exists: !!loc,
              type: typeof loc,
              isArray: Array.isArray(loc),
              length: Array.isArray(loc) ? loc.length : "N/A",
              data: loc,
            })),
          });

          // Try to find orders in any of these locations
          let foundOrders = null;
          for (const orderLocation of possibleOrderLocations) {
            if (
              orderLocation &&
              Array.isArray(orderLocation) &&
              orderLocation.length > 0
            ) {
              foundOrders = orderLocation;
              console.log(`✅ Found orders in location:`, foundOrders);
              break;
            }
          }

          if (foundOrders) {
            console.log(
              `✅ Found ${foundOrders.length} open orders for ${addressObj.address}`,
            );

            for (const order of foundOrders) {
              console.log(`📝 Processing order:`, order);

              // Handle different order formats
              const orderSide =
                order.side === "A" || order.side === "SELL" ? "SELL" : "BUY";
              const orderKey = `${addressObj.address}-${order.coin || order.asset}-${order.oid || order.id || Math.random()}`;

              const processedOrder = {
                asset: order.coin || order.asset || "UNKNOWN",
                side: orderSide,
                orderType: order.orderType || order.type || "UNKNOWN",
                size: parseFloat(order.sz || order.size || "0"),
                limitPrice:
                  order.limitPx || order.limitPrice
                    ? parseFloat(order.limitPx || order.limitPrice)
                    : undefined,
                triggerPrice:
                  order.triggerPx || order.triggerPrice
                    ? parseFloat(order.triggerPx || order.triggerPrice)
                    : undefined,
                reduceOnly: order.reduceOnly || false,
                address: `${addressObj.address.slice(0, 6)}...${addressObj.address.slice(-4)}`,
                alias: addressObj.alias,
                color: addressObj.color,
                orderKey,
              };

              console.log(`✅ Processed order:`, processedOrder);
              allOrders.push(processedOrder);
            }
          } else {
            console.log(`⚠️ No open orders found for ${addressObj.address}:`, {
              hasData: !!data,
              dataKeys: data ? Object.keys(data) : [],
              checkedLocations: possibleOrderLocations.length,
            });

            // Try alternative API endpoint for open orders
            console.log(
              `🔄 Trying alternative API endpoint for ${addressObj.address}`,
            );

            try {
              const altRequestBody = {
                type: "openOrders",
                user: addressObj.address,
              };

              console.log(`📤 Alternative API Request:`, altRequestBody);

              const altResponse = await fetch(
                "https://api.hyperliquid.xyz/info",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(altRequestBody),
                },
              );

              if (altResponse.ok) {
                const altData = await altResponse.json();
                console.log(`📋 Alternative API response:`, {
                  address: addressObj.address,
                  altResponse: JSON.stringify(altData, null, 2),
                  isArray: Array.isArray(altData),
                  length: Array.isArray(altData) ? altData.length : "N/A",
                });

                if (Array.isArray(altData) && altData.length > 0) {
                  console.log(
                    `✅ Found ${altData.length} orders via alternative endpoint`,
                  );

                  for (const order of altData) {
                    const orderSide =
                      order.side === "A" || order.side === "SELL"
                        ? "SELL"
                        : "BUY";
                    const orderKey = `${addressObj.address}-${order.coin || order.asset}-${order.oid || order.id || Math.random()}`;

                    const processedOrder = {
                      asset: order.coin || order.asset || "UNKNOWN",
                      side: orderSide,
                      orderType: order.orderType || order.type || "UNKNOWN",
                      size: parseFloat(order.sz || order.size || "0"),
                      limitPrice:
                        order.limitPx || order.limitPrice
                          ? parseFloat(order.limitPx || order.limitPrice)
                          : undefined,
                      triggerPrice:
                        order.triggerPx || order.triggerPrice
                          ? parseFloat(order.triggerPx || order.triggerPrice)
                          : undefined,
                      reduceOnly: order.reduceOnly || false,
                      address: `${addressObj.address.slice(0, 6)}...${addressObj.address.slice(-4)}`,
                      alias: addressObj.alias,
                      color: addressObj.color,
                      orderKey,
                    };

                    console.log(
                      `✅ Processed alternative order:`,
                      processedOrder,
                    );
                    allOrders.push(processedOrder);
                  }
                }
              } else {
                console.log(
                  `❌ Alternative API failed:`,
                  altResponse.status,
                  altResponse.statusText,
                );
              }
            } catch (altError) {
              console.error(`❌ Alternative API error:`, altError);
            }
          }
        } catch (addressError) {
          console.error(
            `❌ Error fetching orders for address ${addressObj.address}:`,
            addressError,
          );
        }
      }

      console.log(`📊 Final orders count: ${allOrders.length}`, allOrders);
      setOpenOrders(allOrders);
    } catch (error) {
      console.error("❌ Error fetching open orders:", error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchPositions = async () => {
    setLoading(true);
    try {
      if (addresses.length === 0) {
        setPositions([]);
        setLastRefreshed(new Date());
        return;
      }

      // Load previously tracked positions
      const previouslyTracked = await getTrackedPositions();
      setTrackedPositions(previouslyTracked);

      const allPositions: Position[] = [];
      const currentPositionKeys = new Set<string>();
      const assetsToFetchPrices = new Set<string>();

      // Fetch positions for each address
      for (const addressObj of addresses) {
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
            continue;
          }

          const data = await response.json();

          // Process the response to extract positions
          console.log("Full API response for debugging:", {
            address: addressObj.address,
            data: data,
          });

          if (data && data.assetPositions) {
            for (const position of data.assetPositions) {
              if (
                position.position &&
                parseFloat(position.position.szi) !== 0
              ) {
                const size = parseFloat(position.position.szi);
                const entryPrice = parseFloat(position.position.entryPx || "0");
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
                  (p) => p.address === addressObj.address && p.asset === asset,
                );

                if (
                  !existingPosition &&
                  (addressObj.notifications_enabled ?? true)
                ) {
                  // New position detected - send notification (only if notifications are enabled)
                  console.log("🚨 New position detected:", {
                    address: addressObj.address,
                    asset,
                    side,
                    size,
                    entryPrice,
                  });

                  await sendPositionNotification(
                    addressObj.address,
                    asset,
                    side,
                    size,
                    entryPrice,
                    addressObj.alias,
                  );

                  setNotificationCount((prev) => prev + 1);
                }

                // Update tracked position
                await upsertTrackedPosition({
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
                  notionalValue > 0 ? (unrealizedPnl / notionalValue) * 100 : 0;

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
      }

      // Fetch current prices for all assets
      const currentPrices = await fetchCurrentPrices(
        Array.from(assetsToFetchPrices),
      );
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

      // Mark positions as inactive if they're no longer present
      for (const trackedPos of previouslyTracked) {
        const positionKey = `${trackedPos.address}-${trackedPos.asset}`;
        if (!currentPositionKeys.has(positionKey)) {
          await markPositionInactive(trackedPos.address, trackedPos.asset);
        }
      }

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
    if (addresses.length > 0) {
      fetchPositions();
      fetchOpenOrders();
    } else {
      setPositions([]);
      setOpenOrders([]);
      setLoading(false);
    }

    // Set up auto-refresh interval
    const intervalId = setInterval(() => {
      if (addresses.length > 0) {
        fetchPositions();
        fetchOpenOrders();
      }
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [addresses, refreshInterval]);

  const handleRefresh = () => {
    fetchPositions();
    fetchOpenOrders();
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

  const getFilteredOrders = () => {
    return openOrders.filter((order) => {
      // Filter by cryptocurrency
      if (selectedCrypto !== "all" && order.asset !== selectedCrypto) {
        return false;
      }
      if (
        cryptoFilter &&
        !order.asset.toLowerCase().includes(cryptoFilter.toLowerCase())
      ) {
        return false;
      }

      // Filter by trader
      if (selectedTrader !== "all") {
        const traderMatch =
          order.alias === selectedTrader || order.address === selectedTrader;
        if (!traderMatch) return false;
      }
      if (traderFilter) {
        const traderText = (order.alias || order.address).toLowerCase();
        if (!traderText.includes(traderFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
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

  const hasMatchingPosition = (order: OpenOrder): boolean => {
    // Find if there's a position for the same asset and address
    const matchingPosition = positions.find((position) => {
      // Check if asset matches
      if (position.asset !== order.asset) return false;

      // Check if address matches (compare full address from order with truncated display address)
      const orderAddress = order.address; // This is the truncated address like "0xb315...6fa"
      const positionAddress = position.address; // This is also truncated

      // Also check alias if available
      if (order.alias && position.alias) {
        return order.alias === position.alias;
      }

      return orderAddress === positionAddress;
    });

    return !!matchingPosition;
  };

  const renderOrdersTable = (ordersList: OpenOrder[]) => {
    if (ordersList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-muted-foreground">No open orders found.</p>
          <p className="text-sm text-muted-foreground">
            Open orders will appear here when detected.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Limit Price</TableHead>
              <TableHead>Reduce Only</TableHead>
              <TableHead>Has Position</TableHead>
              <TableHead>Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersList.map((order, index) => {
              const hasPosition = hasMatchingPosition(order);
              return (
                <TableRow key={index}>
                  <TableCell className="font-medium">{order.asset}</TableCell>
                  <TableCell>
                    <Badge
                      variant={order.side === "BUY" ? "default" : "destructive"}
                      className="font-medium"
                    >
                      {order.side}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono">
                      {Math.abs(order.size) < 0.001
                        ? order.size.toExponential(3)
                        : order.size.toFixed(3)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {order.limitPrice ? (
                      <span className="font-mono">
                        {formatPrice(order.limitPrice)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={order.reduceOnly ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {order.reduceOnly ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={hasPosition ? "default" : "outline"}
                      className={`text-xs ${hasPosition ? "bg-green-100 text-green-800 border-green-300" : ""}`}
                    >
                      {hasPosition ? "Yes" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      {order.alias && (
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: order.color || "#3b82f6",
                            }}
                          ></div>
                          <span className="text-xs font-medium">
                            {order.alias}
                          </span>
                        </div>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.address}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const visiblePositions = getFilteredPositions(false);
  const hiddenPositionsList = getFilteredPositions(true);
  const filteredOrders = getFilteredOrders();
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

    return (
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
            {positionsList.map((position, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{position.asset}</TableCell>
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-full flex items-center space-x-4">
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
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

            {/* Tabs for positions and orders */}
            <Tabs defaultValue="visible" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
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
                <TabsTrigger
                  value="orders"
                  className="flex items-center space-x-2"
                >
                  <FileText className="h-4 w-4" />
                  <span>Open Orders ({filteredOrders.length})</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="visible" className="mt-4">
                {renderPositionTable(visiblePositions, true, false)}
              </TabsContent>

              <TabsContent value="hidden" className="mt-4">
                {renderPositionTable(hiddenPositionsList, true, true)}
              </TabsContent>

              <TabsContent value="orders" className="mt-4">
                {ordersLoading ? (
                  <div className="w-full space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-full flex items-center space-x-4"
                      >
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  renderOrdersTable(filteredOrders)
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PositionTable;
