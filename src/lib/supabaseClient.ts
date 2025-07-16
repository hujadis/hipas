import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.",
  );
}

// Create Supabase client with proper typing
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
console.log("✅ Supabase client initialized successfully");

export { supabase };

// Database types using Supabase generated types
export type WalletAddress =
  Database["public"]["Tables"]["wallet_addresses"]["Row"] & {
    notifications_enabled?: boolean;
  };

export type TrackedPosition =
  Database["public"]["Tables"]["tracked_positions"]["Row"];

export type NotificationLog =
  Database["public"]["Tables"]["notification_logs"]["Row"];

export type NotificationEmail =
  Database["public"]["Tables"]["notification_emails"]["Row"];

export type HiddenPosition =
  Database["public"]["Tables"]["hidden_positions"]["Row"];

export type PositionHistory =
  Database["public"]["Tables"]["position_history"]["Row"];

export type PositionHistoryInsert =
  Database["public"]["Tables"]["position_history"]["Insert"];

export type PositionHistoryUpdate =
  Database["public"]["Tables"]["position_history"]["Update"];
