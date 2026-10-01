export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      cards: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          id: string;
          kind: number;
          sent_at: string;
          subscription_id: string;
          target_date: string;
        };
        Insert: {
          id?: string;
          kind: number;
          sent_at?: string;
          subscription_id: string;
          target_date: string;
        };
        Update: {
          id?: string;
          kind?: number;
          sent_at?: string;
          subscription_id?: string;
          target_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_logs_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_history: {
        Row: {
          amount: number;
          billed_on: string;
          created_at: string;
          id: string;
          subscription_id: string;
        };
        Insert: {
          amount: number;
          billed_on: string;
          created_at?: string;
          id?: string;
          subscription_id: string;
        };
        Update: {
          amount?: number;
          billed_on?: string;
          created_at?: string;
          id?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_history_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          notify_days: number[];
          notify_email: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          notify_days?: number[];
          notify_email?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          notify_days?: number[];
          notify_email?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          amount: number;
          billing_anchor_day: number;
          cancel_url: string | null;
          card_id: string | null;
          created_at: string;
          cycle: Database["public"]["Enums"]["subscription_cycle"];
          cycle_days: number | null;
          id: string;
          is_trial: boolean;
          memo: string | null;
          next_billing_date: string;
          service_name: string;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          billing_anchor_day: number;
          cancel_url?: string | null;
          card_id?: string | null;
          created_at?: string;
          cycle: Database["public"]["Enums"]["subscription_cycle"];
          cycle_days?: number | null;
          id?: string;
          is_trial?: boolean;
          memo?: string | null;
          next_billing_date: string;
          service_name: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          billing_anchor_day?: number;
          cancel_url?: string | null;
          card_id?: string | null;
          created_at?: string;
          cycle?: Database["public"]["Enums"]["subscription_cycle"];
          cycle_days?: number | null;
          id?: string;
          is_trial?: boolean;
          memo?: string | null;
          next_billing_date?: string;
          service_name?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_subscription_with_card: {
        Args: {
          p_amount: number;
          p_billing_anchor_day: number;
          p_cancel_url: string;
          p_card_id: string;
          p_cycle: Database["public"]["Enums"]["subscription_cycle"];
          p_cycle_days: number;
          p_is_trial: boolean;
          p_memo: string;
          p_new_card_name: string;
          p_next_billing_date: string;
          p_service_name: string;
        };
        Returns: {
          amount: number;
          billing_anchor_day: number;
          cancel_url: string | null;
          card_id: string | null;
          created_at: string;
          cycle: Database["public"]["Enums"]["subscription_cycle"];
          cycle_days: number | null;
          id: string;
          is_trial: boolean;
          memo: string | null;
          next_billing_date: string;
          service_name: string;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "subscriptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_subscription_with_card: {
        Args: {
          p_amount: number;
          p_cancel_url: string;
          p_card_id: string;
          p_cycle: Database["public"]["Enums"]["subscription_cycle"];
          p_cycle_days: number;
          p_expected_updated_at: string;
          p_is_trial: boolean;
          p_memo: string;
          p_new_card_name: string;
          p_next_billing_date: string;
          p_service_name: string;
          p_subscription_id: string;
        };
        Returns: {
          amount: number;
          billing_anchor_day: number;
          cancel_url: string | null;
          card_id: string | null;
          created_at: string;
          cycle: Database["public"]["Enums"]["subscription_cycle"];
          cycle_days: number | null;
          id: string;
          is_trial: boolean;
          memo: string | null;
          next_billing_date: string;
          service_name: string;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "subscriptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      subscription_cycle: "monthly" | "yearly" | "weekly" | "custom_days";
      subscription_status: "active" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      subscription_cycle: ["monthly", "yearly", "weekly", "custom_days"],
      subscription_status: ["active", "cancelled"],
    },
  },
} as const;
