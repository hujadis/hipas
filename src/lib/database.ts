import {
  supabase,
  WalletAddress,
  TrackedPosition,
  NotificationLog,
  NotificationEmail,
  PositionHistory,
  PositionHistoryInsert,
  PositionHistoryUpdate,
} from "./supabaseClient";

// Wallet Address Management
export const getWalletAddresses = async (): Promise<WalletAddress[]> => {
  const { data, error } = await supabase
    .from("wallet_addresses")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching wallet addresses:", error);
    return [];
  }

  return data || [];
};

export const addWalletAddress = async (
  address: string,
  alias?: string,
  color?: string,
): Promise<WalletAddress | null> => {
  console.log("🔍 Adding wallet address:", { address, alias, color });

  const { data, error } = await supabase
    .from("wallet_addresses")
    .insert({
      address,
      alias,
      color,
      notifications_enabled: true, // Enable notifications by default
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Error adding wallet address:", error);
    throw error;
  }

  console.log("✅ Successfully added wallet address:", data);
  return data;
};

export const updateWalletAddress = async (
  address: string,
  alias: string,
  color?: string,
): Promise<WalletAddress | null> => {
  const { data, error } = await supabase
    .from("wallet_addresses")
    .update({
      alias,
      color,
      updated_at: new Date().toISOString(),
    })
    .eq("address", address)
    .select()
    .single();

  if (error) {
    console.error("Error updating wallet address:", error);
    return null;
  }

  return data;
};

export const updateWalletNotifications = async (
  address: string,
  notificationsEnabled: boolean,
): Promise<WalletAddress | null> => {
  console.log("🔔 Updating wallet notifications:", {
    address,
    notificationsEnabled,
  });

  const { data, error } = await supabase
    .from("wallet_addresses")
    .update({
      notifications_enabled: notificationsEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("address", address)
    .select()
    .single();

  if (error) {
    console.error("❌ Error updating wallet notifications:", error);
    throw error;
  }

  console.log("✅ Successfully updated wallet notifications:", data);
  return data;
};

export const removeWalletAddress = async (
  address: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from("wallet_addresses")
    .delete()
    .eq("address", address);

  if (error) {
    console.error("Error removing wallet address:", error);
    return false;
  }

  return true;
};

// Position Tracking
export const getTrackedPositions = async (
  status?: string,
): Promise<TrackedPosition[]> => {
  let query = supabase.from("tracked_positions").select("*");

  if (status) {
    query = query.eq("status", status);
  } else {
    // Get active positions (either status is 'active' or 'new', and is_active is true or null)
    query = query
      .or("status.eq.active,status.eq.new")
      .or("is_active.eq.true,is_active.is.null");
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching tracked positions:", error);
    return [];
  }

  return data || [];
};

export const getNewPositions = async (
  hours: number = 1,
): Promise<TrackedPosition[]> => {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hours);

  const { data, error } = await supabase
    .from("tracked_positions")
    .select("*")
    .eq("status", "new")
    .gte("created_at", cutoffTime.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching new positions:", error);
    return [];
  }

  return data || [];
};

export const getClosedPositions = async (): Promise<TrackedPosition[]> => {
  const { data, error } = await supabase
    .from("tracked_positions")
    .select("*")
    .eq("status", "closed")
    .order("closed_at", { ascending: false });

  if (error) {
    console.error("Error fetching closed positions:", error);
    return [];
  }

  return data || [];
};

export const getAllTrackedPositions = async (): Promise<TrackedPosition[]> => {
  const { data, error } = await supabase
    .from("tracked_positions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching all tracked positions:", error);
    return [];
  }

  return data || [];
};

export const upsertTrackedPosition = async (
  position: Omit<TrackedPosition, "id" | "created_at">,
): Promise<TrackedPosition | null> => {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tracked_positions")
    .upsert(
      {
        ...position,
        updated_at: now,
        last_updated: now,
        status: position.status || "active",
        is_active: position.status !== "closed", // Ensure is_active is consistent with status
      },
      {
        onConflict: "position_key",
      },
    )
    .select()
    .single();

  if (error) {
    console.error("Error upserting tracked position:", error);
    return null;
  }

  return data;
};

export const closeTrackedPosition = async (
  positionKey: string,
  finalPnl: number,
  exitPrice: number,
): Promise<TrackedPosition | null> => {
  const now = new Date();

  // First get the existing position to calculate holding duration
  const { data: existingPosition } = await supabase
    .from("tracked_positions")
    .select("*")
    .eq("position_key", positionKey)
    .single();

  if (!existingPosition) {
    console.error("Position not found for closing:", positionKey);
    return null;
  }

  const createdAt = new Date(existingPosition.created_at || now);
  const holdingDurationMinutes = Math.floor(
    (now.getTime() - createdAt.getTime()) / (1000 * 60),
  );

  const { data, error } = await supabase
    .from("tracked_positions")
    .update({
      status: "closed",
      closed_at: now.toISOString(),
      final_pnl: finalPnl,
      holding_duration_minutes: holdingDurationMinutes,
      is_active: false,
      last_updated: now.toISOString(),
    })
    .eq("position_key", positionKey)
    .select()
    .single();

  if (error) {
    console.error("Error closing tracked position:", error);
    return null;
  }

  // Also add to position history
  await addToPositionHistory({
    address: existingPosition.address,
    asset: existingPosition.asset,
    size: existingPosition.size,
    entry_price: existingPosition.entry_price,
    exit_price: exitPrice,
    side: existingPosition.side,
    leverage: existingPosition.leverage,
    pnl: finalPnl,
    pnl_percentage:
      existingPosition.entry_price > 0
        ? (finalPnl /
            (Math.abs(existingPosition.size) * existingPosition.entry_price)) *
          100
        : 0,
    holding_duration_minutes: holdingDurationMinutes,
    opened_at: existingPosition.created_at || now.toISOString(),
    closed_at: now.toISOString(),
    status: "closed",
    position_key: positionKey,
  });

  return data;
};

export const markPositionInactive = async (
  address: string,
  asset: string,
): Promise<boolean> => {
  const positionKey = `${address}-${asset}`;
  const { error } = await supabase
    .from("tracked_positions")
    .update({
      is_active: false,
      status: "closed",
      closed_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })
    .eq("position_key", positionKey);

  if (error) {
    console.error("Error marking position inactive:", error);
    return false;
  }

  return true;
};

// Position History Management
export const getPositionHistory = async (
  address?: string,
): Promise<PositionHistory[]> => {
  let query = supabase.from("position_history").select("*");

  if (address) {
    query = query.eq("address", address);
  }

  const { data, error } = await query.order("closed_at", { ascending: false });

  if (error) {
    console.error("Error fetching position history:", error);
    return [];
  }

  return data || [];
};

export const addToPositionHistory = async (
  position: PositionHistoryInsert,
): Promise<PositionHistory | null> => {
  const { data, error } = await supabase
    .from("position_history")
    .insert(position)
    .select()
    .single();

  if (error) {
    console.error("Error adding to position history:", error);
    return null;
  }

  return data;
};

// Analytics Functions
export const getPositionAnalytics = async (address?: string) => {
  let query = supabase.from("tracked_positions").select("*");

  if (address) {
    query = query.eq("address", address);
  }

  const { data: positions, error } = await query;

  if (error) {
    console.error("Error fetching position analytics:", error);
    return null;
  }

  const activePositions = positions?.filter((p) => p.status === "active") || [];
  const closedPositions = positions?.filter((p) => p.status === "closed") || [];
  const newPositions =
    positions?.filter((p) => {
      if (p.status !== "new") return false;
      const createdAt = new Date(p.created_at || "");
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      return createdAt > oneHourAgo;
    }) || [];

  const totalPnl = closedPositions.reduce(
    (sum, p) => sum + (p.final_pnl || 0),
    0,
  );
  const winningPositions = closedPositions.filter(
    (p) => (p.final_pnl || 0) > 0,
  );
  const losingPositions = closedPositions.filter((p) => (p.final_pnl || 0) < 0);
  const winRate =
    closedPositions.length > 0
      ? (winningPositions.length / closedPositions.length) * 100
      : 0;

  const avgHoldingTime =
    closedPositions.length > 0
      ? closedPositions.reduce(
          (sum, p) => sum + (p.holding_duration_minutes || 0),
          0,
        ) / closedPositions.length
      : 0;

  return {
    totalPositions: positions?.length || 0,
    activePositions: activePositions.length,
    closedPositions: closedPositions.length,
    newPositions: newPositions.length,
    totalPnl,
    winRate,
    avgHoldingTimeMinutes: avgHoldingTime,
    winningPositions: winningPositions.length,
    losingPositions: losingPositions.length,
  };
};

// Notification Management
export const logNotification = async (
  notification: Omit<NotificationLog, "id" | "created_at">,
): Promise<NotificationLog | null> => {
  const { data, error } = await supabase
    .from("notification_logs")
    .insert(notification)
    .select()
    .single();

  if (error) {
    console.error("Error logging notification:", error);
    return null;
  }

  return data;
};

// Email Management
export const getNotificationEmails = async (): Promise<NotificationEmail[]> => {
  const { data, error } = await supabase
    .from("notification_emails")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching notification emails:", error);
    return [];
  }

  return data || [];
};

