import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThemeToggle from "./ThemeToggle";
import AddressManagement from "./AddressManagement";
import PositionTable from "./PositionTable";
import {
  getWalletAddresses,
  addWalletAddress,
  removeWalletAddress,
  updateWalletAddress,
  updateWalletNotifications,
} from "@/lib/database";
import { WalletAddress } from "@/lib/supabaseClient";

interface AddressWithAlias {
  address: string;
  alias?: string;
  color?: string;
  notifications_enabled?: boolean;
}

const Home = () => {
  const [addresses, setAddresses] = useState<AddressWithAlias[]>([]);
  const [refreshInterval, setRefreshInterval] = useState<30 | 60 | 300>(60); // Default to 1 minute
  const [loading, setLoading] = useState(true);

  // Load addresses from Supabase on component mount
  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const walletAddresses = await getWalletAddresses();
        const formattedAddresses = walletAddresses.map(
          (addr: WalletAddress) => ({
            address: addr.address,
            alias: addr.alias || undefined,
            color: addr.color || undefined,
            notifications_enabled: addr.notifications_enabled,
          }),
        );
        setAddresses(formattedAddresses);
        console.log(
          "✅ Successfully loaded addresses from Supabase:",
          formattedAddresses,
        );
      } catch (error) {
        console.error("❌ Error loading addresses from Supabase:", error);
        throw error; // Don't fallback to localStorage, ensure Supabase is working
      } finally {
        setLoading(false);
      }
    };

    loadAddresses();
  }, []);

  const handleAddAddress = async (
    address: string,
    alias?: string,
    color?: string,
  ) => {
    console.log("🏠 Home: handleAddAddress called with:", {
      address,
      alias,
      color,
    });

    if (!addresses.find((addr) => addr.address === address)) {
      try {
        console.log("🔄 Adding address to Supabase...");
        const newAddress = await addWalletAddress(address, alias, color);
        console.log("📊 Supabase response:", newAddress);

        if (newAddress) {
          const newAddresses = [
            ...addresses,
            {
              address: newAddress.address,
              alias: newAddress.alias || undefined,
              color: newAddress.color || undefined,
              notifications_enabled: newAddress.notifications_enabled,
            },
          ];
          setAddresses(newAddresses);
          console.log(
            "✅ Successfully added address to Supabase and updated state",
          );
        }
      } catch (error) {
        console.error("❌ Error adding address to Supabase:", error);
        alert(
          `Failed to add address: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    } else {
      alert("Address already exists in the list");
    }
  };

  const handleRemoveAddress = async (address: string) => {
    try {
      console.log("🗑️ Removing address from Supabase:", address);
      const success = await removeWalletAddress(address);

      if (success) {
        const newAddresses = addresses.filter(
          (addr) => addr.address !== address,
        );
        setAddresses(newAddresses);
        console.log(
          "✅ Successfully removed address from Supabase and updated state",
        );
      } else {
        throw new Error("Failed to remove address from database");
      }
    } catch (error) {
      console.error("❌ Error removing address from Supabase:", error);
      alert(
        `Failed to remove address: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleUpdateAlias = async (
    address: string,
    alias: string,
    color?: string,
  ) => {
    try {
      console.log("✏️ Updating address in Supabase:", {
        address,
        alias,
        color,
      });
      const updatedAddress = await updateWalletAddress(address, alias, color);

      if (updatedAddress) {
        const newAddresses = addresses.map((addr) =>
          addr.address === address
            ? {
                ...addr,
                alias: updatedAddress.alias || undefined,
                color: updatedAddress.color || undefined,
              }
            : addr,
        );
        setAddresses(newAddresses);
        console.log("✅ Successfully updated address in Supabase and state");
      } else {
        throw new Error("Failed to update address in database");
      }
    } catch (error) {
      console.error("❌ Error updating address in Supabase:", error);
      alert(
        `Failed to update address: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleToggleNotifications = async (
    address: string,
    enabled: boolean,
  ) => {
    console.log("🔔 Updating notifications in Supabase:", {
      address,
      enabled,
    });
    try {
      const updatedAddress = await updateWalletNotifications(address, enabled);

      if (updatedAddress) {
        const newAddresses = addresses.map((addr) =>
          addr.address === address
            ? { ...addr, notifications_enabled: enabled }
            : addr,
        );
        setAddresses(newAddresses);
        console.log(
          "✅ Successfully updated notifications in Supabase and state",
        );
      } else {
        throw new Error("Failed to update notifications in database");
      }
    } catch (error) {
      console.error("❌ Error updating notifications in Supabase:", error);
      alert(
        `Failed to update notifications: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading addresses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with title and theme toggle */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl md:text-3xl font-bold">
            Hyperliquid Position Tracker
          </h1>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = "/settings")}
            >
              Settings
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* Address Management Section */}
        <AddressManagement
          addresses={addresses}
          onAddAddress={handleAddAddress}
          onRemoveAddress={handleRemoveAddress}
          onUpdateAlias={handleUpdateAlias}
          onToggleNotifications={handleToggleNotifications}
        />

        {/* Position Table Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Positions</CardTitle>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                Auto-refresh:
              </span>
              <div className="flex space-x-1">
                <button
                  onClick={() => setRefreshInterval(30)}
                  className={`px-2 py-1 text-xs rounded ${refreshInterval === 30 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  30s
                </button>
                <button
                  onClick={() => setRefreshInterval(60)}
                  className={`px-2 py-1 text-xs rounded ${refreshInterval === 60 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  1m
                </button>
                <button
                  onClick={() => setRefreshInterval(300)}
                  className={`px-2 py-1 text-xs rounded ${refreshInterval === 300 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  5m
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <PositionTable
              addresses={addresses}
              refreshInterval={refreshInterval}
            />
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-sm text-muted-foreground py-4">
          <p>
            Hyperliquid Position Tracker - Data refreshes every{" "}
            {refreshInterval === 60
              ? "1 minute"
              : refreshInterval === 30
                ? "30 seconds"
                : "5 minutes"}
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Home;
