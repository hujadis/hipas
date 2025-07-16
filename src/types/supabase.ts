export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      hidden_positions: {
        Row: {
          created_at: string | null
          id: string
          position_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          position_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          position_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_emails: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          address: string
          asset: string
          created_at: string | null
          entry_price: number
          id: string
          notification_sent: boolean | null
          side: string
          size: number
        }
        Insert: {
          address: string
          asset: string
          created_at?: string | null
          entry_price: number
          id?: string
          notification_sent?: boolean | null
          side: string
          size: number
        }
        Update: {
          address?: string
          asset?: string
          created_at?: string | null
          entry_price?: number
          id?: string
          notification_sent?: boolean | null
          side?: string
          size?: number
        }
        Relationships: []
      }
      position_history: {
        Row: {
          address: string
          asset: string
          closed_at: string | null
          created_at: string | null
          entry_price: number
          exit_price: number | null
          holding_duration_minutes: number | null
          id: string
          leverage: number | null
          opened_at: string
          pnl: number | null
          pnl_percentage: number | null
          position_key: string
          side: string
          size: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          asset: string
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          exit_price?: number | null
          holding_duration_minutes?: number | null
          id?: string
          leverage?: number | null
          opened_at: string
          pnl?: number | null
          pnl_percentage?: number | null
          position_key: string
          side: string
          size: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          asset?: string
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          exit_price?: number | null
          holding_duration_minutes?: number | null
          id?: string
          leverage?: number | null
          opened_at?: string
          pnl?: number | null
          pnl_percentage?: number | null
          position_key?: string
          side?: string
          size?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tracked_positions: {
        Row: {
          address: string
          asset: string
          closed_at: string | null
          created_at: string | null
          entry_price: number
          final_pnl: number | null
          holding_duration_minutes: number | null
          id: string
          is_active: boolean | null
          last_updated: string | null
          leverage: number | null
          position_key: string
          side: string
          size: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address: string
          asset: string
          closed_at?: string | null
          created_at?: string | null
          entry_price: number
          final_pnl?: number | null
          holding_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          leverage?: number | null
          position_key: string
          side: string
          size: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          asset?: string
          closed_at?: string | null
          created_at?: string | null
          entry_price?: number
          final_pnl?: number | null
          holding_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          leverage?: number | null
          position_key?: string
          side?: string
          size?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      wallet_addresses: {
        Row: {
          address: string
          alias: string | null
          color: string | null
          created_at: string | null
          id: string
          notifications_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          address: string
          alias?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          alias?: string | null
          color?: string | null
          created_at?: string | null
          id?: string
          notifications_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
