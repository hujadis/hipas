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

  // Fetch positions from Hyperliquid API
  const fetchPositions = async (): Promise<Position[]> => {
    if (addresses.length === 0) return [];

    try {
      const allPositions: Position[] = [];

      for (const addressData of addresses) {
        const response = await fetch(`https://api.hyperliquid.xyz/info`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "clearinghouseState",
            user: addressData.address,
          }),
        });

        if (!response.ok) {
          console.error(`Failed to fetch positions for ${addressData.address}`);
          continue;
        }

        const data = await response.json();
        const positions = data.assetPositions || [];

        // Get current prices for all assets
        const assets = positions.map((pos: any) => pos.position.coin);
        const prices = await fetchCurrentPrices(assets);

        for (const positionData of positions) {
          const position = positionData.position;
          if (parseFloat(position.szi) === 0) continue; // Skip closed positions

          const size = Math.abs(parseFloat(position.szi));
          const entryPrice = parseFloat(position.entryPx || "0");
          const currentPrice = prices.get(position.coin) || entryPrice;
          const leverage = parseFloat(position.leverage?.value || "1");
          const side = parseFloat(position.szi) > 0 ? "LONG" : "SHORT";
          const sizeUSD = size * currentPrice;

          // Calculate PnL
          let pnl = 0;
          if (side === "LONG") {
            pnl = (currentPrice - entryPrice) * size;
          } else {
            pnl = (entryPrice - currentPrice) * size;
          }
          const pnlPercentage =
            entryPrice > 0 ? (pnl / (entryPrice * size)) * 100 : 0;

          // Calculate liquidation price (simplified)
          const liquidationPrice =
            side === "LONG"
              ? entryPrice * (1 - 0.9 / leverage)
              : entryPrice * (1 + 0.9 / leverage);

          const positionKey = `${addressData.address}-${position.coin}`;

          allPositions.push({
            asset: position.coin,
            size,
            entryPrice,
            pnl,
            pnlPercentage,
            liquidationPrice,
            address: addressData.address,
            alias: addressData.alias,
            color: addressData.color,
            leverage,
            side,
            sizeUSD,
            currentPrice,
            positionKey,
          });
        }
      }

      return allPositions;
    } catch (error) {
      console.error("Error fetching positions:", error);
      return [];
    }
  };

  // Fetch current prices for assets
  const fetchCurrentPrices = async (
    assets: string[],
  ): Promise<Map<string, number>> => {
    if (assets.length === 0) return new Map();

    try {
      const response = await fetch(`https://api.hyperliquid.xyz/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "allMids",
        }),
      });

      if (!response.ok) {
        console.error("Failed to fetch current prices");
        return priceCache;
      }

      const data = await response.json();
      const newPriceCache = new Map<string, number>();

      for (const asset of assets) {
        const price = parseFloat(data[asset] || "0");
        if (price > 0) {
          newPriceCache.set(asset, price);
        } else if (priceCache.has(asset)) {
          newPriceCache.set(asset, priceCache.get(asset)!);
        }
      }

      setPriceCache(newPriceCache);
      return newPriceCache;
    } catch (error) {
      console.error("Error fetching prices:", error);
      return priceCache;
    }
  };

  // Fetch open orders
  const fetchOpenOrders = async (): Promise<OpenOrder[]> => {
    if (addresses.length === 0) return [];

    try {
      const allOrders: OpenOrder[] = [];

      for (const addressData of addresses) {
        const response = await fetch(`https://api.hyperliquid.xyz/info`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "openOrders",
            user: addressData.address,
          }),
        });

        if (!response.ok) {
          console.error(`Failed to fetch orders for ${addressData.address}`);
          continue;
        }

        const orders = await response.json();

        for (const order of orders) {
          const orderKey = `${addressData.address}-${order.coin}-${order.oid}`;

          allOrders.push({
            asset: order.coin,
            side: order.side,
            orderType: order.orderType,
            size: parseFloat(order.sz),
            limitPrice: order.limitPx ? parseFloat(order.limitPx) : undefined,
            triggerPrice: order.triggerPx
              ? parseFloat(order.triggerPx)
              : undefined,
            reduceOnly: order.reduceOnly || false,
            address: addressData.address,
            alias: addressData.alias,
            color: addressData.color,
            orderKey,
          });
        }
      }

      return allOrders;
    } catch (error) {
      console.error("Error fetching open orders:", error);
      return [];
    }
  };

  // Load data
  const loadData = async () => {
    setLoading(true);
    setOrdersLoading(true);

    try {
      const [positionsData, ordersData, hiddenPositionsData] =
        await Promise.all([
          fetchPositions(),
          fetchOpenOrders(),
          getHiddenPositions(),
        ]);

      setPositions(positionsData);
      setOpenOrders(ordersData);
      setHiddenPositions(
        new Set(hiddenPositionsData.map((hp) => hp.position_key)),
      );
      setLastRefreshed(new Date());

      // Check for new positions and send notifications
      await checkForNewPositions(positionsData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
      setOrdersLoading(false);
    }
  };

  // Check for new positions and send notifications
  const checkForNewPositions = async (currentPositions: Position[]) => {
    try {
      const tracked = await getTrackedPositions();
      setTrackedPositions(tracked);

      const trackedMap = new Map(tracked.map((tp) => [tp.position_key, tp]));
      let newPositionsCount = 0;

      for (const position of currentPositions) {
        const existing = trackedMap.get(position.positionKey);

        if (!existing) {
          // New position detected
          await upsertTrackedPosition({
            position_key: position.positionKey,
            address: position.address,
            asset: position.asset,
            side: position.side,
            size: position.size,
            entry_price: position.entryPrice,
            is_active: true,
            updated_at: new Date().toISOString(),
          });

          // Send notification if enabled for this address
          const addressData = addresses.find(
            (a) => a.address === position.address,
          );
          if (addressData?.notifications_enabled) {
            const success = await sendPositionNotification(
              position.address,
              position.asset,
              position.side,
              position.size,
              position.entryPrice,
              position.alias,
            );

            if (success) {
              newPositionsCount++;
            }
          }
        } else if (!existing.is_active) {
          // Position became active again
          await upsertTrackedPosition({
            ...existing,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Mark positions as inactive if they're no longer in current positions
      const currentPositionKeys = new Set(
        currentPositions.map((p) => p.positionKey),
      );
      for (const trackedPosition of tracked) {
        if (
          trackedPosition.is_active &&
          !currentPositionKeys.has(trackedPosition.position_key)
        ) {
          await markPositionInactive(trackedPosition.position_key);
        }
      }

      setNotificationCount((prev) => prev + newPositionsCount);
    } catch (error) {
      console.error("Error checking for new positions:", error);
    }
  };

  // Toggle position visibility
  const togglePositionVisibility = async (positionKey: string) => {
    try {
      if (hiddenPositions.has(positionKey)) {
        await removeHiddenPosition(positionKey);
        setHiddenPositions((prev) => {
          const newSet = new Set(prev);
          newSet.delete(positionKey);
          return newSet;
        });
      } else {
        await addHiddenPosition(positionKey);
        setHiddenPositions((prev) => new Set([...prev, positionKey]));
      }
    } catch (error) {
      console.error("Error toggling position visibility:", error);
    }
  };

  // Filter positions
  const getFilteredPositions = (positionsToFilter: Position[]) => {
    return positionsToFilter.filter((position) => {
      const matchesCrypto =
        selectedCrypto === "all" || position.asset === selectedCrypto;
      const matchesTrader =
        selectedTrader === "all" || position.address === selectedTrader;
      const matchesCryptoSearch =
        cryptoFilter === "" ||
        position.asset.toLowerCase().includes(cryptoFilter.toLowerCase());
      const matchesTraderSearch =
        traderFilter === "" ||
        (position.alias &&
          position.alias.toLowerCase().includes(traderFilter.toLowerCase())) ||
        position.address.toLowerCase().includes(traderFilter.toLowerCase());

      return (
        matchesCrypto &&
        matchesTrader &&
        matchesCryptoSearch &&
        matchesTraderSearch
      );
    });
  };

  const visiblePositions = getFilteredPositions(
    positions.filter((p) => !hiddenPositions.has(p.positionKey)),
  );
  const hiddenPositionsList = getFilteredPositions(
    positions.filter((p) => hiddenPositions.has(p.positionKey)),
  );

  // Get unique assets and traders for filters
  const uniqueAssets = [...new Set(positions.map((p) => p.asset))].sort();
  const uniqueTraders = [
    ...new Set(positions.map((p) => ({ address: p.address, alias: p.alias }))),
  ];

  // Auto-refresh effect
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, refreshInterval);
    return () => clearInterval(interval);
  }, [addresses, refreshInterval]);

  // Manual refresh
  const handleRefresh = () => {
    loadData();
    onRefresh();
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6);
  };

  const formatPnL = (pnl: number, percentage: number) => {
    const sign = pnl >= 0 ? "+" : "";
    return `${sign}${pnl.toFixed(2)} (${sign}${percentage.toFixed(2)}%)`;
  };

  const PositionRow = ({
    position,
    isHidden = false,
  }: {
    position: Position;
    isHidden?: boolean;
  }) => (
    <TableRow key={position.positionKey}>
      <TableCell>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: position.color || "#6b7280" }}
          />
          <span className="font-medium">{position.asset}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={position.side === "LONG" ? "default" : "destructive"}>
          {position.side}
        </Badge>
      </TableCell>
      <TableCell className="text-right">{position.size.toFixed(4)}</TableCell>
      <TableCell className="text-right">
        ${position.sizeUSD.toFixed(2)}
      </TableCell>
      <TableCell className="text-right">
        ${formatPrice(position.entryPrice)}
      </TableCell>
      <TableCell className="text-right">
        ${formatPrice(position.currentPrice)}
      </TableCell>
      <TableCell className="text-right">
        {position.leverage?.toFixed(1)}x
      </TableCell>
      <TableCell
        className={`text-right font-medium ${
          position.pnl >= 0 ? "text-green-600" : "text-red-600"
        }`}
      >
        {formatPnL(position.pnl, position.pnlPercentage)}
      </TableCell>
      <TableCell className="text-right">
        ${formatPrice(position.liquidationPrice)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground truncate max-w-[100px]">
            {position.alias ||
              `${position.address.slice(0, 6)}...${position.address.slice(-4)}`}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => togglePositionVisibility(position.positionKey)}
        >
          {isHidden ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );

  const OrderRow = ({ order }: { order: OpenOrder }) => {
    const hasPosition = positions.some(
      (p) => p.address === order.address && p.asset === order.asset,
    );

    return (
      <TableRow key={order.orderKey}>
        <TableCell>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: order.color || "#6b7280" }}
            />
            <span className="font-medium">{order.asset}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={order.side === "BUY" ? "default" : "destructive"}>
            {order.side}
          </Badge>
        </TableCell>
        <TableCell className="text-right">{order.size.toFixed(4)}</TableCell>
        <TableCell className="text-right">
          {order.limitPrice ? `${formatPrice(order.limitPrice)}` : "-"}
        </TableCell>
        <TableCell className="text-center">
          {order.reduceOnly ? "Yes" : "No"}
        </TableCell>
        <TableCell className="text-center">
          <Badge variant={hasPosition ? "default" : "secondary"}>
            {hasPosition ? "Yes" : "No"}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground truncate max-w-[100px]">
              {order.alias ||
                `${order.address.slice(0, 6)}...${order.address.slice(-4)}`}
            </span>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  if (addresses.length === 0) {
    return (
      <Card className="bg-white">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No wallet addresses added yet.</p>
            <p className="text-sm mt-2">
              Add wallet addresses to start tracking positions.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 bg-white">
      {/* Header with refresh controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Position Tracker
              {notificationCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  <Bell className="h-3 w-3 mr-1" />
                  {notificationCount}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={refreshInterval.toString()}
                onValueChange={(value) => setRefreshInterval(parseInt(value))}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30000">30s</SelectItem>
                  <SelectItem value="60000">1m</SelectItem>
                  <SelectItem value="300000">5m</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </div>
        </CardHeader>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <div className="flex gap-2">
              <Select value={selectedCrypto} onValueChange={setSelectedCrypto}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Crypto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cryptos</SelectItem>
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
            </div>
            <div className="flex gap-2">
              <Select value={selectedTrader} onValueChange={setSelectedTrader}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Trader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Traders</SelectItem>
                  {uniqueTraders.map((trader) => (
                    <SelectItem key={trader.address} value={trader.address}>
                      {trader.alias || `${trader.address.slice(0, 6)}...`}
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
            </div>
            {(cryptoFilter ||
              traderFilter ||
              selectedCrypto !== "all" ||
              selectedTrader !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCryptoFilter("");
                  setTraderFilter("");
                  setSelectedCrypto("all");
                  setSelectedTrader("all");
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Positions and Orders Tabs */}
      <Tabs defaultValue="positions" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="positions">
            Visible Positions ({visiblePositions.length})
          </TabsTrigger>
          <TabsTrigger value="hidden">
            Hidden Positions ({hiddenPositionsList.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            Open Orders ({openOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : visiblePositions.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No visible positions found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Size USD</TableHead>
                      <TableHead className="text-right">Entry Price</TableHead>
                      <TableHead className="text-right">
                        Current Price
                      </TableHead>
                      <TableHead className="text-right">Leverage</TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead className="text-right">Liq. Price</TableHead>
                      <TableHead>Trader</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePositions.map((position) => (
                      <PositionRow
                        key={position.positionKey}
                        position={position}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hidden">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : hiddenPositionsList.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <EyeOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hidden positions.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Size USD</TableHead>
                      <TableHead className="text-right">Entry Price</TableHead>
                      <TableHead className="text-right">
                        Current Price
                      </TableHead>
                      <TableHead className="text-right">Leverage</TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead className="text-right">Liq. Price</TableHead>
                      <TableHead>Trader</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hiddenPositionsList.map((position) => (
                      <PositionRow
                        key={position.positionKey}
                        position={position}
                        isHidden={true}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              {ordersLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : openOrders.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No open orders found.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Limit Price</TableHead>
                      <TableHead className="text-center">Reduce Only</TableHead>
                      <TableHead className="text-center">
                        Has Position
                      </TableHead>
                      <TableHead>Trader</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openOrders.map((order) => (
                      <OrderRow key={order.orderKey} order={order} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PositionTable;
