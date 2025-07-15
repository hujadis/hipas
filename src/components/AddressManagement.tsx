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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Trash2, Plus, Bell, BellOff, Users } from "lucide-react";
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
            {addresses.length === 0 ? (
              <div className="text-center py-4">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No addresses added yet. Add an address to start tracking
                  positions.
                </p>
              </div>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="addresses">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>Tracked Addresses ({addresses.length})</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                      {addresses.map((addressObj) => (
                        <div
                          key={addressObj.address}
                          className="flex items-center justify-between p-2 rounded-md border bg-card/50 hover:bg-card transition-colors"
                        >
                          <div className="flex-grow min-w-0">
                            {editingAlias === addressObj.address ? (
                              <div className="flex items-center space-x-2">
                                <Input
                                  value={tempAlias}
                                  onChange={(e) => setTempAlias(e.target.value)}
                                  placeholder="Enter alias"
                                  className="h-7 text-sm flex-1"
                                />
                                <input
                                  type="color"
                                  value={tempColor}
                                  onChange={(e) => setTempColor(e.target.value)}
                                  className="w-7 h-7 rounded border cursor-pointer"
                                  title="Choose alias color"
                                />
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleSaveAlias(addressObj.address)
                                  }
                                  className="h-7 px-2 text-xs"
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                  className="h-7 px-2 text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                                    {addressObj.alias ? (
                                      <div className="flex items-center space-x-2 min-w-0">
                                        <div
                                          className="w-2 h-2 rounded-full flex-shrink-0"
                                          style={{
                                            backgroundColor:
                                              addressObj.color || "#3b82f6",
                                          }}
                                        ></div>
                                        <span className="text-sm font-medium truncate">
                                          {addressObj.alias}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 px-1 text-xs flex-shrink-0"
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
                                    ) : (
                                      <div className="flex items-center space-x-2">
                                        <Badge
                                          variant="outline"
                                          className="font-mono text-xs py-0.5 px-1 truncate max-w-32"
                                        >
                                          {`${addressObj.address.slice(0, 6)}...${addressObj.address.slice(-4)}`}
                                        </Badge>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-5 px-1 text-xs"
                                          onClick={() =>
                                            handleEditAlias(addressObj.address)
                                          }
                                        >
                                          Add Alias
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-1 flex-shrink-0">
                                    <div className="flex items-center space-x-1">
                                      {addressObj.notifications_enabled ? (
                                        <Bell className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <BellOff className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      <Switch
                                        checked={
                                          addressObj.notifications_enabled ??
                                          true
                                        }
                                        onCheckedChange={(checked) => {
                                          console.log(
                                            "🔔 Toggle notifications:",
                                            {
                                              address: addressObj.address,
                                              checked,
                                            },
                                          );
                                          onToggleNotifications(
                                            addressObj.address,
                                            checked,
                                          );
                                        }}
                                        className="scale-75"
                                      />
                                    </div>
                                    <AlertDialog
                                      open={
                                        isDialogOpen &&
                                        addressToRemove === addressObj.address
                                      }
                                      onOpenChange={setIsDialogOpen}
                                    >
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                                          onClick={() =>
                                            handleRemoveClick(
                                              addressObj.address,
                                            )
                                          }
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Remove Address
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to remove this
                                            address? This action cannot be
                                            undone.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>
                                            Cancel
                                          </AlertDialogCancel>
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
                                </div>
                                {addressObj.alias && (
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-xs py-0.5 px-1 truncate max-w-full"
                                  >
                                    {`${addressObj.address.slice(0, 8)}...${addressObj.address.slice(-6)}`}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddressManagement;
