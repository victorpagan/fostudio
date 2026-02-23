export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      cart_items: {
        Row: {
          cart_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          image_url: string | null
          inventory_at_addition: number | null
          price: number
          price_locked_until: string | null
          product_id: string | null
          product_name: string | null
          quantity: number
          taxable: boolean
          variation_id: string
          variation_name: string | null
          weight: number | null
        }
        Insert: {
          cart_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          inventory_at_addition?: number | null
          price?: number
          price_locked_until?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity: number
          taxable?: boolean
          variation_id: string
          variation_name?: string | null
          weight?: number | null
        }
        Update: {
          cart_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          image_url?: string | null
          inventory_at_addition?: number | null
          price?: number
          price_locked_until?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number
          taxable?: boolean
          variation_id?: string
          variation_name?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "active_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_sessions: {
        Row: {
          created_at: string | null
          id: string
          merged: boolean | null
          session_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          merged?: boolean | null
          session_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          merged?: boolean | null
          session_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      carts: {
        Row: {
          created_at: string | null
          id: string
          session_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: Json | null
          created_at: string
          email: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: Json | null
          created_at?: string
          email: string
          id: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: Json | null
          created_at?: string
          email?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      internal_errors: {
        Row: {
          environment: string | null
          file: string | null
          id: string
          is_resolved: boolean
          level: string
          location: string | null
          message: string
          metadata: Json | null
          origin_ip: unknown
          request_id: string | null
          resolved_at: string | null
          session_id: string | null
          stack_trace: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          environment?: string | null
          file?: string | null
          id?: string
          is_resolved?: boolean
          level: string
          location?: string | null
          message: string
          metadata?: Json | null
          origin_ip?: unknown
          request_id?: string | null
          resolved_at?: string | null
          session_id?: string | null
          stack_trace?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          environment?: string | null
          file?: string | null
          id?: string
          is_resolved?: boolean
          level?: string
          location?: string | null
          message?: string
          metadata?: Json | null
          origin_ip?: unknown
          request_id?: string | null
          resolved_at?: string | null
          session_id?: string | null
          stack_trace?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kiosk: {
        Row: {
          category_name: string | null
          display_order: number
          id: number
        }
        Insert: {
          category_name?: string | null
          display_order?: number
          id?: number
        }
        Update: {
          category_name?: string | null
          display_order?: number
          id?: number
        }
        Relationships: []
      }
      links: {
        Row: {
          email: string | null
          expires_date: string | null
          id: string
          link: string | null
          orderId: string | null
          password: string | null
          ssOrderId: number | null
        }
        Insert: {
          email?: string | null
          expires_date?: string | null
          id?: string
          link?: string | null
          orderId?: string | null
          password?: string | null
          ssOrderId?: number | null
        }
        Update: {
          email?: string | null
          expires_date?: string | null
          id?: string
          link?: string | null
          orderId?: string | null
          password?: string | null
          ssOrderId?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          completed: string | null
          created: string
          customerEmail: string | null
          customerId: string | null
          customerName: string | null
          customerPhone: string | null
          id: number
          internalNotes: string | null
          lineItems: Json[] | null
          locationId: string | null
          orderId: string | null
          shipping_status: string | null
          squareOrderJSON: Json | null
          ssOrderId: number | null
          state: string | null
          terminalStatus: string | null
          total: number | null
          type: string | null
        }
        Insert: {
          completed?: string | null
          created?: string
          customerEmail?: string | null
          customerId?: string | null
          customerName?: string | null
          customerPhone?: string | null
          id?: number
          internalNotes?: string | null
          lineItems?: Json[] | null
          locationId?: string | null
          orderId?: string | null
          shipping_status?: string | null
          squareOrderJSON?: Json | null
          ssOrderId?: number | null
          state?: string | null
          terminalStatus?: string | null
          total?: number | null
          type?: string | null
        }
        Update: {
          completed?: string | null
          created?: string
          customerEmail?: string | null
          customerId?: string | null
          customerName?: string | null
          customerPhone?: string | null
          id?: number
          internalNotes?: string | null
          lineItems?: Json[] | null
          locationId?: string | null
          orderId?: string | null
          shipping_status?: string | null
          squareOrderJSON?: Json | null
          ssOrderId?: number | null
          state?: string | null
          terminalStatus?: string | null
          total?: number | null
          type?: string | null
        }
        Relationships: []
      }
      orders2: {
        Row: {
          completed: string | null
          confirmationSent: boolean | null
          created: string
          customerId: string | null
          email: string | null
          id: number
          internalNotes: string | null
          isServiceOrder: boolean | null
          lineItems: Json[] | null
          locationId: string | null
          name: string | null
          orderId: string | null
          phone: string | null
          pickedup: boolean | null
          refunded_amount: number | null
          shipping_status: string | null
          squareOrderJSON: Json | null
          ssOrderId: number | null
          state: string | null
          terminalStatus: string | null
          total: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          completed?: string | null
          confirmationSent?: boolean | null
          created?: string
          customerId?: string | null
          email?: string | null
          id?: number
          internalNotes?: string | null
          isServiceOrder?: boolean | null
          lineItems?: Json[] | null
          locationId?: string | null
          name?: string | null
          orderId?: string | null
          phone?: string | null
          pickedup?: boolean | null
          refunded_amount?: number | null
          shipping_status?: string | null
          squareOrderJSON?: Json | null
          ssOrderId?: number | null
          state?: string | null
          terminalStatus?: string | null
          total?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          completed?: string | null
          confirmationSent?: boolean | null
          created?: string
          customerId?: string | null
          email?: string | null
          id?: number
          internalNotes?: string | null
          isServiceOrder?: boolean | null
          lineItems?: Json[] | null
          locationId?: string | null
          name?: string | null
          orderId?: string | null
          phone?: string | null
          pickedup?: boolean | null
          refunded_amount?: number | null
          shipping_status?: string | null
          squareOrderJSON?: Json | null
          ssOrderId?: number | null
          state?: string | null
          terminalStatus?: string | null
          total?: number | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ordersTest: {
        Row: {
          created_at: string
          id: number
          orderId: string | null
          squareOrderJSON: Json | null
        }
        Insert: {
          created_at?: string
          id?: number
          orderId?: string | null
          squareOrderJSON?: Json | null
        }
        Update: {
          created_at?: string
          id?: number
          orderId?: string | null
          squareOrderJSON?: Json | null
        }
        Relationships: []
      }
      refund_queue: {
        Row: {
          id: number
          order_id: string
          order_db_id: number
          amount: number
          reason: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          initiated_by: string | null
          idempotency_key: string
          square_refund_id: string | null
          square_response: Json | null
          error_message: string | null
          created_at: string
          processed_at: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          order_id: string
          order_db_id: number
          amount: number
          reason?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          initiated_by?: string | null
          idempotency_key?: string
          square_refund_id?: string | null
          square_response?: Json | null
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          order_id?: string
          order_db_id?: number
          amount?: number
          reason?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          initiated_by?: string | null
          idempotency_key?: string
          square_refund_id?: string | null
          square_response?: Json | null
          error_message?: string | null
          created_at?: string
          processed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_queue_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          currency: string | null
          id: string
          is_active: boolean | null
          name: string | null
          price: number
          square_variation_id: string
          updated_at: string | null
        }
        Insert: {
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          price: number
          square_variation_id: string
          updated_at?: string | null
        }
        Update: {
          currency?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          price?: number
          square_variation_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          active: boolean | null
          category_id: string
          created_at: string | null
          id: number
          name: string
        }
        Insert: {
          active?: boolean | null
          category_id: string
          created_at?: string | null
          id?: never
          name: string
        }
        Update: {
          active?: boolean | null
          category_id?: string
          created_at?: string | null
          id?: never
          name?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          category: number | null
          created_at: string
          description: string | null
          display_order: number
          id: number
          name: string | null
          square_id: string | null
        }
        Insert: {
          category?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: number
          name?: string | null
          square_id?: string | null
        }
        Update: {
          category?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: number
          name?: string | null
          square_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "kiosk"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: number
          locationId: string | null
          orderConfirmation: string | null
          orderDownload: string | null
          orderFulfilled: string | null
          orderPickupReminder: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          locationId?: string | null
          orderConfirmation?: string | null
          orderDownload?: string | null
          orderFulfilled?: string | null
          orderPickupReminder?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          locationId?: string | null
          orderConfirmation?: string | null
          orderDownload?: string | null
          orderFulfilled?: string | null
          orderPickupReminder?: string | null
        }
        Relationships: []
      }
      shop: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      webhook_queue: {
        Row: {
          attempts: number
          created_at: string
          id: number
          payload: Json
          processed: boolean
          processed_at: string | null
          topic: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: number
          payload: Json
          processed?: boolean
          processed_at?: string | null
          topic: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: number
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          topic?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_carts: {
        Row: {
          cookie_id: string | null
          created_at: string | null
          id: string | null
          merged: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cookie_id?: string | null
          created_at?: string | null
          id?: string | null
          merged?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cookie_id?: string | null
          created_at?: string | null
          id?: string | null
          merged?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      refund_queue_with_details: {
        Row: {
          id: number
          order_id: string
          order_db_id: number
          amount: number
          reason: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
          initiated_by: string | null
          idempotency_key: string
          square_refund_id: string | null
          square_response: Json | null
          error_message: string | null
          created_at: string
          processed_at: string | null
          updated_at: string
          order_total: number | null
          order_refunded_amount: number | null
          order_state: string | null
          customerId: string | null
          locationId: string | null
          squareOrderJSON: Json | null
          first_name: string | null
          last_name: string | null
          customer_email: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_secret: { Args: { secret_name: string }; Returns: string }
      increment_refunded_amount: {
        Args: { p_order_id: string; p_amount: number }
        Returns: undefined
      }
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
