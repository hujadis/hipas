import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Trash2, Plus, Bell, BellOff } from "lucide-react";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";

interface AddressWithAlias {
  address: string;
  alias?: string;
  color?: string;
  notifications_enabled?: boolean;
}

interface AddressManagementProps {
  addresses?: AddressWithAlias[];
  onAddAddress?: (address: string, alias?: string, color?: string) => void;
  onRemoveAddress?: (address: string) => void;
  onUpdateAlias?: (address: string, alias: string, color?: string) => void;
  onToggleNotifications?: (address: string, enabled: boolean) => void;
}

const AddressManagement: React.FC<AddressManagementProps> = ({
  addresses = [],
  onAddAddress = () => {},
  onRemoveAddress = () => {},
  onUpdateAlias = () => {},
  onToggleNotifications = () => {},
}) => {
  const [newAddress, setNewAddress] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [addressToRemove, setAddressToRemove] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [tempAlias, setTempAlias] = useState("");
  const [tempColor, setTempColor] = useState("#3b82f6");
  const [error, setError] = useState<string | null>(null);

  const handleAddAddress = () => {
    console.log("🔍 Attempting to add address:", {
      newAddress,
      newAlias,
      newColor,
    });

    if (!newAddress.trim()) {
      setError("Please enter a valid address");
      return;
    }

    // Basic validation - check if address is already in the list
    if (addresses.find((addr) => addr.address === newAddress.trim())) {
      setError("Address already exists");
      return;
    }

    // Basic format validation (could be enhanced with more specific Hyperliquid address validation)
    if (newAddress.trim().length < 10) {
      setError("Address appears to be invalid");
      return;
    }

    console.log("✅ Validation passed, calling onAddAddress");
    onAddAddress(newAddress.trim(), newAlias.trim() || undefined, newColor);
    setNewAddress("");
    setNewAlias("");
    setNewColor("#3b82f6");
    setError(null);
  };

  const handleRemoveClick = (address: string) => {
    setAddressToRemove(address);
    setIsDialogOpen(true);
  };

  const confirmRemove = () => {
    if (addressToRemove) {
      onRemoveAddress(addressToRemove);
      setAddressToRemove(null);
    }
    setIsDialogOpen(false);
  };

  const handleEditAlias = (
    address: string,
    currentAlias?: string,
    currentColor?: string,
  ) => {
    setEditingAlias(address);
    setTempAlias(currentAlias || "");
    setTempColor(currentColor || "#3b82f6");
  };

  const handleSaveAlias = (address: string) => {
    onUpdateAlias(address, tempAlias, tempColor);
    setEditingAlias(null);
    setTempAlias("");
    setTempColor("#3b82f6");
  };

  const handleCancelEdit = () => {
    setEditingAlias(null);
    setTempAlias("");
    setTempColor("#3b82f6");
  };

  return (
    <Card className="w-full bg-background">
      <CardHeader>
        <CardTitle className="text-xl font-medium">
          Address Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col space-y-2">
            <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
              <div className="relative flex-grow">
                <Input
                  placeholder="Enter Hyperliquid wallet address"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full"
                />
                {error && (
                  <p className="text-xs text-destructive mt-1 absolute">
                    {error}
                  </p>
                )}
              </div>
              <Input
                placeholder="Alias (optional)"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                className="w-full sm:w-32"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-10 h-10 rounded border cursor-pointer"
                  title="Choose alias color"
                />
              </div>
              <Button onClick={handleAddAddress} className="whitespace-nowrap">
                <Plus className="h-4 w-4 mr-2" />
                Add Address
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium mb-2">
              Tracked Addresses ({addresses.length})
            </h3>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No addresses added yet. Add an address to start tracking
                positions.
              </p>
            ) : (
              <div className="space-y-2">
                {addresses.map((addressObj) => (
                  <div
                    key={addressObj.address}
                    className="flex items-center justify-between p-3 rounded-md border bg-card"
                  >
                    <div className="flex-grow space-y-1">
                      {editingAlias === addressObj.address ? (
                        <div className="flex items-center space-x-2">
                          <Input
                            value={tempAlias}
                            onChange={(e) => setTempAlias(e.target.value)}
                            placeholder="Enter alias"
                            className="h-8 text-sm"
                          />
                          <input
                            type="color"
                            value={tempColor}
                            onChange={(e) => setTempColor(e.target.value)}
                            className="w-8 h-8 rounded border cursor-pointer"
                            title="Choose alias color"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSaveAlias(addressObj.address)}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCancelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {addressObj.alias && (
                            <div className="flex items-center space-x-2">
                              <div className="flex items-center space-x-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{
                                    backgroundColor:
                                      addressObj.color || "#3b82f6",
                                  }}
                                ></div>
                                <span className="text-sm font-medium">
                                  {addressObj.alias}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  handleEditAlias(
                                    addressObj.address,
                                    addressObj.alias,
                                    addressObj.color,
                                  )
                                }
                              >
                                Edit
                              </Button>
                            </div>
                          )}
                          <div className="flex items-center space-x-2">
                            <Badge
                              variant="outline"
                              className="font-mono text-xs py-1 px-2 overflow-hidden text-ellipsis"
                            >
                              {addressObj.address}
                            </Badge>
                            {!addressObj.alias && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  handleEditAlias(addressObj.address)
                                }
                              >
                                Add Alias
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-2">
                              {addressObj.notifications_enabled ? (
                                <Bell className="h-3 w-3 text-green-500" />
                              ) : (
                                <BellOff className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                Notifications
                              </span>
                            </div>
                            <Switch
                              checked={addressObj.notifications_enabled ?? true}
                              onCheckedChange={(checked) => {
                                console.log("🔔 Toggle notifications:", {
                                  address: addressObj.address,
                                  checked,
                                });
                                onToggleNotifications(
                                  addressObj.address,
                                  checked,
                                );
                              }}
                              className="scale-75"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <AlertDialog
                      open={
                        isDialogOpen && addressToRemove === addressObj.address
                      }
                      onOpenChange={setIsDialogOpen}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 ml-2"
                          onClick={() => handleRemoveClick(addressObj.address)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove Address</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove this address? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={confirmRemove}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddressManagement;
