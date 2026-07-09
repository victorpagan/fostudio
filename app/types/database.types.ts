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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: string
          actor_role: string | null
          actor_service: string | null
          actor_type: string
          actor_user_id: string | null
          created_at: string
          customer_id: string | null
          dedupe_key: string | null
          details: Json
          entity_id: string
          entity_type: string
          id: number
          location_id: string | null
          occurred_at: string
          order_db_id: number | null
          scope: string
          summary: string
          ticket_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_service?: string | null
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string | null
          details?: Json
          entity_id: string
          entity_type: string
          id?: number
          location_id?: string | null
          occurred_at?: string
          order_db_id?: number | null
          scope?: string
          summary?: string
          ticket_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_service?: string | null
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string | null
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: number
          location_id?: string | null
          occurred_at?: string
          order_db_id?: number | null
          scope?: string
          summary?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "activity_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "activity_events_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_read_cursors: {
        Row: {
          created_at: string
          last_read_at: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_read_at?: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_read_at?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_expense_reports: {
        Row: {
          amount_cents: number
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          created_by: string | null
          currency: string
          description: string
          id: string
          incident_id: string | null
          incurred_on: string | null
          member_user_id: string | null
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          receipt_urls: string[]
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
          updated_by: string | null
          vendor_name: string
        }
        Insert: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          id?: string
          incident_id?: string | null
          incurred_on?: string | null
          member_user_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          receipt_urls?: string[]
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string
        }
        Update: {
          amount_cents?: number
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          id?: string
          incident_id?: string | null
          incurred_on?: string | null
          member_user_id?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          receipt_urls?: string[]
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_expense_reports_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "admin_incident_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_incident_reports: {
        Row: {
          category: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          member_user_id: string | null
          occurred_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          member_user_id?: string | null
          occurred_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          member_user_id?: string | null
          occurred_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_manual_membership_events: {
        Row: {
          action: string
          admin_user_id: string | null
          cadence: string | null
          created_at: string
          id: string
          manual_expires_at: string | null
          manual_grants_enabled: boolean | null
          membership_id: string | null
          payload: Json
          reason: string | null
          tier: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          cadence?: string | null
          created_at?: string
          id?: string
          manual_expires_at?: string | null
          manual_grants_enabled?: boolean | null
          membership_id?: string | null
          payload?: Json
          reason?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          cadence?: string | null
          created_at?: string
          id?: string
          manual_expires_at?: string | null
          manual_grants_enabled?: boolean | null
          membership_id?: string | null
          payload?: Json
          reason?: string | null
          tier?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_manual_membership_events_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_member_charges: {
        Row: {
          amount_cents: number
          booking_id: string | null
          card_brand: string | null
          card_last4: string | null
          category: string
          charge_error: string | null
          charged_at: string | null
          charged_by: string | null
          created_at: string
          currency: string
          customer_id: string | null
          fomailer_response: Json | null
          id: string
          incident_id: string | null
          internal_note: string | null
          member_user_id: string
          metadata: Json
          payment_status: string | null
          reason: string
          receipt_error: string | null
          receipt_sent_at: string | null
          square_card_id: string | null
          square_customer_id: string | null
          square_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          category: string
          charge_error?: string | null
          charged_at?: string | null
          charged_by?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          fomailer_response?: Json | null
          id?: string
          incident_id?: string | null
          internal_note?: string | null
          member_user_id: string
          metadata?: Json
          payment_status?: string | null
          reason: string
          receipt_error?: string | null
          receipt_sent_at?: string | null
          square_card_id?: string | null
          square_customer_id?: string | null
          square_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          card_brand?: string | null
          card_last4?: string | null
          category?: string
          charge_error?: string | null
          charged_at?: string | null
          charged_by?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          fomailer_response?: Json | null
          id?: string
          incident_id?: string | null
          internal_note?: string | null
          member_user_id?: string
          metadata?: Json
          payment_status?: string | null
          reason?: string
          receipt_error?: string | null
          receipt_sent_at?: string | null
          square_card_id?: string | null
          square_customer_id?: string | null
          square_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_member_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_member_charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_member_charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "admin_member_charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "admin_member_charges_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "admin_incident_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_ad_daily: {
        Row: {
          campaign: string
          clicks: number
          conversions: number
          created_at: string
          date: string
          id: string
          impressions: number
          metadata: Json
          platform: string
          source: string
          spend: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          campaign: string
          clicks?: number
          conversions?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          metadata?: Json
          platform: string
          source?: string
          spend?: number
          synced_at?: string
          updated_at?: string
        }
        Update: {
          campaign?: string
          clicks?: number
          conversions?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          metadata?: Json
          platform?: string
          source?: string
          spend?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_outputs: {
        Row: {
          alerts: Json
          created_at: string
          freshness: string
          generated_at: string
          id: string
          metrics: Json | null
          source: string
          trends: Json | null
          week_of: string | null
          weekly_report_json: Json | null
          weekly_report_md: string | null
        }
        Insert: {
          alerts?: Json
          created_at?: string
          freshness?: string
          generated_at?: string
          id?: string
          metrics?: Json | null
          source?: string
          trends?: Json | null
          week_of?: string | null
          weekly_report_json?: Json | null
          weekly_report_md?: string | null
        }
        Update: {
          alerts?: Json
          created_at?: string
          freshness?: string
          generated_at?: string
          id?: string
          metrics?: Json | null
          source?: string
          trends?: Json | null
          week_of?: string | null
          weekly_report_json?: Json | null
          weekly_report_md?: string | null
        }
        Relationships: []
      }
      app_error_alert_notifications: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          event_id: string | null
          fingerprint: string
          group_id: string | null
          id: string
          message: string
          metadata: Json
          occurrence_count: number
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string
          severity: string
          source_app: string
          status: string
          triggered_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          event_id?: string | null
          fingerprint: string
          group_id?: string | null
          id?: string
          message: string
          metadata?: Json
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id: string
          severity: string
          source_app: string
          status?: string
          triggered_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          event_id?: string | null
          fingerprint?: string
          group_id?: string | null
          id?: string
          message?: string
          metadata?: Json
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string
          severity?: string
          source_app?: string
          status?: string
          triggered_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_error_alert_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "app_error_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_error_alert_notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "app_error_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_error_alert_notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "app_error_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      app_error_alert_rules: {
        Row: {
          created_at: string
          enabled: boolean
          fingerprint: string | null
          id: string
          metadata: Json
          name: string
          notify_channel: string
          route_pattern: string | null
          severity_min: string
          source_apps: string[] | null
          threshold_count: number
          throttle_minutes: number
          updated_at: string
          window_minutes: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fingerprint?: string | null
          id?: string
          metadata?: Json
          name: string
          notify_channel?: string
          route_pattern?: string | null
          severity_min?: string
          source_apps?: string[] | null
          threshold_count?: number
          throttle_minutes?: number
          updated_at?: string
          window_minutes?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fingerprint?: string | null
          id?: string
          metadata?: Json
          name?: string
          notify_channel?: string
          route_pattern?: string | null
          severity_min?: string
          source_apps?: string[] | null
          threshold_count?: number
          throttle_minutes?: number
          updated_at?: string
          window_minutes?: number
        }
        Relationships: []
      }
      app_error_events: {
        Row: {
          created_at: string
          customer_id: string | null
          environment: string | null
          file: string | null
          fingerprint: string
          group_id: string | null
          id: string
          location_id: string | null
          message_internal: string
          message_public: string | null
          metadata_redacted: Json
          method: string | null
          occurred_at: string
          order_db_id: number | null
          origin_ip: unknown
          release: string | null
          request_id: string | null
          route: string | null
          runtime: string
          session_id: string | null
          severity: string
          source_app: string
          stack_trace: string | null
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          environment?: string | null
          file?: string | null
          fingerprint: string
          group_id?: string | null
          id?: string
          location_id?: string | null
          message_internal: string
          message_public?: string | null
          metadata_redacted?: Json
          method?: string | null
          occurred_at?: string
          order_db_id?: number | null
          origin_ip?: unknown
          release?: string | null
          request_id?: string | null
          route?: string | null
          runtime?: string
          session_id?: string | null
          severity?: string
          source_app: string
          stack_trace?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          environment?: string | null
          file?: string | null
          fingerprint?: string
          group_id?: string | null
          id?: string
          location_id?: string | null
          message_internal?: string
          message_public?: string | null
          metadata_redacted?: Json
          method?: string | null
          occurred_at?: string
          order_db_id?: number | null
          origin_ip?: unknown
          release?: string | null
          request_id?: string | null
          route?: string | null
          runtime?: string
          session_id?: string | null
          severity?: string
          source_app?: string
          stack_trace?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "app_error_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      app_error_groups: {
        Row: {
          assigned_to: string | null
          created_at: string
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          occurrence_count: number
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_apps: string[]
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_apps?: string[]
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          occurrence_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_apps?: string[]
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      booking_access_codes: {
        Row: {
          booking_id: string
          code_type: string
          created_at: string
          id: string
          metadata: Json
          pin_code: string | null
          slot_assignment_id: string | null
          status: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          booking_id: string
          code_type: string
          created_at?: string
          id?: string
          metadata?: Json
          pin_code?: string | null
          slot_assignment_id?: string | null
          status?: string
          updated_at?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          booking_id?: string
          code_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          pin_code?: string | null
          slot_assignment_id?: string | null
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_codes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_access_codes_slot_assignment_id_fkey"
            columns: ["slot_assignment_id"]
            isOneToOne: false
            referencedRelation: "lock_slot_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
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
          booking_kind: string
          booking_rate_kind: string
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
          payment_expires_at: string | null
          rate_policy_snapshot: Json | null
          square_order_id: string | null
          start_time: string
          status: string
          time_range: unknown
          updated_at: string
          user_id: string | null
          workshop_description: string | null
          workshop_liability_accepted_at: string | null
          workshop_link: string | null
          workshop_title: string | null
        }
        Insert: {
          booking_kind?: string
          booking_rate_kind?: string
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
          payment_expires_at?: string | null
          rate_policy_snapshot?: Json | null
          square_order_id?: string | null
          start_time: string
          status?: string
          time_range?: unknown
          updated_at?: string
          user_id?: string | null
          workshop_description?: string | null
          workshop_liability_accepted_at?: string | null
          workshop_link?: string | null
          workshop_title?: string | null
        }
        Update: {
          booking_kind?: string
          booking_rate_kind?: string
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
          payment_expires_at?: string | null
          rate_policy_snapshot?: Json | null
          square_order_id?: string | null
          start_time?: string
          status?: string
          time_range?: unknown
          updated_at?: string
          user_id?: string | null
          workshop_description?: string | null
          workshop_liability_accepted_at?: string | null
          workshop_link?: string | null
          workshop_title?: string | null
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
      calendar_blocks: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          reason: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          reason?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          reason?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: []
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
      credit_pricing_options: {
        Row: {
          active: boolean
          base_price_cents: number
          created_at: string
          credits: number
          description: string | null
          id: string
          key: string
          label: string
          metadata: Json | null
          sale_ends_at: string | null
          sale_price_cents: number | null
          sale_starts_at: string | null
          sort_order: number
          square_item_id: string | null
          square_variation_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          created_at?: string
          credits: number
          description?: string | null
          id?: string
          key: string
          label: string
          metadata?: Json | null
          sale_ends_at?: string | null
          sale_price_cents?: number | null
          sale_starts_at?: string | null
          sort_order?: number
          square_item_id?: string | null
          square_variation_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          key?: string
          label?: string
          metadata?: Json | null
          sale_ends_at?: string | null
          sale_price_cents?: number | null
          sale_starts_at?: string | null
          sort_order?: number
          square_item_id?: string | null
          square_variation_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_topup_sessions: {
        Row: {
          amount_cents: number
          created_at: string
          credits: number
          currency: string
          id: string
          ledger_entry_id: string | null
          membership_id: string | null
          metadata: Json | null
          order_template_id: string | null
          paid_at: string | null
          payment_link_id: string | null
          payment_provider: string
          status: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          ledger_entry_id?: string | null
          membership_id?: string | null
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          status?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          ledger_entry_id?: string | null
          membership_id?: string | null
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          status?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_topup_sessions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "credits_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_topup_sessions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      credits_ledger: {
        Row: {
          created_at: string
          delta: number
          expires_at: string | null
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
          expires_at?: string | null
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
          expires_at?: string | null
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
          default_square_card_id: string | null
          door_code: string | null
          door_code_updated_at: string | null
          email: string | null
          exclude_from_kpis: boolean
          expires_at: string | null
          first_name: string | null
          id: string
          is_internal_account: boolean
          is_test_account: boolean
          lab_notes: string | null
          last_name: string | null
          phone: string | null
          square_customer_id: string | null
          square_customer_json: Json | null
          studio_account_origin: string | null
          studio_last_seen_at: string | null
          studio_registered_at: string | null
          updated_at: string
          user_id: string | null
          workshop_booking_enabled: boolean
        }
        Insert: {
          address?: Json | null
          created_at?: string
          default_square_card_id?: string | null
          door_code?: string | null
          door_code_updated_at?: string | null
          email?: string | null
          exclude_from_kpis?: boolean
          expires_at?: string | null
          first_name?: string | null
          id?: string
          is_internal_account?: boolean
          is_test_account?: boolean
          lab_notes?: string | null
          last_name?: string | null
          phone?: string | null
          square_customer_id?: string | null
          square_customer_json?: Json | null
          studio_account_origin?: string | null
          studio_last_seen_at?: string | null
          studio_registered_at?: string | null
          updated_at?: string
          user_id?: string | null
          workshop_booking_enabled?: boolean
        }
        Update: {
          address?: Json | null
          created_at?: string
          default_square_card_id?: string | null
          door_code?: string | null
          door_code_updated_at?: string | null
          email?: string | null
          exclude_from_kpis?: boolean
          expires_at?: string | null
          first_name?: string | null
          id?: string
          is_internal_account?: boolean
          is_test_account?: boolean
          lab_notes?: string | null
          last_name?: string | null
          phone?: string | null
          square_customer_id?: string | null
          square_customer_json?: Json | null
          studio_account_origin?: string | null
          studio_last_seen_at?: string | null
          studio_registered_at?: string | null
          updated_at?: string
          user_id?: string | null
          workshop_booking_enabled?: boolean
        }
        Relationships: []
      }
      developer_repo_events: {
        Row: {
          action: string | null
          author_email: string | null
          author_name: string | null
          branch: string | null
          changed_file_count: number
          commit_count: number
          commit_sha: string | null
          commit_url: string | null
          created_at: string
          dedupe_key: string
          delivery_id: string
          event_type: string
          html_url: string | null
          id: string
          occurred_at: string
          payload: Json
          ref: string | null
          repo_full_name: string
          repo_name: string
          summary: string
          system_id: string | null
          title: string
        }
        Insert: {
          action?: string | null
          author_email?: string | null
          author_name?: string | null
          branch?: string | null
          changed_file_count?: number
          commit_count?: number
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          dedupe_key: string
          delivery_id: string
          event_type: string
          html_url?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          ref?: string | null
          repo_full_name: string
          repo_name: string
          summary?: string
          system_id?: string | null
          title?: string
        }
        Update: {
          action?: string | null
          author_email?: string | null
          author_name?: string | null
          branch?: string | null
          changed_file_count?: number
          commit_count?: number
          commit_sha?: string | null
          commit_url?: string | null
          created_at?: string
          dedupe_key?: string
          delivery_id?: string
          event_type?: string
          html_url?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          ref?: string | null
          repo_full_name?: string
          repo_name?: string
          summary?: string
          system_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_repo_events_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_system_edges: {
        Row: {
          created_at: string
          criticality: string
          dependency_type: string
          description: string
          id: string
          label: string
          sort_order: number
          source_system_id: string
          target_system_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality?: string
          dependency_type?: string
          description?: string
          id?: string
          label?: string
          sort_order?: number
          source_system_id: string
          target_system_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: string
          dependency_type?: string
          description?: string
          id?: string
          label?: string
          sort_order?: number
          source_system_id?: string
          target_system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_system_edges_source_system_id_fkey"
            columns: ["source_system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_system_edges_target_system_id_fkey"
            columns: ["target_system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_systems: {
        Row: {
          color: string
          created_at: string
          description: string
          icon: string
          id: string
          is_active: boolean
          kind: string
          metadata: Json
          name: string
          repo_full_name: string | null
          slug: string
          sort_order: number
          tags: Json
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name: string
          repo_full_name?: string | null
          slug: string
          sort_order?: number
          tags?: Json
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          kind?: string
          metadata?: Json
          name?: string
          repo_full_name?: string | null
          slug?: string
          sort_order?: number
          tags?: Json
          updated_at?: string
        }
        Relationships: []
      }
      developer_update_reads: {
        Row: {
          read_at: string
          update_id: string
          user_id: string
        }
        Insert: {
          read_at?: string
          update_id: string
          user_id: string
        }
        Update: {
          read_at?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_update_reads_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "developer_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_update_repo_events: {
        Row: {
          repo_event_id: string
          update_id: string
        }
        Insert: {
          repo_event_id: string
          update_id: string
        }
        Update: {
          repo_event_id?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_update_repo_events_repo_event_id_fkey"
            columns: ["repo_event_id"]
            isOneToOne: false
            referencedRelation: "developer_repo_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_update_repo_events_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "developer_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_update_systems: {
        Row: {
          system_id: string
          update_id: string
        }
        Insert: {
          system_id: string
          update_id: string
        }
        Update: {
          system_id?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_update_systems_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_update_systems_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "developer_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_update_tickets: {
        Row: {
          created_at: string
          ticket_id: string
          update_id: string
        }
        Insert: {
          created_at?: string
          ticket_id: string
          update_id: string
        }
        Update: {
          created_at?: string
          ticket_id?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_update_tickets_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "developer_update_tickets_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "developer_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_updates: {
        Row: {
          affected_summary: string
          body_html: string
          body_text: string
          categories: Json
          created_at: string
          created_by: string | null
          id: string
          impact: string
          published_at: string | null
          published_by: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          updated_by: string | null
          watch_notes: string
        }
        Insert: {
          affected_summary?: string
          body_html?: string
          body_text?: string
          categories?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          summary?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          watch_notes?: string
        }
        Update: {
          affected_summary?: string
          body_html?: string
          body_text?: string
          categories?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          watch_notes?: string
        }
        Relationships: []
      }
      door_code_change_requests: {
        Row: {
          customer_id: string
          id: string
          request_note: string | null
          requested_at: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          customer_id: string
          id?: string
          request_note?: string | null
          requested_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          customer_id?: string
          id?: string
          request_note?: string | null
          requested_at?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "door_code_change_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "door_code_change_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "door_code_change_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
        ]
      }
      external_calendar_events: {
        Row: {
          active: boolean
          calendar_id: string
          created_at: string
          description: string | null
          end_time: string
          external_event_id: string
          id: string
          location: string | null
          provider: string
          raw_payload: Json | null
          start_time: string
          status: string
          synced_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          calendar_id: string
          created_at?: string
          description?: string | null
          end_time: string
          external_event_id: string
          id?: string
          location?: string | null
          provider: string
          raw_payload?: Json | null
          start_time: string
          status?: string
          synced_at?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          calendar_id?: string
          created_at?: string
          description?: string | null
          end_time?: string
          external_event_id?: string
          id?: string
          location?: string | null
          provider?: string
          raw_payload?: Json | null
          start_time?: string
          status?: string
          synced_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hold_ledger: {
        Row: {
          created_at: string
          delta: number
          expires_at: string | null
          external_ref: string | null
          id: string
          metadata: Json | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          expires_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          expires_at?: string | null
          external_ref?: string | null
          id?: string
          metadata?: Json | null
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      hold_topup_sessions: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          holds: number
          id: string
          ledger_entry_id: string | null
          membership_id: string | null
          metadata: Json | null
          order_template_id: string | null
          paid_at: string | null
          payment_link_id: string | null
          payment_provider: string
          status: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          holds: number
          id?: string
          ledger_entry_id?: string | null
          membership_id?: string | null
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          status?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          holds?: number
          id?: string
          ledger_entry_id?: string | null
          membership_id?: string | null
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          status?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hold_topup_sessions_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "hold_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hold_topup_sessions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
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
          source: string | null
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
          source?: string | null
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
          source?: string | null
          ssOrderId?: number | null
        }
        Relationships: []
      }
      links_archive: {
        Row: {
          archived_at: string
          email: string | null
          expires_date: string | null
          id: number
          link: string | null
          metadata: Json
          orderId: string | null
          password: string | null
          reason: string
          source: string | null
          ssOrderId: number | null
          synology_link_id: string | null
          synology_name: string | null
          synology_path: string | null
          synology_status: string | null
        }
        Insert: {
          archived_at?: string
          email?: string | null
          expires_date?: string | null
          id?: number
          link?: string | null
          metadata?: Json
          orderId?: string | null
          password?: string | null
          reason: string
          source?: string | null
          ssOrderId?: number | null
          synology_link_id?: string | null
          synology_name?: string | null
          synology_path?: string | null
          synology_status?: string | null
        }
        Update: {
          archived_at?: string
          email?: string | null
          expires_date?: string | null
          id?: number
          link?: string | null
          metadata?: Json
          orderId?: string | null
          password?: string | null
          reason?: string
          source?: string | null
          ssOrderId?: number | null
          synology_link_id?: string | null
          synology_name?: string | null
          synology_path?: string | null
          synology_status?: string | null
        }
        Relationships: []
      }
      lock_access_incidents: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          booking_id: string | null
          created_at: string
          id: string
          incident_type: string
          message: string | null
          metadata: Json
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          incident_type: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          incident_type?: string
          message?: string | null
          metadata?: Json
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lock_access_incidents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_access_jobs: {
        Row: {
          attempts: number
          booking_id: string | null
          created_at: string
          id: number
          job_type: string
          last_error: string | null
          last_response: Json | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          run_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          id?: never
          job_type: string
          last_error?: string | null
          last_response?: Json | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          run_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          booking_id?: string | null
          created_at?: string
          id?: never
          job_type?: string
          last_error?: string | null
          last_response?: Json | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          run_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lock_access_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      lock_permanent_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          metadata: Json
          slot_number: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          metadata?: Json
          slot_number: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          metadata?: Json
          slot_number?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lock_slot_assignments: {
        Row: {
          active: boolean
          allocated_at: string
          booking_id: string | null
          created_at: string
          id: string
          metadata: Json
          released_at: string | null
          slot_kind: string
          slot_number: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          allocated_at?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          released_at?: string | null
          slot_kind: string
          slot_number: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          allocated_at?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          released_at?: string | null
          slot_kind?: string
          slot_number?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lock_slot_assignments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_admin_copy_preferences: {
        Row: {
          critical_enabled: boolean
          non_critical_enabled: boolean
          recipients: string[]
          scope: string
          updated_at: string
        }
        Insert: {
          critical_enabled?: boolean
          non_critical_enabled?: boolean
          recipients?: string[]
          scope?: string
          updated_at?: string
        }
        Update: {
          critical_enabled?: boolean
          non_critical_enabled?: boolean
          recipients?: string[]
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      mail_campaign_template_id_history: {
        Row: {
          campaign_id: string
          id: string
          saved_at: string
          saved_by: string | null
          template_id: string
        }
        Insert: {
          campaign_id: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          template_id: string
        }
        Update: {
          campaign_id?: string
          id?: string
          saved_at?: string
          saved_by?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_campaign_template_id_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "mail_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_campaign_templates: {
        Row: {
          active: boolean
          body_template: string
          created_at: string
          description: string | null
          dynamic_data_template: Json
          event_type: string
          id: string
          name: string
          preheader_template: string
          render_mode: string
          sendgrid_template_id: string
          slug: string
          subject_template: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_template?: string
          created_at?: string
          description?: string | null
          dynamic_data_template?: Json
          event_type?: string
          id?: string
          name: string
          preheader_template?: string
          render_mode?: string
          sendgrid_template_id?: string
          slug: string
          subject_template?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_template?: string
          created_at?: string
          description?: string | null
          dynamic_data_template?: Json
          event_type?: string
          id?: string
          name?: string
          preheader_template?: string
          render_mode?: string
          sendgrid_template_id?: string
          slug?: string
          subject_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      mail_campaigns: {
        Row: {
          additional_recipients: string[]
          body_template: string
          created_at: string
          created_by: string | null
          dynamic_data_json: Json
          event_type: string
          id: string
          include_membership_recipients: boolean
          last_send_summary: Json | null
          last_sent_at: string | null
          name: string
          preheader_template: string
          render_mode: string
          sendgrid_template_id: string
          status: string
          subject_template: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          additional_recipients?: string[]
          body_template?: string
          created_at?: string
          created_by?: string | null
          dynamic_data_json?: Json
          event_type?: string
          id?: string
          include_membership_recipients?: boolean
          last_send_summary?: Json | null
          last_sent_at?: string | null
          name: string
          preheader_template?: string
          render_mode?: string
          sendgrid_template_id?: string
          status?: string
          subject_template?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          additional_recipients?: string[]
          body_template?: string
          created_at?: string
          created_by?: string | null
          dynamic_data_json?: Json
          event_type?: string
          id?: string
          include_membership_recipients?: boolean
          last_send_summary?: Json | null
          last_sent_at?: string | null
          name?: string
          preheader_template?: string
          render_mode?: string
          sendgrid_template_id?: string
          status?: string
          subject_template?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mail_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mail_campaign_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_reminder_deliveries: {
        Row: {
          category: string
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          event_type: string
          fomailer_response: Json | null
          id: string
          payload: Json
          reminder_key: string
          sent_at: string | null
          skip_reason: string | null
          skipped_at: string | null
          status: string
          template_id: string | null
          to_email: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          event_type: string
          fomailer_response?: Json | null
          id?: string
          payload?: Json
          reminder_key: string
          sent_at?: string | null
          skip_reason?: string | null
          skipped_at?: string | null
          status: string
          template_id?: string | null
          to_email?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          event_type?: string
          fomailer_response?: Json | null
          id?: string
          payload?: Json
          reminder_key?: string
          sent_at?: string | null
          skip_reason?: string | null
          skipped_at?: string | null
          status?: string
          template_id?: string | null
          to_email?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mail_reminder_rules: {
        Row: {
          admin_notes: string | null
          category: string
          cooldown_hours: number
          created_at: string
          description: string | null
          enabled: boolean
          event_type: string
          offsets_minutes: number[]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          category?: string
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          enabled?: boolean
          event_type: string
          offsets_minutes?: number[]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          category?: string
          cooldown_hours?: number
          created_at?: string
          description?: string | null
          enabled?: boolean
          event_type?: string
          offsets_minutes?: number[]
          updated_at?: string
        }
        Relationships: []
      }
      mail_template_registry: {
        Row: {
          active: boolean
          body_template: string | null
          category: string
          description: string | null
          event_type: string
          preheader_template: string | null
          sendgrid_template_id: string
          subject_template: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_template?: string | null
          category: string
          description?: string | null
          event_type: string
          preheader_template?: string | null
          sendgrid_template_id: string
          subject_template?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_template?: string | null
          category?: string
          description?: string | null
          event_type?: string
          preheader_template?: string | null
          sendgrid_template_id?: string
          subject_template?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mail_user_preferences: {
        Row: {
          critical_enabled: boolean
          non_critical_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          critical_enabled?: boolean
          non_critical_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          critical_enabled?: boolean
          non_critical_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      member_waiver_signatures: {
        Row: {
          consent_flags: Json
          created_at: string
          customer_id: string | null
          expires_at: string
          id: string
          ip: unknown
          signed_at: string
          signer_name: string
          template_id: string
          template_version: number
          user_agent: string | null
          user_id: string
          waiver_metadata_snapshot: Json
          waiver_snapshot: string
        }
        Insert: {
          consent_flags?: Json
          created_at?: string
          customer_id?: string | null
          expires_at: string
          id?: string
          ip?: unknown
          signed_at?: string
          signer_name: string
          template_id: string
          template_version: number
          user_agent?: string | null
          user_id: string
          waiver_metadata_snapshot?: Json
          waiver_snapshot: string
        }
        Update: {
          consent_flags?: Json
          created_at?: string
          customer_id?: string | null
          expires_at?: string
          id?: string
          ip?: unknown
          signed_at?: string
          signer_name?: string
          template_id?: string
          template_version?: number
          user_agent?: string | null
          user_id?: string
          waiver_metadata_snapshot?: Json
          waiver_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_waiver_signatures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_waiver_signatures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "member_waiver_signatures_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "member_waiver_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "waiver_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_checkout_sessions: {
        Row: {
          cadence: string
          claimed_by_user_id: string | null
          claimed_membership_id: string | null
          created_at: string
          customer_id: string | null
          guest_email: string | null
          id: string
          metadata: Json | null
          order_template_id: string | null
          paid_at: string | null
          payment_link_id: string | null
          payment_provider: string
          plan_variation_id: string | null
          return_to: string | null
          square_customer_id: string | null
          square_subscription_id: string | null
          status: string
          tier: string
          token: string
          updated_at: string
        }
        Insert: {
          cadence: string
          claimed_by_user_id?: string | null
          claimed_membership_id?: string | null
          created_at?: string
          customer_id?: string | null
          guest_email?: string | null
          id?: string
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          plan_variation_id?: string | null
          return_to?: string | null
          square_customer_id?: string | null
          square_subscription_id?: string | null
          status?: string
          tier: string
          token: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          claimed_by_user_id?: string | null
          claimed_membership_id?: string | null
          created_at?: string
          customer_id?: string | null
          guest_email?: string | null
          id?: string
          metadata?: Json | null
          order_template_id?: string | null
          paid_at?: string | null
          payment_link_id?: string | null
          payment_provider?: string
          plan_variation_id?: string | null
          return_to?: string | null
          square_customer_id?: string | null
          square_subscription_id?: string | null
          status?: string
          tier?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_checkout_sessions_claimed_membership_id_fkey"
            columns: ["claimed_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "membership_checkout_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "membership_checkout_sessions_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
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
      membership_referrals: {
        Row: {
          awarded_at: string | null
          checkout_session_id: string
          created_at: string
          id: string
          referral_code: string
          referred_credits_awarded: number
          referred_user_id: string | null
          referrer_credits_awarded: number
          referrer_user_id: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          awarded_at?: string | null
          checkout_session_id: string
          created_at?: string
          id?: string
          referral_code: string
          referred_credits_awarded?: number
          referred_user_id?: string | null
          referrer_credits_awarded?: number
          referrer_user_id?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          awarded_at?: string | null
          checkout_session_id?: string
          created_at?: string
          id?: string
          referral_code?: string
          referred_credits_awarded?: number
          referred_user_id?: string | null
          referrer_credits_awarded?: number
          referrer_user_id?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_referrals_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: true
            referencedRelation: "membership_checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_tiers: {
        Row: {
          active: boolean
          active_hold_cap: number
          booking_window_days: number
          created_at: string
          credit_expiry_days: number
          description: string | null
          direct_access_only: boolean
          display_name: string
          holds_included: number
          id: string
          max_bank: number
          max_slots: number | null
          peak_multiplier: number
          sort_order: number
          topoff_credit_expiry_days: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          active?: boolean
          active_hold_cap?: number
          booking_window_days: number
          created_at?: string
          credit_expiry_days?: number
          description?: string | null
          direct_access_only?: boolean
          display_name: string
          holds_included?: number
          id: string
          max_bank: number
          max_slots?: number | null
          peak_multiplier: number
          sort_order?: number
          topoff_credit_expiry_days?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          active?: boolean
          active_hold_cap?: number
          booking_window_days?: number
          created_at?: string
          credit_expiry_days?: number
          description?: string | null
          direct_access_only?: boolean
          display_name?: string
          holds_included?: number
          id?: string
          max_bank?: number
          max_slots?: number | null
          peak_multiplier?: number
          sort_order?: number
          topoff_credit_expiry_days?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      membership_waitlist: {
        Row: {
          cadence: string | null
          claimed_at: string | null
          created_at: string
          email: string
          id: string
          invited_at: string | null
          is_priority_member: boolean
          metadata: Json | null
          phone: string | null
          status: string
          tier_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cadence?: string | null
          claimed_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_at?: string | null
          is_priority_member?: boolean
          metadata?: Json | null
          phone?: string | null
          status?: string
          tier_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cadence?: string | null
          claimed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          is_priority_member?: boolean
          metadata?: Json | null
          phone?: string | null
          status?: string
          tier_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_waitlist_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          activated_at: string | null
          billing_customer_id: string | null
          billing_provider: string | null
          billing_subscription_id: string | null
          cadence: string | null
          canceled_at: string | null
          checkout_order_template_id: string | null
          checkout_payment_link_id: string | null
          checkout_provider: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          customer_id: string | null
          id: string
          last_invoice_id: string | null
          last_paid_at: string | null
          manual_assigned_at: string | null
          manual_assigned_by: string | null
          manual_expires_at: string | null
          manual_grants_enabled: boolean
          manual_reason: string | null
          membership_source: string
          square_customer_id: string | null
          square_plan_variation_id: string | null
          square_subscription_id: string | null
          status: Database["public"]["Enums"]["membership_status"]
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cadence?: string | null
          canceled_at?: string | null
          checkout_order_template_id?: string | null
          checkout_payment_link_id?: string | null
          checkout_provider?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: string
          last_invoice_id?: string | null
          last_paid_at?: string | null
          manual_assigned_at?: string | null
          manual_assigned_by?: string | null
          manual_expires_at?: string | null
          manual_grants_enabled?: boolean
          manual_reason?: string | null
          membership_source?: string
          square_customer_id?: string | null
          square_plan_variation_id?: string | null
          square_subscription_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          billing_customer_id?: string | null
          billing_provider?: string | null
          billing_subscription_id?: string | null
          cadence?: string | null
          canceled_at?: string | null
          checkout_order_template_id?: string | null
          checkout_payment_link_id?: string | null
          checkout_provider?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          customer_id?: string | null
          id?: string
          last_invoice_id?: string | null
          last_paid_at?: string | null
          manual_assigned_at?: string | null
          manual_assigned_by?: string | null
          manual_expires_at?: string | null
          manual_grants_enabled?: boolean
          manual_reason?: string | null
          membership_source?: string
          square_customer_id?: string | null
          square_plan_variation_id?: string | null
          square_subscription_id?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "memberships_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_action_requests: {
        Row: {
          action_type: string
          created_at: string
          customer_email: string | null
          customer_message: string
          id: string
          metadata: Json
          order_number: number | null
          order_row_id: number
          source: string
          square_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          customer_email?: string | null
          customer_message: string
          id?: string
          metadata?: Json
          order_number?: number | null
          order_row_id: number
          source?: string
          square_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          customer_email?: string | null
          customer_message?: string
          id?: string
          metadata?: Json
          order_number?: number | null
          order_row_id?: number
          source?: string
          square_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_action_requests_order_row_id_fkey"
            columns: ["order_row_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_action_requests_order_row_id_fkey"
            columns: ["order_row_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      order_email_events: {
        Row: {
          created_at: string
          event_at: string
          event_type: string
          id: number
          payload: Json
          recipient_email: string | null
          sendgrid_message_id: string | null
          sg_event_id: string | null
          tracking_id: string | null
        }
        Insert: {
          created_at?: string
          event_at: string
          event_type: string
          id?: number
          payload?: Json
          recipient_email?: string | null
          sendgrid_message_id?: string | null
          sg_event_id?: string | null
          tracking_id?: string | null
        }
        Update: {
          created_at?: string
          event_at?: string
          event_type?: string
          id?: number
          payload?: Json
          recipient_email?: string | null
          sendgrid_message_id?: string | null
          sg_event_id?: string | null
          tracking_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_email_events_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "order_email_messages"
            referencedColumns: ["tracking_id"]
          },
          {
            foreignKeyName: "order_email_events_tracking_id_fkey"
            columns: ["tracking_id"]
            isOneToOne: false
            referencedRelation: "order_email_status_latest"
            referencedColumns: ["tracking_id"]
          },
        ]
      }
      order_email_messages: {
        Row: {
          created_at: string
          customer_square_id: string | null
          delivered_at: string | null
          email_kind: string
          event_type: string
          failure_reason: string | null
          id: number
          last_event: string | null
          last_event_at: string | null
          location_id: string | null
          open_count: number
          opened_first_at: string | null
          opened_last_at: string | null
          order_db_id: number | null
          order_number: string | null
          payload_meta: Json
          recipient_email: string | null
          sendgrid_message_id: string | null
          sent_at: string | null
          source_service: string | null
          square_order_id: string | null
          status: string
          tracking_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_square_id?: string | null
          delivered_at?: string | null
          email_kind: string
          event_type: string
          failure_reason?: string | null
          id?: number
          last_event?: string | null
          last_event_at?: string | null
          location_id?: string | null
          open_count?: number
          opened_first_at?: string | null
          opened_last_at?: string | null
          order_db_id?: number | null
          order_number?: string | null
          payload_meta?: Json
          recipient_email?: string | null
          sendgrid_message_id?: string | null
          sent_at?: string | null
          source_service?: string | null
          square_order_id?: string | null
          status?: string
          tracking_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_square_id?: string | null
          delivered_at?: string | null
          email_kind?: string
          event_type?: string
          failure_reason?: string | null
          id?: number
          last_event?: string | null
          last_event_at?: string | null
          location_id?: string | null
          open_count?: number
          opened_first_at?: string | null
          opened_last_at?: string | null
          order_db_id?: number | null
          order_number?: string | null
          payload_meta?: Json
          recipient_email?: string | null
          sendgrid_message_id?: string | null
          sent_at?: string | null
          source_service?: string | null
          square_order_id?: string | null
          status?: string
          tracking_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_email_messages_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_email_messages_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      order_invoices: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          invoice_square_order_id: string
          location_id: string
          metadata: Json
          order_db_id: number | null
          sent_at: string | null
          source_square_order_id: string | null
          square_invoice_id: string
          square_invoice_json: Json
          square_invoice_public_url: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_square_order_id: string
          location_id: string
          metadata?: Json
          order_db_id?: number | null
          sent_at?: string | null
          source_square_order_id?: string | null
          square_invoice_id: string
          square_invoice_json?: Json
          square_invoice_public_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          invoice_square_order_id?: string
          location_id?: string
          metadata?: Json
          order_db_id?: number | null
          sent_at?: string | null
          source_square_order_id?: string | null
          square_invoice_id?: string
          square_invoice_json?: Json
          square_invoice_public_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
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
          completed: boolean
          confirmationSent: boolean | null
          created: string
          customerId: string | null
          email: string | null
          fulfillment_meta: Json | null
          fulfillment_type: string | null
          id: number
          internalNotes: string | null
          isServiceOrder: boolean | null
          lineItems: Json[] | null
          locationId: string | null
          name: string | null
          orderId: string | null
          phone: string | null
          pickedup: boolean | null
          public_order_token: string | null
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
          completed?: boolean
          confirmationSent?: boolean | null
          created?: string
          customerId?: string | null
          email?: string | null
          fulfillment_meta?: Json | null
          fulfillment_type?: string | null
          id?: number
          internalNotes?: string | null
          isServiceOrder?: boolean | null
          lineItems?: Json[] | null
          locationId?: string | null
          name?: string | null
          orderId?: string | null
          phone?: string | null
          pickedup?: boolean | null
          public_order_token?: string | null
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
          completed?: boolean
          confirmationSent?: boolean | null
          created?: string
          customerId?: string | null
          email?: string | null
          fulfillment_meta?: Json | null
          fulfillment_type?: string | null
          id?: number
          internalNotes?: string | null
          isServiceOrder?: boolean | null
          lineItems?: Json[] | null
          locationId?: string | null
          name?: string | null
          orderId?: string | null
          phone?: string | null
          pickedup?: boolean | null
          public_order_token?: string | null
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
      promo_codes: {
        Row: {
          active: boolean
          applies_to: string
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          max_redemptions: number | null
          metadata: Json | null
          redemptions_count: number
          square_discount_id: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          max_redemptions?: number | null
          metadata?: Json | null
          redemptions_count?: number
          square_discount_id?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          max_redemptions?: number | null
          metadata?: Json | null
          redemptions_count?: number
          square_discount_id?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      referral_credit_rules: {
        Row: {
          cadence: string
          created_at: string
          id: string
          referred_credits: number
          referrer_credits: number
          tier_id: string
          updated_at: string
        }
        Insert: {
          cadence: string
          created_at?: string
          id?: string
          referred_credits: number
          referrer_credits: number
          tier_id: string
          updated_at?: string
        }
        Update: {
          cadence?: string
          created_at?: string
          id?: string
          referred_credits?: number
          referrer_credits?: number
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_credit_rules_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "membership_tiers"
            referencedColumns: ["id"]
          },
        ]
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
      service_health_incidents: {
        Row: {
          app_error_event_id: string | null
          created_at: string
          environment: string
          id: string
          last_attempt_id: string | null
          last_run_id: string | null
          last_seen_at: string
          metadata: Json
          monitor_id: string
          notification_count: number
          opened_at: string
          recovered_at: string | null
          recovery_state: string | null
          service_key: string
          severity: string
          state: string
          updated_at: string
        }
        Insert: {
          app_error_event_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_attempt_id?: string | null
          last_run_id?: string | null
          last_seen_at?: string
          metadata?: Json
          monitor_id: string
          notification_count?: number
          opened_at?: string
          recovered_at?: string | null
          recovery_state?: string | null
          service_key: string
          severity?: string
          state: string
          updated_at?: string
        }
        Update: {
          app_error_event_id?: string | null
          created_at?: string
          environment?: string
          id?: string
          last_attempt_id?: string | null
          last_run_id?: string | null
          last_seen_at?: string
          metadata?: Json
          monitor_id?: string
          notification_count?: number
          opened_at?: string
          recovered_at?: string | null
          recovery_state?: string | null
          service_key?: string
          severity?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_health_incidents_app_error_event_id_fkey"
            columns: ["app_error_event_id"]
            isOneToOne: false
            referencedRelation: "app_error_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_health_incidents_last_attempt_id_fkey"
            columns: ["last_attempt_id"]
            isOneToOne: false
            referencedRelation: "service_run_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_health_incidents_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "service_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_health_incidents_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_current"
            referencedColumns: ["monitor_id"]
          },
          {
            foreignKeyName: "service_health_incidents_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_health_maintenances: {
        Row: {
          canceled_at: string | null
          canceled_by: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          environment: string
          id: string
          metadata: Json
          monitor_id: string
          reason: string
          service_key: string
          starts_at: string
        }
        Insert: {
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          environment?: string
          id?: string
          metadata?: Json
          monitor_id: string
          reason: string
          service_key: string
          starts_at: string
        }
        Update: {
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          environment?: string
          id?: string
          metadata?: Json
          monitor_id?: string
          reason?: string
          service_key?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_health_maintenances_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_current"
            referencedColumns: ["monitor_id"]
          },
          {
            foreignKeyName: "service_health_maintenances_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      service_health_monitors: {
        Row: {
          alert_rule_id: string | null
          created_at: string
          criticality: string
          display_name: string
          enabled: boolean
          environment: string
          expected_interval_seconds: number
          grace_seconds: number
          health_url: string | null
          heartbeat_key: string | null
          id: string
          instance_key: string | null
          metadata: Json
          monitor_type: string
          ready_url: string | null
          service_key: string
          sort_order: number
          system_id: string | null
          updated_at: string
        }
        Insert: {
          alert_rule_id?: string | null
          created_at?: string
          criticality?: string
          display_name: string
          enabled?: boolean
          environment?: string
          expected_interval_seconds?: number
          grace_seconds?: number
          health_url?: string | null
          heartbeat_key?: string | null
          id?: string
          instance_key?: string | null
          metadata?: Json
          monitor_type?: string
          ready_url?: string | null
          service_key: string
          sort_order?: number
          system_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_rule_id?: string | null
          created_at?: string
          criticality?: string
          display_name?: string
          enabled?: boolean
          environment?: string
          expected_interval_seconds?: number
          grace_seconds?: number
          health_url?: string | null
          heartbeat_key?: string | null
          id?: string
          instance_key?: string | null
          metadata?: Json
          monitor_type?: string
          ready_url?: string | null
          service_key?: string
          sort_order?: number
          system_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_health_monitors_alert_rule_id_fkey"
            columns: ["alert_rule_id"]
            isOneToOne: false
            referencedRelation: "app_error_alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_health_monitors_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      service_run_attempts: {
        Row: {
          app_error_event_id: string | null
          attempt_number: number
          created_at: string
          duration_ms: number | null
          error_code: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          message: string | null
          metadata: Json
          next_retry_at: string | null
          run_id: string
          started_at: string
          status: string
        }
        Insert: {
          app_error_event_id?: string | null
          attempt_number: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          metadata?: Json
          next_retry_at?: string | null
          run_id: string
          started_at?: string
          status: string
        }
        Update: {
          app_error_event_id?: string | null
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          metadata?: Json
          next_retry_at?: string | null
          run_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_run_attempts_app_error_event_id_fkey"
            columns: ["app_error_event_id"]
            isOneToOne: false
            referencedRelation: "app_error_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_run_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "service_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      service_runs: {
        Row: {
          app_error_event_id: string | null
          command: string
          created_at: string
          duration_ms: number | null
          environment: string | null
          error_count: number
          errors: Json
          finished_at: string | null
          id: string
          instance_key: string | null
          message: string | null
          metadata: Json
          monitor_id: string | null
          release: string | null
          run_type: string
          service: string
          service_key: string | null
          started_at: string
          stats: Json
          status: string
          system_id: string | null
          trigger_source: string | null
          updated_at: string
        }
        Insert: {
          app_error_event_id?: string | null
          command: string
          created_at?: string
          duration_ms?: number | null
          environment?: string | null
          error_count?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          instance_key?: string | null
          message?: string | null
          metadata?: Json
          monitor_id?: string | null
          release?: string | null
          run_type?: string
          service: string
          service_key?: string | null
          started_at?: string
          stats?: Json
          status?: string
          system_id?: string | null
          trigger_source?: string | null
          updated_at?: string
        }
        Update: {
          app_error_event_id?: string | null
          command?: string
          created_at?: string
          duration_ms?: number | null
          environment?: string | null
          error_count?: number
          errors?: Json
          finished_at?: string | null
          id?: string
          instance_key?: string | null
          message?: string | null
          metadata?: Json
          monitor_id?: string | null
          release?: string | null
          run_type?: string
          service?: string
          service_key?: string | null
          started_at?: string
          stats?: Json
          status?: string
          system_id?: string | null
          trigger_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_runs_app_error_event_id_fkey"
            columns: ["app_error_event_id"]
            isOneToOne: false
            referencedRelation: "app_error_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_runs_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_current"
            referencedColumns: ["monitor_id"]
          },
          {
            foreignKeyName: "service_runs_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "service_health_monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_runs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
        ]
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
          backendError: string | null
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
          backendError?: string | null
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
          backendError?: string | null
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
      shipping_package_profiles: {
        Row: {
          active: boolean
          created_at: string
          height_in: number
          id: string
          is_default: boolean
          length_in: number
          locationId: string | null
          metadata: Json
          name: string
          package_code: string
          priority: number
          square_category_id: string | null
          square_item_id: string | null
          square_variation_id: string | null
          updated_at: string
          weight_lb: number | null
          width_in: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          height_in: number
          id?: string
          is_default?: boolean
          length_in: number
          locationId?: string | null
          metadata?: Json
          name: string
          package_code?: string
          priority?: number
          square_category_id?: string | null
          square_item_id?: string | null
          square_variation_id?: string | null
          updated_at?: string
          weight_lb?: number | null
          width_in: number
        }
        Update: {
          active?: boolean
          created_at?: string
          height_in?: number
          id?: string
          is_default?: boolean
          length_in?: number
          locationId?: string | null
          metadata?: Json
          name?: string
          package_code?: string
          priority?: number
          square_category_id?: string | null
          square_item_id?: string | null
          square_variation_id?: string | null
          updated_at?: string
          weight_lb?: number | null
          width_in?: number
        }
        Relationships: []
      }
      staff_account_links: {
        Row: {
          auth_user_id: string
          created_at: string
          created_by: string | null
          id: string
          normalized_email: string
          square_assigned_locations: Json
          square_metadata: Json
          square_status: string | null
          square_team_member_id: string
          sync_state: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_email: string
          square_assigned_locations?: Json
          square_metadata?: Json
          square_status?: string | null
          square_team_member_id: string
          sync_state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          normalized_email?: string
          square_assigned_locations?: Json
          square_metadata?: Json
          square_status?: string | null
          square_team_member_id?: string
          sync_state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_setup_tokens: {
        Row: {
          auth_user_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          last_resolved_at: string | null
          link_type: string
          metadata: Json
          normalized_email: string
          redirect_to: string
          resolution_count: number
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          last_resolved_at?: string | null
          link_type?: string
          metadata?: Json
          normalized_email: string
          redirect_to: string
          resolution_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          last_resolved_at?: string | null
          link_type?: string
          metadata?: Json
          normalized_email?: string
          redirect_to?: string
          resolution_count?: number
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          area: string | null
          comments: Json
          content_html: string
          created_at: string
          created_by: string | null
          email_dispatch: Json
          environment: string | null
          id: string
          is_resolved: boolean
          legacy_internal_error_id: string | null
          metadata: Json
          origin_ip: unknown
          priority: string
          queue: string
          reporter: Json
          resolved_at: string | null
          resolved_by: string | null
          source: Json
          tags: string[]
          ticket_type: string
          title: string
          updated_at: string
          workflow_status: string
        }
        Insert: {
          area?: string | null
          comments?: Json
          content_html?: string
          created_at?: string
          created_by?: string | null
          email_dispatch?: Json
          environment?: string | null
          id?: string
          is_resolved?: boolean
          legacy_internal_error_id?: string | null
          metadata?: Json
          origin_ip?: unknown
          priority?: string
          queue: string
          reporter?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Json
          tags?: string[]
          ticket_type?: string
          title: string
          updated_at?: string
          workflow_status?: string
        }
        Update: {
          area?: string | null
          comments?: Json
          content_html?: string
          created_at?: string
          created_by?: string | null
          email_dispatch?: Json
          environment?: string | null
          id?: string
          is_resolved?: boolean
          legacy_internal_error_id?: string | null
          metadata?: Json
          origin_ip?: unknown
          priority?: string
          queue?: string
          reporter?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          source?: Json
          tags?: string[]
          ticket_type?: string
          title?: string
          updated_at?: string
          workflow_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_legacy_internal_error_id_fkey"
            columns: ["legacy_internal_error_id"]
            isOneToOne: true
            referencedRelation: "internal_errors"
            referencedColumns: ["id"]
          },
        ]
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
      waiver_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          metadata: Json
          published_at: string | null
          published_by: string | null
          title: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          title: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          published_at?: string | null
          published_by?: string | null
          title?: string
          version?: number
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
      credit_balance: {
        Row: {
          balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      hold_balance: {
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
      order_email_status_latest: {
        Row: {
          created_at: string | null
          customer_square_id: string | null
          delivered_at: string | null
          email_kind: string | null
          event_type: string | null
          failure_reason: string | null
          id: number | null
          last_event: string | null
          last_event_at: string | null
          location_id: string | null
          open_count: number | null
          opened: boolean | null
          opened_first_at: string | null
          opened_last_at: string | null
          order_db_id: number | null
          order_number: string | null
          payload_meta: Json | null
          received: boolean | null
          recipient_email: string | null
          sendgrid_message_id: string | null
          sent_at: string | null
          source_service: string | null
          square_order_id: string | null
          status: string | null
          tracking_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_email_messages_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_email_messages_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_with_customers: {
        Row: {
          completed: boolean | null
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
      service_health_current: {
        Row: {
          color: string | null
          criticality: string | null
          customer_impact: string | null
          display_name: string | null
          enabled: boolean | null
          environment: string | null
          expected_interval_seconds: number | null
          grace_seconds: number | null
          health_url: string | null
          heartbeat_key: string | null
          icon: string | null
          last_attempt_status: string | null
          last_failure_at: string | null
          last_seen_at: string | null
          last_success_at: string | null
          latest_command: string | null
          latest_duration_ms: number | null
          latest_error_count: number | null
          latest_errors: Json | null
          latest_finished_at: string | null
          latest_message: string | null
          latest_run_id: string | null
          latest_run_type: string | null
          latest_signal_at: string | null
          latest_started_at: string | null
          latest_status: string | null
          logs_url: string | null
          maintenance_ends_at: string | null
          maintenance_id: string | null
          maintenance_reason: string | null
          maintenance_silences_alerts: boolean | null
          maintenance_starts_at: string | null
          metadata: Json | null
          monitor_created_at: string | null
          monitor_id: string | null
          monitor_type: string | null
          next_retry_at: string | null
          oldest_queue_age_seconds: number | null
          open_incident_id: string | null
          open_incident_last_seen_at: string | null
          open_incident_notification_count: number | null
          open_incident_opened_at: string | null
          open_incident_severity: string | null
          open_incident_state: string | null
          overall_state: string | null
          owner_label: string | null
          printer_connected_count: number | null
          printer_expected_count: number | null
          printer_location_count: number | null
          printer_location_rollups: Json | null
          reachability_state: string | null
          ready_url: string | null
          repo_full_name: string | null
          retry_attempt_count: number | null
          retrying_attempt_count: number | null
          retrying_count: number | null
          runbook_url: string | null
          running_count: number | null
          seconds_since_last_signal: number | null
          service_key: string | null
          sort_order: number | null
          system_id: string | null
          system_kind: string | null
          system_name: string | null
          system_slug: string | null
          work_state: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_health_monitors_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "developer_systems"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_settings_template_column: {
        Args: { p_column_name: string }
        Returns: string
      }
      app_error_severity_rank: { Args: { p_severity: string }; Returns: number }
      backfill_membership_credit_grants: {
        Args: { p_membership_id?: string }
        Returns: number
      }
      cancel_pending_membership_credit_grants: {
        Args: { p_from?: string; p_membership_id: string; p_reason?: string }
        Returns: number
      }
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
      confirm_paid_guest_booking_with_burn: {
        Args: {
          p_amount_cents: number
          p_booking_id: string
          p_credits_purchased: number
          p_payment_ref: string
          p_topup_expires_at: string
          p_topup_session_id: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_added: number
          credits_burned: number
          new_balance: number
        }[]
      }
      create_confirmed_booking_with_burn: {
        Args: {
          p_booking_kind?: string
          p_consume_paid_hold?: boolean
          p_credits_needed: number
          p_customer_id: string
          p_end_time: string
          p_hold_credit_cost?: number
          p_notes: string
          p_request_hold: boolean
          p_start_time: string
          p_user_id: string
          p_workshop_description?: string
          p_workshop_liability_accepted_at?: string
          p_workshop_link?: string
          p_workshop_title?: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          hold_id: string
          new_balance: number
        }[]
      }
      create_confirmed_booking_with_burn_and_rate: {
        Args: {
          p_booking_kind: string
          p_booking_rate_kind: string
          p_consume_paid_hold: boolean
          p_credits_needed: number
          p_customer_id: string
          p_end_time: string
          p_hold_credit_cost: number
          p_notes: string
          p_rate_policy_snapshot: Json
          p_request_hold: boolean
          p_start_time: string
          p_user_id: string
          p_workshop_description: string
          p_workshop_liability_accepted_at: string
          p_workshop_link: string
          p_workshop_title: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          hold_id: string
          new_balance: number
        }[]
      }
      create_confirmed_booking_with_burn_no_membership: {
        Args: {
          p_booking_kind?: string
          p_credits_needed: number
          p_customer_id: string
          p_end_time: string
          p_notes: string
          p_start_time: string
          p_user_id: string
          p_workshop_description?: string
          p_workshop_liability_accepted_at?: string
          p_workshop_link?: string
          p_workshop_title?: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          new_balance: number
        }[]
      }
      create_confirmed_booking_with_burn_no_membership_and_rate: {
        Args: {
          p_booking_kind: string
          p_booking_rate_kind: string
          p_credits_needed: number
          p_customer_id: string
          p_end_time: string
          p_notes: string
          p_rate_policy_snapshot: Json
          p_start_time: string
          p_user_id: string
          p_workshop_description: string
          p_workshop_liability_accepted_at: string
          p_workshop_link: string
          p_workshop_title: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          new_balance: number
        }[]
      }
      current_app_role: { Args: never; Returns: string }
      expire_stale_credit_topup_sessions: {
        Args: { p_max_age?: string }
        Returns: number
      }
      expire_stale_hold_topup_sessions: {
        Args: { p_max_age?: string }
        Returns: number
      }
      expire_stale_membership_checkout_sessions: {
        Args: { p_max_age?: string }
        Returns: number
      }
      expire_stale_pending_guest_bookings: {
        Args: { p_now?: string }
        Returns: number
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
      has_app_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      increment_refunded_amount: {
        Args: { p_amount: number; p_order_id: string }
        Returns: undefined
      }
      invoke_mail_reminder_processor: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_dashboard_staff: { Args: never; Returns: boolean }
      member_waiver_status: {
        Args: { p_user_id: string }
        Returns: {
          active_template_id: string
          active_template_version: number
          expires_at: string
          signed_at: string
          signed_template_id: string
          signed_template_version: number
          signer_name: string
          status: string
        }[]
      }
      orders2_resolve_fulfillment_type: {
        Args: {
          p_fulfillment_meta: Json
          p_pickedup: boolean
          p_shipping_status: string
        }
        Returns: string
      }
      process_due_membership_credit_grants: {
        Args: { p_limit?: number }
        Returns: {
          canceled_count: number
          processed_count: number
          skipped_count: number
        }[]
      }
      record_activity_event: {
        Args: {
          p_action: string
          p_actor_role?: string
          p_actor_service?: string
          p_actor_type?: string
          p_actor_user_id?: string
          p_customer_id?: string
          p_dedupe_key?: string
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
          p_location_id?: string
          p_occurred_at?: string
          p_order_db_id?: number
          p_scope?: string
          p_summary?: string
          p_ticket_id?: string
        }
        Returns: number
      }
      resolve_order_db_id: {
        Args: { p_square_order_id: string; p_ss_order_id: number }
        Returns: number
      }
      schedule_membership_credit_grants: {
        Args: {
          p_invoice_id: string
          p_membership_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: number
      }
    }
    Enums: {
      membership_status:
        | "pending_checkout"
        | "active"
        | "past_due"
        | "canceled"
        | "cancelled"
        | "inactive"
        | "paused"
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
  public: {
    Enums: {
      membership_status: [
        "pending_checkout",
        "active",
        "past_due",
        "canceled",
        "cancelled",
        "inactive",
        "paused",
      ],
      membership_tier: ["creator", "pro", "studio_plus", "test"],
    },
  },
} as const
