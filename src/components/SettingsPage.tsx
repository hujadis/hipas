import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Mail, Upload, ArrowLeft, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getNotificationEmails,
  addNotificationEmail,
  removeNotificationEmail,
  sendTestNotification,
} from "@/lib/database";
import { NotificationEmail } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

interface SettingsPageProps {
  onBack?: () => void;
}

const SettingsPage = ({ onBack }: SettingsPageProps) => {
  const [emails, setEmails] = useState<NotificationEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [emailToRemove, setEmailToRemove] = useState<string | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const navigate = useNavigate();

  // Load emails on component mount
  useEffect(() => {
    const loadEmails = async () => {
      try {
        const notificationEmails = await getNotificationEmails();
        setEmails(notificationEmails);
      } catch (error) {
        console.error("Error loading emails:", error);
        setError("Failed to load notification emails");
      } finally {
        setLoading(false);
      }
    };

    loadEmails();
  }, []);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = async () => {
    if (!newEmail.trim()) {
      setError("Please enter a valid email address");
      return;
    }

    if (!validateEmail(newEmail.trim())) {
      setError("Please enter a valid email format");
      return;
    }

    // Check if email already exists
    if (emails.find((email) => email.email === newEmail.trim())) {
      setError("Email already exists");
      return;
    }

    try {
      const addedEmail = await addNotificationEmail(newEmail.trim());
      if (addedEmail) {
        setEmails([...emails, addedEmail]);
        setNewEmail("");
        setError(null);
        setIsDialogOpen(false);
      } else {
        setError("Failed to add email");
      }
    } catch (error) {
      console.error("Error adding email:", error);
      setError("Failed to add email");
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkEmails.trim()) {
      setError("Please enter email addresses");
      return;
    }

    const emailList = bulkEmails
      .split(/[\n,;]/) // Split by newline, comma, or semicolon
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    if (emailList.length === 0) {
      setError("No valid emails found");
      return;
    }

    const invalidEmails = emailList.filter((email) => !validateEmail(email));
    if (invalidEmails.length > 0) {
      setError(`Invalid email format: ${invalidEmails.join(", ")}`);
      return;
    }

    const existingEmails = emailList.filter((email) =>
      emails.find((e) => e.email === email),
    );
    if (existingEmails.length > 0) {
      setError(`Email(s) already exist: ${existingEmails.join(", ")}`);
      return;
    }

    try {
      const addedEmails: NotificationEmail[] = [];
      for (const email of emailList) {
        const addedEmail = await addNotificationEmail(email);
        if (addedEmail) {
          addedEmails.push(addedEmail);
        }
      }

      if (addedEmails.length > 0) {
        setEmails([...emails, ...addedEmails]);
        setBulkEmails("");
        setError(null);
        setIsBulkDialogOpen(false);
      } else {
        setError("Failed to add emails");
      }
    } catch (error) {
      console.error("Error adding bulk emails:", error);
      setError("Failed to add emails");
    }
  };

  const handleRemoveClick = (email: string) => {
    setEmailToRemove(email);
    setIsAlertOpen(true);
  };

  const confirmRemove = async () => {
    if (emailToRemove) {
      try {
        const success = await removeNotificationEmail(emailToRemove);
        if (success) {
          setEmails(emails.filter((email) => email.email !== emailToRemove));
          setEmailToRemove(null);
        } else {
          setError("Failed to remove email");
        }
      } catch (error) {
        console.error("Error removing email:", error);
        setError("Failed to remove email");
      }
    }
    setIsAlertOpen(false);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate("/");
    }
  };

  const handleTestNotification = async () => {
    console.log("🧪 Test notification button clicked");

    if (emails.length === 0) {
      console.warn("❌ No emails configured for test");
      setError("Please add at least one email address before testing");
      return;
    }

    console.log(
      `📧 Testing with ${emails.length} email(s):`,
      emails.map((e) => e.email),
    );

    setTestLoading(true);
    setError(null);
    setTestSuccess(false);

    try {
      console.log("🚀 Calling sendTestNotification function...");
      const success = await sendTestNotification();
      console.log("📬 sendTestNotification result:", success);

      if (success) {
        console.log("✅ Test notification sent successfully");
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 5000); // Clear success message after 5 seconds
      } else {
        console.error("❌ Test notification failed - function returned false");
        setError(
          "Failed to send test notification. Check console for details.",
        );
      }
    } catch (error) {
      console.error("💥 Error in handleTestNotification:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
        error,
      });
      setError(
        `Failed to send test notification: ${error.message || "Unknown error"}`,
      );
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        </div>

        {/* Notification Email Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Mail className="h-5 w-5" />
              <span>Notification Emails</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Manage email addresses that will receive notifications when new
                positions are detected.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Email
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Notification Email</DialogTitle>
                      <DialogDescription>
                        Enter an email address to receive position
                        notifications.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="example@domain.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              handleAddEmail();
                            }
                          }}
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsDialogOpen(false);
                          setNewEmail("");
                          setError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleAddEmail}>Add Email</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isBulkDialogOpen}
                  onOpenChange={setIsBulkDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Bulk Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Bulk Add Emails</DialogTitle>
                      <DialogDescription>
                        Enter multiple email addresses separated by commas,
                        semicolons, or new lines.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="bulk-emails">Email Addresses</Label>
                        <Textarea
                          id="bulk-emails"
                          placeholder="email1@domain.com&#10;email2@domain.com&#10;email3@domain.com"
                          value={bulkEmails}
                          onChange={(e) => setBulkEmails(e.target.value)}
                          rows={6}
                        />
                      </div>
                      {error && (
                        <p className="text-sm text-destructive">{error}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsBulkDialogOpen(false);
                          setBulkEmails("");
                          setError(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleBulkAdd}>Add Emails</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="secondary"
                  onClick={handleTestNotification}
                  disabled={testLoading || emails.length === 0}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {testLoading ? "Sending..." : "Test Send"}
                </Button>
              </div>

              {/* Test Success Message */}
              {testSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">
                    ✅ Test notification sent successfully! Check the console
                    for details.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Email List */}
              <div className="mt-6">
                <h3 className="text-sm font-medium mb-2">
                  Active Email Addresses ({emails.length})
                </h3>
                {emails.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No notification emails configured. Add email addresses to
                    receive position alerts.
                  </p>
                ) : (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email Address</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Added</TableHead>
                          <TableHead className="w-[100px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emails.map((email) => (
                          <TableRow key={email.id}>
                            <TableCell className="font-medium">
                              {email.email}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  email.is_active ? "default" : "secondary"
                                }
                              >
                                {email.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(email.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <AlertDialog
                                open={
                                  isAlertOpen && emailToRemove === email.email
                                }
                                onOpenChange={setIsAlertOpen}
                              >
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() =>
                                      handleRemoveClick(email.email)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Remove Email
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to remove{" "}
                                      <strong>{email.email}</strong> from
                                      notifications? This action cannot be
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
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Settings Card (for future features) */}
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Additional settings will be available here in future updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SettingsPage;