export const addNotificationEmail = async (
  email: string,
): Promise<NotificationEmail | null> => {
  const { data, error } = await supabase
    .from("notification_emails")
    .insert({
      email,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("Error adding notification email:", error);
    return null;
  }

  return data;
};

export const removeNotificationEmail = async (
  email: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from("notification_emails")
    .update({ is_active: false })
    .eq("email", email);

  if (error) {
    console.error("Error removing notification email:", error);
    return false;
  }

  return true;
};

// Send position notification using Supabase Edge Function
export const sendPositionNotification = async (
  address: string,
  asset: string,
  side: "LONG" | "SHORT",
  size: number,
  entryPrice: number,
  alias?: string,
): Promise<boolean> => {
  try {
    // Get notification emails
    const emails = await getNotificationEmails();

    if (emails.length === 0) {
      console.warn("No notification emails configured");
      return false;
    }

    const displayAddress =
      alias || `${address.slice(0, 6)}...${address.slice(-4)}`;
    const sideColor = side === "LONG" ? "#22c55e" : "#ef4444";
    const sizeDisplay = size > 0 ? `+${size}` : size.toString();

    const emailData = {
      to: emails.map((e) => e.email),
      subject: `🚨 New ${side} Position: ${asset} - ${displayAddress}`,
      html: `
        <h2 style="color: ${sideColor};">🚨 New ${side} Position Detected</h2>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Position Details:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Address:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${displayAddress}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Asset:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${asset}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Side:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6; color: ${sideColor};"><strong>${side}</strong></td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;"><strong>Size:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #dee2e6;">${sizeDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 8px;"><strong>Entry Price:</strong></td>
              <td style="padding: 8px;">${entryPrice.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        <p style="color: #6c757d; font-size: 14px;"><em>Detected at: ${new Date().toLocaleString()}</em></p>
        <hr style="margin: 20px 0;">
        <p style="font-size: 12px; color: #6c757d;">This notification was sent by your Hyperliquid Position Tracker.</p>
      `,
      text: `
        🚨 New ${side} Position Detected
        
        Position Details:
        - Address: ${displayAddress}
        - Asset: ${asset}
        - Side: ${side}
        - Size: ${sizeDisplay}
        - Entry Price: ${entryPrice.toLocaleString()}
        
        Detected at: ${new Date().toLocaleString()}
        
        This notification was sent by your Hyperliquid Position Tracker.
      `,
      type: "position_alert",
    };

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke(
      "supabase-functions-send-email",
      {
        body: emailData,
      },
    );

    if (error) {
      console.error("Error calling send-email function:", error);
      // Still log the notification even if email fails
      await logNotification({
        address,
        asset,
        side,
        size,
        entry_price: entryPrice,
        notification_sent: false,
      });
      return false;
    }

    // Log the successful notification
    await logNotification({
      address,
      asset,
      side,
      size,
      entry_price: entryPrice,
      notification_sent: true,
    });

    console.log("🚨 NEW POSITION NOTIFICATION SENT:", data);
    return true;
  } catch (error) {
    console.error("Error sending notification:", error);
    // Log the failed notification
    try {
      await logNotification({
        address,
        asset,
        side,
        size,
        entry_price: entryPrice,
        notification_sent: false,
      });
    } catch (logError) {
      console.error("Error logging notification:", logError);
    }
    return false;
  }
};

// Hidden Positions Management
export const getHiddenPositions = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from("hidden_positions")
    .select("position_key")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching hidden positions:", error);
    return [];
  }

  return data?.map((item) => item.position_key) || [];
};

