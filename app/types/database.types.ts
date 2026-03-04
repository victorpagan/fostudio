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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_holds: {
        Row: {
          booking_id: string
          cash_cost_cents: number | null
          created_at: string
          credits_cost: number | null
          hold_end: string
          hold_range: unknown
          hold_start: string
          hold_type: string
          id: string
        }
        Insert: {
          booking_id: string
          cash_cost_cents?: number | null
          created_at?: string
          credits_cost?: number | null
          hold_end: string
          hold_range?: unknown
          hold_start: string
          hold_type?: string
          id?: string
        }
        Update: {
          booking_id?: string
          cash_cost_cents?: number | null
          created_at?: string
          credits_cost?: number | null
          hold_end?: string
          hold_range?: unknown
          hold_start?: string
          hold_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          credits_burned: number | null
          credits_estimated: number | null
          credits_final: number | null
          customer_id: string | null
          end_time: string
          guest_email: string | null
          guest_name: string | null
          id: string
          notes: string | null
          square_order_id: string | null
          start_time: string
          status: string
          time_range: unknown
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          credits_burned?: number | null
          credits_estimated?: number | null
          credits_final?: number | null
          customer_id?: string | null
          end_time: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          notes?: string | null
          square_order_id?: string | null
          start_time: string
          status?: string
          time_range?: unknown
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          credits_burned?: number | null
          credits_estimated?: number | null
          credits_final?: number | null
          customer_id?: string | null
          end_time?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          notes?: string | null
          square_order_id?: string | null
          start_time?: string
          status?: string
          time_range?: unknown
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
        ]
      }
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
      credits_ledger: {
        Row: {
          created_at: string
          delta: number
          external_ref: string | null
          id: string
          membership_id: string | null
          metadata: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          external_ref?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          external_ref?: string | null
          id?: string
          membership_id?: string | null
          metadata?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credits_ledger_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: Json | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          lab_notes: string | null
          last_name: string | null
          phone: string | null
          square_customer_id: string | null
          square_customer_json: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          lab_notes?: string | null
          last_name?: string | null
          phone?: string | null
          square_customer_id?: string | null
          square_customer_json?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: Json | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          lab_notes?: string | null
          last_name?: string | null
          phone?: string | null
          square_customer_id?: string | null
          square_customer_json?: Json | null
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
          locationId: string | null
          orderId: string | null
          password: string | null
          ssOrderId: number | null
        }
        Insert: {
          email?: string | null
          expires_date?: string | null
          id?: string
          link?: string | null
          locationId?: string | null
          orderId?: string | null
          password?: string | null
          ssOrderId?: number | null
        }
        Update: {
          email?: string | null
          expires_date?: string | null
          id?: string
          link?: string | null
          locationId?: string | null
          orderId?: string | null
          password?: string | null
          ssOrderId?: number | null
        }
        Relationships: []
      }
      membership_plan_variations: {
        Row: {
          active: boolean
          cadence: string
          credits_per_month: number
          currency: string
          discount_label: string | null
          id: string
          price_cents: number
          provider: string
          provider_plan_id: string | null
          provider_plan_variation_id: string
          sort_order: number
          tier_id: string
          visible: boolean
        }
        Insert: {
          active?: boolean
          cadence: string
          credits_per_month: number
          currency?: string
          discount_label?: string | null
          id?: string
          price_cents: number
          provider?: string
          provider_plan_id?: string | null
          provider_plan_variation_id: string
          sort_order?: number
          tier_id: string
          visible?: boolean
        }
        Update: {
          active?: boolean
          cadence?: string
          credits_per_month?: number
          currency?: string
          discount_label?: string | null
          id?: string
          price_cents?: number
          provider?: string
          provider_plan_id?: string | null
          provider_plan_variation_id?: string
          sort_order?: number
          tier_id?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "membership_plan_variations_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          active: boolean
          booking_window_days: number
          description: string | null
          display_name: string
          holds_included: number
          id: string
          max_bank: number
          max_slots: number | null
          peak_multiplier: number
          sort_order: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          active?: boolean
          booking_window_days: number
          description?: string | null
          display_name: string
          holds_included?: number
          id: string
          max_bank: number
          max_slots?: number | null
          peak_multiplier: number
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          active?: boolean
          booking_window_days?: number
          description?: string | null
          display_name?: string
          holds_included?: number
          id?: string
          max_bank?: number
          max_slots?: number | null
          peak_multiplier?: number
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      memberships: {
        Row: {
          billing_customer_id: string | null
          billing_provider: string | null
          billing_subscription_id: string | null
          cadence: string | null
          checkout_order_template_id: string | null
          checkout_payment_link_id: string | null
          checkout_provider: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_invoice_id: string | null
          last_paid_at: string | null
          square_customer_id: string | null
          square_plan_variation_id: string | null
          square_subscription_id: string | null
          status: Database["public"]["Enums"]["membership_status"]
          tier: Database["public"]["Enums"]["membership_tier"]
          user_id: string
        }
        Insert: {
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cadence?: string | null
          checkout_order_template_id?: string | null
          checkout_payment_link_id?: string | null
          checkout_provider?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_invoice_id?: string | null
          last_paid_at?: string | null
          square_customer_id?: string | null
          square_plan_variation_id?: string | null
          square_subscription_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tier: Database["public"]["Enums"]["membership_tier"]
          user_id: string
        }
        Update: {
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cadence?: string | null
          checkout_order_template_id?: string | null
          checkout_payment_link_id?: string | null
          checkout_provider?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_invoice_id?: string | null
          last_paid_at?: string | null
          square_customer_id?: string | null
          square_plan_variation_id?: string | null
          square_subscription_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tier?: Database["public"]["Enums"]["membership_tier"]
          user_id?: string
        }
        Relationships: []
      }
      membership_credit_grants: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          credits: number
          due_at: string
          grant_month_index: number
          grant_month_start: string
          id: string
          invoice_id: string | null
          last_error: string | null
          ledger_entry_id: string | null
          membership_id: string
          metadata: Json | null
          processed_at: string | null
          processed_credits: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          credits: number
          due_at: string
          grant_month_index?: number
          grant_month_start: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          ledger_entry_id?: string | null
          membership_id: string
          metadata?: Json | null
          processed_at?: string | null
          processed_credits?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          credits?: number
          due_at?: string
          grant_month_index?: number
          grant_month_start?: string
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          ledger_entry_id?: string | null
          membership_id?: string
          metadata?: Json | null
          processed_at?: string | null
          processed_credits?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_credit_grants_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "credits_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_credit_grants_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
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
      print_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          location_id: string
          order_id: number
          order_square_id: string | null
          printed_at: string | null
          printer_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          location_id: string
          order_id: number
          order_square_id?: string | null
          printed_at?: string | null
          printer_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          location_id?: string
          order_id?: number
          order_square_id?: string | null
          printed_at?: string | null
          printer_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      refund_queue: {
        Row: {
          amount: number
          created_at: string
          error_message: string | null
          id: number
          idempotency_key: string
          initiated_by: string | null
          order_db_id: number
          order_id: string
          processed_at: string | null
          reason: string | null
          square_refund_id: string | null
          square_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          error_message?: string | null
          id?: number
          idempotency_key?: string
          initiated_by?: string | null
          order_db_id: number
          order_id: string
          processed_at?: string | null
          reason?: string | null
          square_refund_id?: string | null
          square_response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          error_message?: string | null
          id?: number
          idempotency_key?: string
          initiated_by?: string | null
          order_db_id?: number
          order_id?: string
          processed_at?: string | null
          reason?: string | null
          square_refund_id?: string | null
          square_response?: Json | null
          status?: string
          updated_at?: string
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
          orderRefund: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          locationId?: string | null
          orderConfirmation?: string | null
          orderDownload?: string | null
          orderFulfilled?: string | null
          orderPickupReminder?: string | null
          orderRefund?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          locationId?: string | null
          orderConfirmation?: string | null
          orderDownload?: string | null
          orderFulfilled?: string | null
          orderPickupReminder?: string | null
          orderRefund?: string | null
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
      credit_balance: {
        Row: {
          balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      links_with_customers: {
        Row: {
          customer_email: string | null
          customer_phone: string | null
          db_customer_id: string | null
          email: string | null
          expires_date: string | null
          first_name: string | null
          id: string | null
          lab_notes: string | null
          last_name: string | null
          link: string | null
          orderId: string | null
          password: string | null
          square_customer_id: string | null
          ssOrderId: number | null
        }
        Relationships: []
      }
      orders_with_customers: {
        Row: {
          completed: string | null
          confirmationSent: boolean | null
          created: string | null
          customer_email: string | null
          customer_phone: string | null
          customerId: string | null
          db_customer_id: string | null
          email: string | null
          first_name: string | null
          id: number | null
          internalNotes: string | null
          isServiceOrder: boolean | null
          lab_notes: string | null
          last_name: string | null
          lineItems: Json[] | null
          locationId: string | null
          name: string | null
          orderId: string | null
          phone: string | null
          pickedup: boolean | null
          refunded_amount: number | null
          shipping_status: string | null
          square_customer_id: string | null
          squareOrderJSON: Json | null
          ssOrderId: number | null
          state: string | null
          terminalStatus: string | null
          total: number | null
          type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      refund_queue_with_details: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_email: string | null
          customerId: string | null
          error_message: string | null
          first_name: string | null
          id: number | null
          idempotency_key: string | null
          initiated_by: string | null
          last_name: string | null
          locationId: string | null
          order_db_id: number | null
          order_id: string | null
          order_refunded_amount: number | null
          order_state: string | null
          order_total: number | null
          processed_at: string | null
          reason: string | null
          square_refund_id: string | null
          square_response: Json | null
          squareOrderJSON: Json | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_print_job: {
        Args: { p_claimed_by: string; p_job_id: string; p_printer_name: string }
        Returns: {
          attempts: number
          id: string
          job_type: string
          location_id: string
          order_id: number
          order_square_id: string
          status: string
        }[]
      }
      create_confirmed_booking_with_burn: {
        Args: {
          p_credits_needed: number
          p_customer_id: string
          p_end_time: string
          p_notes: string
          p_request_hold: boolean
          p_start_time: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          hold_id: string
          new_balance: number
        }[]
      }
      get_membership_by_square_variation: {
        Args: { variation_id: string }
        Returns: {
          booking_window_days: number
          cadence: string
          credits_per_month: number
          currency: string
          holds_included: number
          max_bank: number
          peak_multiplier: number
          price_cents: number
          tier_id: string
        }[]
      }
      get_secret: { Args: { secret_name: string }; Returns: string }
      increment_refunded_amount: {
        Args: { p_amount: number; p_order_id: string }
        Returns: undefined
      }
      backfill_membership_credit_grants: {
        Args: { p_membership_id?: string | null }
        Returns: number
      }
      cancel_pending_membership_credit_grants: {
        Args: { p_from?: string | null; p_membership_id: string; p_reason?: string | null }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      process_due_membership_credit_grants: {
        Args: { p_limit?: number | null }
        Returns: {
          canceled_count: number
          processed_count: number
          skipped_count: number
        }[]
      }
      schedule_membership_credit_grants: {
        Args: {
          p_invoice_id: string | null
          p_membership_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: number
      }
    }
    Enums: {
      membership_status: "pending_checkout" | "active" | "past_due" | "canceled"
      membership_tier: "creator" | "pro" | "studio_plus" | "test"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      membership_status: ["pending_checkout", "active", "past_due", "canceled"],
      membership_tier: ["creator", "pro", "studio_plus", "test"],
    },
  },
} as const