export const addHiddenPosition = async (
  positionKey: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from("hidden_positions")
    .insert({ position_key: positionKey });

  if (error) {
    console.error("Error adding hidden position:", error);
    return false;
  }

  return true;
};

export const removeHiddenPosition = async (
  positionKey: string,
): Promise<boolean> => {
  const { error } = await supabase
    .from("hidden_positions")
    .delete()
    .eq("position_key", positionKey);

  if (error) {
    console.error("Error removing hidden position:", error);
    return false;
  }

  return true;
};

// Send test notification using Supabase Edge Function
export const sendTestNotification = async (): Promise<boolean> => {
  try {
    // Get notification emails
    const emails = await getNotificationEmails();

    if (emails.length === 0) {
      console.warn("No notification emails configured for test");
      return false;
    }

    const testEmailData = {
      to: emails.map((e) => e.email),
      subject: "Test Notification - Hyperliquid Position Tracker",
      html: `
        <h2>🚨 Test Notification</h2>
        <p>This is a test notification from your Hyperliquid Position Tracker.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h3>Sample Position Data:</h3>
          <ul>
            <li><strong>Address:</strong> 0x1234...5678</li>
            <li><strong>Asset:</strong> ETH</li>
            <li><strong>Side:</strong> LONG</li>
            <li><strong>Size:</strong> 1.5</li>
            <li><strong>Entry Price:</strong> $2,500.00</li>
          </ul>
        </div>
        <p><em>Sent at: ${new Date().toISOString()}</em></p>
      `,
      text: `
        Test Notification - Hyperliquid Position Tracker
        
        This is a test notification from your Hyperliquid Position Tracker.
        
        Sample Position Data:
        - Address: 0x1234...5678
        - Asset: ETH
        - Side: LONG
        - Size: 1.5
        - Entry Price: $2,500.00
        
        Sent at: ${new Date().toISOString()}
      `,
      type: "test",
    };

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke(
      "supabase-functions-send-email",
      {
        body: testEmailData,
      },
    );

    if (error) {
      console.error("Error calling send-email function:", error);
      return false;
    }

    console.log("✅ TEST NOTIFICATION SENT SUCCESSFULLY:", data);
    return true;
  } catch (error) {
    console.error("Error sending test notification:", error);
    return false;
  }
};
