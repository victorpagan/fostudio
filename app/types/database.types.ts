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
      booking_external_access: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string | null
          delivery_status: string
          external_calendar_event_id: string | null
          external_reference: string | null
          id: string
          manage_url: string | null
          metadata: Json
          provider: string
          shared_at: string | null
          shared_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          external_calendar_event_id?: string | null
          external_reference?: string | null
          id?: string
          manage_url?: string | null
          metadata?: Json
          provider: string
          shared_at?: string | null
          shared_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string | null
          delivery_status?: string
          external_calendar_event_id?: string | null
          external_reference?: string | null
          id?: string
          manage_url?: string | null
          metadata?: Json
          provider?: string
          shared_at?: string | null
          shared_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_external_access_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_external_access_external_calendar_event_id_fkey"
            columns: ["external_calendar_event_id"]
            isOneToOne: true
            referencedRelation: "external_calendar_events"
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
          checkout_attempt_id: string | null
          checkout_claimed_at: string | null
          checkout_completed_at: string | null
          checkout_provider_started_at: string | null
          created_at: string | null
          id: string
          merged: boolean | null
          session_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          checkout_attempt_id?: string | null
          checkout_claimed_at?: string | null
          checkout_completed_at?: string | null
          checkout_provider_started_at?: string | null
          created_at?: string | null
          id?: string
          merged?: boolean | null
          session_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          checkout_attempt_id?: string | null
          checkout_claimed_at?: string | null
          checkout_completed_at?: string | null
          checkout_provider_started_at?: string | null
          created_at?: string | null
          id?: string
          merged?: boolean | null
          session_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      checkout_inventory_observations: {
        Row: {
          catalog_variation_id: string
          last_square_in_stock: number
          location_id: string
          observed_at: string
          square_calculated_at: string
        }
        Insert: {
          catalog_variation_id: string
          last_square_in_stock: number
          location_id: string
          observed_at?: string
          square_calculated_at: string
        }
        Update: {
          catalog_variation_id?: string
          last_square_in_stock?: number
          location_id?: string
          observed_at?: string
          square_calculated_at?: string
        }
        Relationships: []
      }
      checkout_inventory_reflection_evidence: {
        Row: {
          adjustment_created_at: string
          adjustment_id: string
          catalog_variation_id: string
          checkout_attempt_id: string
          evidence: Json
          location_id: string
          occurred_at: string
          quantity: number
          recorded_at: string
          reservation_id: number
          transaction_id: string
        }
        Insert: {
          adjustment_created_at: string
          adjustment_id: string
          catalog_variation_id: string
          checkout_attempt_id: string
          evidence: Json
          location_id: string
          occurred_at: string
          quantity: number
          recorded_at?: string
          reservation_id: number
          transaction_id: string
        }
        Update: {
          adjustment_created_at?: string
          adjustment_id?: string
          catalog_variation_id?: string
          checkout_attempt_id?: string
          evidence?: Json
          location_id?: string
          occurred_at?: string
          quantity?: number
          recorded_at?: string
          reservation_id?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_inventory_reflection_evidence_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "checkout_inventory_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_inventory_reservations: {
        Row: {
          cart_id: string
          catalog_variation_id: string
          checkout_attempt_id: string
          completed_at: string | null
          created_at: string
          id: number
          location_id: string
          order_id: number | null
          quantity: number
          reflected_at: string | null
          released_at: string | null
          square_calculated_at_at_reserve: string
          square_observed_at_reserve: number
          state: string
          updated_at: string
        }
        Insert: {
          cart_id: string
          catalog_variation_id: string
          checkout_attempt_id: string
          completed_at?: string | null
          created_at?: string
          id?: never
          location_id: string
          order_id?: number | null
          quantity: number
          reflected_at?: string | null
          released_at?: string | null
          square_calculated_at_at_reserve: string
          square_observed_at_reserve: number
          state?: string
          updated_at?: string
        }
        Update: {
          cart_id?: string
          catalog_variation_id?: string
          checkout_attempt_id?: string
          completed_at?: string | null
          created_at?: string
          id?: never
          location_id?: string
          order_id?: number | null
          quantity?: number
          reflected_at?: string | null
          released_at?: string | null
          square_calculated_at_at_reserve?: string
          square_observed_at_reserve?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger_operations: {
        Row: {
          applied_amount: number
          booking_id: string | null
          component: string
          created_at: string
          id: string
          metadata: Json
          operation_key: string
          operation_type: string
          requested_amount: number
          user_id: string
        }
        Insert: {
          applied_amount?: number
          booking_id?: string | null
          component: string
          created_at?: string
          id?: string
          metadata?: Json
          operation_key: string
          operation_type: string
          requested_amount: number
          user_id: string
        }
        Update: {
          applied_amount?: number
          booking_id?: string | null
          component?: string
          created_at?: string
          id?: string
          metadata?: Json
          operation_key?: string
          operation_type?: string
          requested_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_operations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger_repair_audit: {
        Row: {
          created_at: string
          id: string
          ledger_id: string
          original_row: Json
          repair_key: string
          repaired_ledger_ids: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          ledger_id: string
          original_row: Json
          repair_key: string
          repaired_ledger_ids?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          ledger_id?: string
          original_row?: Json
          repair_key?: string
          repaired_ledger_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_repair_audit_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "credits_ledger"
            referencedColumns: ["id"]
          },
        ]
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
      customer_profile_sync_operations: {
        Row: {
          attempts: number
          auth_synced_at: string | null
          claimed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          db_synced_at: string | null
          id: string
          last_error_code: string | null
          operation_key: string
          request_hash: string
          request_payload: Json
          result: Json
          square_customer_id: string
          square_synced_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          auth_synced_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          db_synced_at?: string | null
          id?: string
          last_error_code?: string | null
          operation_key: string
          request_hash: string
          request_payload: Json
          result?: Json
          square_customer_id: string
          square_synced_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          auth_synced_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          db_synced_at?: string | null
          id?: string
          last_error_code?: string | null
          operation_key?: string
          request_hash?: string
          request_payload?: Json
          result?: Json
          square_customer_id?: string
          square_synced_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profile_sync_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profile_sync_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "customer_profile_sync_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
        ]
      }
      customers: {
        Row: {
          address: Json | null
          created_at: string
          customer_visible_notes: string | null
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
          customer_visible_notes?: string | null
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
          customer_visible_notes?: string | null
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
      dashboard_mail_operations: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          kind: string
          last_error_code: string | null
          operation_key: string
          order_db_id: number
          recipient_email: string | null
          refund_id: number | null
          request_hash: string
          response: Json
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          kind: string
          last_error_code?: string | null
          operation_key: string
          order_db_id: number
          recipient_email?: string | null
          refund_id?: number | null
          request_hash: string
          response?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          kind?: string
          last_error_code?: string | null
          operation_key?: string
          order_db_id?: number
          recipient_email?: string | null
          refund_id?: number | null
          request_hash?: string
          response?: Json
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_mail_operations_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_mail_operations_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_mail_operations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refund_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_mail_operations_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refund_queue_with_details"
            referencedColumns: ["id"]
          },
        ]
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
      fomailer_dispatch_operations: {
        Row: {
          claimed_at: string
          created_at: string
          event_type: string
          finished_at: string | null
          last_error_code: string | null
          operation_key: string
          request_hash: string
          response: Json
          status: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          event_type: string
          finished_at?: string | null
          last_error_code?: string | null
          operation_key: string
          request_hash: string
          response?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          event_type?: string
          finished_at?: string | null
          last_error_code?: string | null
          operation_key?: string
          request_hash?: string
          response?: Json
          status?: string
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
      invoice_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_idempotency_key: string
          error_message: string | null
          id: string
          invoice_idempotency_key: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          order_db_id: number | null
          order_idempotency_key: string
          order_invoice_id: string | null
          publish_idempotency_key: string
          request_hash: string
          request_payload: Json
          response: Json | null
          square_customer_id: string | null
          square_invoice_id: string | null
          square_invoice_version: number | null
          square_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_idempotency_key?: string
          error_message?: string | null
          id?: string
          invoice_idempotency_key?: string
          location_id?: string | null
          operation_key: string
          operation_kind: string
          order_db_id?: number | null
          order_idempotency_key?: string
          order_invoice_id?: string | null
          publish_idempotency_key?: string
          request_hash: string
          request_payload?: Json
          response?: Json | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_invoice_version?: number | null
          square_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_idempotency_key?: string
          error_message?: string | null
          id?: string
          invoice_idempotency_key?: string
          location_id?: string | null
          operation_key?: string
          operation_kind?: string
          order_db_id?: number | null
          order_idempotency_key?: string
          order_invoice_id?: string | null
          publish_idempotency_key?: string
          request_hash?: string
          request_payload?: Json
          response?: Json | null
          square_customer_id?: string | null
          square_invoice_id?: string | null
          square_invoice_version?: number | null
          square_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_operations_order_invoice_id_fkey"
            columns: ["order_invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoices"
            referencedColumns: ["id"]
          },
        ]
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
      link_worker_requests: {
        Row: {
          action: string
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          id: string
          last_error: string | null
          location_id: string
          operation_key: string
          order_db_id: number
          order_number: number
          request_expires_at: string | null
          request_source: string
          requested_at: string
          requested_by: string | null
          requester_fingerprint: string | null
          requester_token_hash: string | null
          result: Json
          send_email: boolean
          square_order_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          id?: string
          last_error?: string | null
          location_id: string
          operation_key: string
          order_db_id: number
          order_number: number
          request_expires_at?: string | null
          request_source?: string
          requested_at?: string
          requested_by?: string | null
          requester_fingerprint?: string | null
          requester_token_hash?: string | null
          result?: Json
          send_email?: boolean
          square_order_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          id?: string
          last_error?: string | null
          location_id?: string
          operation_key?: string
          order_db_id?: number
          order_number?: number
          request_expires_at?: string | null
          request_source?: string
          requested_at?: string
          requested_by?: string | null
          requester_fingerprint?: string | null
          requester_token_hash?: string | null
          result?: Json
          send_email?: boolean
          square_order_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_worker_requests_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_worker_requests_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
          created_at: string | null
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
          created_at?: string | null
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
          created_at?: string | null
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
      loyalty_accounts: {
        Row: {
          balance_points: number
          created_at: string
          customer_id: string | null
          enrolled_at: string | null
          expiring_point_deadlines: Json
          id: string
          last_square_event_at: string | null
          lifetime_points: number
          phone_number: string | null
          program_segment: string
          projection_state: string
          raw_account: Json
          rolling_12_month_points: number
          square_created_at: string | null
          square_customer_id: string | null
          square_loyalty_account_id: string
          square_program_id: string
          square_updated_at: string | null
          status_tier: string
          synced_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance_points?: number
          created_at?: string
          customer_id?: string | null
          enrolled_at?: string | null
          expiring_point_deadlines?: Json
          id?: string
          last_square_event_at?: string | null
          lifetime_points?: number
          phone_number?: string | null
          program_segment?: string
          projection_state?: string
          raw_account?: Json
          rolling_12_month_points?: number
          square_created_at?: string | null
          square_customer_id?: string | null
          square_loyalty_account_id: string
          square_program_id: string
          square_updated_at?: string | null
          status_tier?: string
          synced_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance_points?: number
          created_at?: string
          customer_id?: string | null
          enrolled_at?: string | null
          expiring_point_deadlines?: Json
          id?: string
          last_square_event_at?: string | null
          lifetime_points?: number
          phone_number?: string | null
          program_segment?: string
          projection_state?: string
          raw_account?: Json
          rolling_12_month_points?: number
          square_created_at?: string | null
          square_customer_id?: string | null
          square_loyalty_account_id?: string
          square_program_id?: string
          square_updated_at?: string | null
          status_tier?: string
          synced_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
        ]
      }
      loyalty_customer_portal_control: {
        Row: {
          control_key: string
          enabled: boolean
          updated_at: string
          updated_by_role: string | null
          updated_by_user_id: string | null
          version: number
        }
        Insert: {
          control_key: string
          enabled?: boolean
          updated_at?: string
          updated_by_role?: string | null
          updated_by_user_id?: string | null
          version?: number
        }
        Update: {
          control_key?: string
          enabled?: boolean
          updated_at?: string
          updated_by_role?: string | null
          updated_by_user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      loyalty_customer_portal_control_audit: {
        Row: {
          actor_role: string
          actor_service: string
          actor_user_id: string | null
          changed_at: string
          control_key: string
          enabled: boolean
          from_version: number
          id: number
          previous_enabled: boolean
          to_version: number
        }
        Insert: {
          actor_role: string
          actor_service?: string
          actor_user_id?: string | null
          changed_at?: string
          control_key: string
          enabled: boolean
          from_version: number
          id?: never
          previous_enabled: boolean
          to_version: number
        }
        Update: {
          actor_role?: string
          actor_service?: string
          actor_user_id?: string | null
          changed_at?: string
          control_key?: string
          enabled?: boolean
          from_version?: number
          id?: never
          previous_enabled?: boolean
          to_version?: number
        }
        Relationships: []
      }
      loyalty_events: {
        Row: {
          event_source: string
          event_type: string
          id: string
          ingested_at: string
          location_id: string | null
          loyalty_account_id: string | null
          occurred_at: string
          payload_sha256: string | null
          points_change: number
          qualifying_points: number
          raw_event: Json
          reason: string | null
          square_loyalty_account_id: string
          square_loyalty_event_id: string
          square_order_id: string | null
          square_reward_id: string | null
          square_webhook_event_id: string | null
        }
        Insert: {
          event_source: string
          event_type: string
          id?: string
          ingested_at?: string
          location_id?: string | null
          loyalty_account_id?: string | null
          occurred_at: string
          payload_sha256?: string | null
          points_change?: number
          qualifying_points?: number
          raw_event?: Json
          reason?: string | null
          square_loyalty_account_id: string
          square_loyalty_event_id: string
          square_order_id?: string | null
          square_reward_id?: string | null
          square_webhook_event_id?: string | null
        }
        Update: {
          event_source?: string
          event_type?: string
          id?: string
          ingested_at?: string
          location_id?: string | null
          loyalty_account_id?: string | null
          occurred_at?: string
          payload_sha256?: string | null
          points_change?: number
          qualifying_points?: number
          raw_event?: Json
          reason?: string | null
          square_loyalty_account_id?: string
          square_loyalty_event_id?: string
          square_order_id?: string | null
          square_reward_id?: string | null
          square_webhook_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_events_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_operations: {
        Row: {
          actor_user_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          points: number | null
          provider_idempotency_key: string
          provider_response: Json | null
          provider_started_at: string | null
          provider_started_by_service: string | null
          reason: string | null
          request_hash: string
          request_payload: Json
          requested_by_service: string
          square_customer_id: string | null
          square_loyalty_account_id: string | null
          square_order_id: string | null
          square_reward_id: string | null
          square_reward_tier_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          location_id?: string | null
          operation_key: string
          operation_kind: string
          points?: number | null
          provider_idempotency_key?: string
          provider_response?: Json | null
          provider_started_at?: string | null
          provider_started_by_service?: string | null
          reason?: string | null
          request_hash: string
          request_payload?: Json
          requested_by_service: string
          square_customer_id?: string | null
          square_loyalty_account_id?: string | null
          square_order_id?: string | null
          square_reward_id?: string | null
          square_reward_tier_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          location_id?: string | null
          operation_key?: string
          operation_kind?: string
          points?: number | null
          provider_idempotency_key?: string
          provider_response?: Json | null
          provider_started_at?: string | null
          provider_started_by_service?: string | null
          reason?: string | null
          request_hash?: string
          request_payload?: Json
          requested_by_service?: string
          square_customer_id?: string | null
          square_loyalty_account_id?: string | null
          square_order_id?: string | null
          square_reward_id?: string | null
          square_reward_tier_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "loyalty_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
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
      note_media_assets: {
        Row: {
          attached_at: string | null
          byte_size: number
          created_at: string
          customer_id: string | null
          height: number
          id: string
          object_path: string | null
          order_db_id: number | null
          sha256: string
          status: string
          target_type: string
          updated_at: string
          upload_expires_at: string
          uploaded_by: string | null
          visibility: string
          width: number
        }
        Insert: {
          attached_at?: string | null
          byte_size: number
          created_at?: string
          customer_id?: string | null
          height: number
          id?: string
          object_path?: string | null
          order_db_id?: number | null
          sha256: string
          status?: string
          target_type: string
          updated_at?: string
          upload_expires_at?: string
          uploaded_by?: string | null
          visibility: string
          width: number
        }
        Update: {
          attached_at?: string | null
          byte_size?: number
          created_at?: string
          customer_id?: string | null
          height?: number
          id?: string
          object_path?: string | null
          order_db_id?: number | null
          sha256?: string
          status?: string
          target_type?: string
          updated_at?: string
          upload_expires_at?: string
          uploaded_by?: string | null
          visibility?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_media_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_media_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "note_media_assets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "note_media_assets_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_media_assets_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
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
      order_service_item_completions: {
        Row: {
          completed_at: string
          completed_by: string | null
          line_item_uid: string
          order_db_id: number
        }
        Insert: {
          completed_at?: string
          completed_by?: string | null
          line_item_uid: string
          order_db_id: number
        }
        Update: {
          completed_at?: string
          completed_by?: string | null
          line_item_uid?: string
          order_db_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_service_item_completions_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_service_item_completions_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: false
            referencedRelation: "orders2"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipstation_sync_operations: {
        Row: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claim_mode: string
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completion_source?: string | null
          created_at?: string
          created_by?: string | null
          external_shipment_id: string
          first_not_found_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_detail?: string | null
          last_reconciled_at?: string | null
          last_requeue_reason?: string | null
          last_requeued_at?: string | null
          last_requeued_by?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string | null
          operation_key?: string
          order_db_id: number
          producer_contract: string
          provider_attempts?: number
          provider_request?: Json | null
          provider_request_hash?: string | null
          provider_result?: Json
          provider_started_at?: string | null
          provider_started_token?: string | null
          rate_id?: string | null
          rate_request_id?: string | null
          reconcile_not_found_count?: number
          reconciliation_attempts?: number
          shipstation_shipment_id?: string | null
          source_invalidated_at?: string | null
          source_invalidation_reason?: string | null
          source_snapshot: Json
          status: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claim_mode?: string
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          completion_source?: string | null
          created_at?: string
          created_by?: string | null
          external_shipment_id?: string
          first_not_found_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_detail?: string | null
          last_reconciled_at?: string | null
          last_requeue_reason?: string | null
          last_requeued_at?: string | null
          last_requeued_by?: string | null
          lease_expires_at?: string | null
          next_attempt_at?: string | null
          operation_key?: string
          order_db_id?: number
          producer_contract?: string
          provider_attempts?: number
          provider_request?: Json | null
          provider_request_hash?: string | null
          provider_result?: Json
          provider_started_at?: string | null
          provider_started_token?: string | null
          rate_id?: string | null
          rate_request_id?: string | null
          reconcile_not_found_count?: number
          reconciliation_attempts?: number
          shipstation_shipment_id?: string | null
          source_invalidated_at?: string | null
          source_invalidation_reason?: string | null
          source_snapshot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_shipstation_sync_operations_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: true
            referencedRelation: "orders_with_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipstation_sync_operations_order_db_id_fkey"
            columns: ["order_db_id"]
            isOneToOne: true
            referencedRelation: "orders2"
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
          checkout_attempt_id: string | null
          completed: boolean
          confirmationSent: boolean | null
          created: string
          customer_visible_notes: string | null
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
          service_completion_updated_at: string | null
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
          checkout_attempt_id?: string | null
          completed?: boolean
          confirmationSent?: boolean | null
          created?: string
          customer_visible_notes?: string | null
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
          service_completion_updated_at?: string | null
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
          checkout_attempt_id?: string | null
          completed?: boolean
          confirmationSent?: boolean | null
          created?: string
          customer_visible_notes?: string | null
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
          service_completion_updated_at?: string | null
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
      public_download_link_regeneration_attempts: {
        Row: {
          capability_hash: string
          id: string
          operation_key: string
          outcome: string
          request_expires_at: string | null
          request_fingerprint: string
          request_id: string | null
          requested_at: string
          retry_after_seconds: number | null
          token_hash: string
        }
        Insert: {
          capability_hash: string
          id?: string
          operation_key: string
          outcome: string
          request_expires_at?: string | null
          request_fingerprint: string
          request_id?: string | null
          requested_at?: string
          retry_after_seconds?: number | null
          token_hash: string
        }
        Update: {
          capability_hash?: string
          id?: string
          operation_key?: string
          outcome?: string
          request_expires_at?: string | null
          request_fingerprint?: string
          request_id?: string | null
          requested_at?: string
          retry_after_seconds?: number | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_download_link_regeneration_attempts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "link_worker_requests"
            referencedColumns: ["id"]
          },
        ]
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
          attempted_at: string | null
          created_at: string
          error_message: string | null
          id: number
          idempotency_key: string
          initiated_by: string | null
          notification_policy: string
          order_db_id: number
          order_id: string
          processed_at: string | null
          reason: string | null
          request_hash: string
          request_key: string
          square_refund_id: string | null
          square_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attempted_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          idempotency_key?: string
          initiated_by?: string | null
          notification_policy?: string
          order_db_id: number
          order_id: string
          processed_at?: string | null
          reason?: string | null
          request_hash: string
          request_key: string
          square_refund_id?: string | null
          square_response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attempted_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: number
          idempotency_key?: string
          initiated_by?: string | null
          notification_policy?: string
          order_db_id?: number
          order_id?: string
          processed_at?: string | null
          reason?: string | null
          request_hash?: string
          request_key?: string
          square_refund_id?: string | null
          square_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rental_agreement_acceptances: {
        Row: {
          accepted_at: string
          agreement_version_id: string
          consented: boolean
          customer_id: string
          id: string
          metadata: Json
          request_ip_hash: string | null
          request_user_agent: string | null
          signature_hash: string
          typed_legal_name: string
        }
        Insert: {
          accepted_at?: string
          agreement_version_id: string
          consented: boolean
          customer_id: string
          id?: string
          metadata?: Json
          request_ip_hash?: string | null
          request_user_agent?: string | null
          signature_hash: string
          typed_legal_name: string
        }
        Update: {
          accepted_at?: string
          agreement_version_id?: string
          consented?: boolean
          customer_id?: string
          id?: string
          metadata?: Json
          request_ip_hash?: string | null
          request_user_agent?: string | null
          signature_hash?: string
          typed_legal_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_agreement_acceptances_agreement_version_id_fkey"
            columns: ["agreement_version_id"]
            isOneToOne: false
            referencedRelation: "rental_agreement_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreement_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreement_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_agreement_acceptances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
        ]
      }
      rental_agreement_versions: {
        Row: {
          active: boolean
          body: string
          content_hash: string
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          title: string
          version: string
        }
        Insert: {
          active?: boolean
          body: string
          content_hash: string
          created_at?: string
          created_by?: string | null
          effective_at: string
          id?: string
          title: string
          version: string
        }
        Update: {
          active?: boolean
          body?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          title?: string
          version?: string
        }
        Relationships: []
      }
      rental_audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: number
          location_id: string | null
          metadata: Json
          reason: string | null
          reservation_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: never
          location_id?: string | null
          metadata?: Json
          reason?: string | null
          reservation_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: never
          location_id?: string | null
          metadata?: Json
          reason?: string | null
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_audit_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_audit_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_business_hours: {
        Row: {
          active: boolean
          closes_at: string
          created_at: string
          day_of_week: number
          facility_id: string | null
          id: string
          location_id: string
          opens_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          closes_at: string
          created_at?: string
          day_of_week: number
          facility_id?: string | null
          id?: string
          location_id: string
          opens_at: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          closes_at?: string
          created_at?: string
          day_of_week?: number
          facility_id?: string | null
          id?: string
          location_id?: string
          opens_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_business_hours_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_business_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_business_hours: {
        Row: {
          active: boolean
          closes_at: string
          created_at: string
          day_of_week: number
          id: string
          location_id: string
          opens_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          closes_at: string
          created_at?: string
          day_of_week: number
          id?: string
          location_id: string
          opens_at: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          closes_at?: string
          created_at?: string
          day_of_week?: number
          id?: string
          location_id?: string
          opens_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_business_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_cancellation_requests: {
        Row: {
          camera_rental_id: string
          completed_at: string | null
          created_at: string
          customer_id: string
          financial_operation_id: string
          id: string
          last_error: string | null
          location_id: string
          reason: string | null
          refund_cents: number
          refunded_at: string | null
          request_key: string
          request_snapshot: Json
          requested_at: string
          requested_by: string | null
          reservation_id: string
          status: string
          updated_at: string
        }
        Insert: {
          camera_rental_id: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          financial_operation_id: string
          id?: string
          last_error?: string | null
          location_id: string
          reason?: string | null
          refund_cents: number
          refunded_at?: string | null
          request_key: string
          request_snapshot?: Json
          requested_at?: string
          requested_by?: string | null
          reservation_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          camera_rental_id?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          financial_operation_id?: string
          id?: string
          last_error?: string | null
          location_id?: string
          reason?: string | null
          refund_cents?: number
          refunded_at?: string | null
          request_key?: string
          request_snapshot?: Json
          requested_at?: string
          requested_by?: string | null
          reservation_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_cancellation_requests_camera_rental_id_fkey"
            columns: ["camera_rental_id"]
            isOneToOne: true
            referencedRelation: "rental_camera_rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_financial_operation_id_fkey"
            columns: ["financial_operation_id"]
            isOneToOne: true
            referencedRelation: "rental_financial_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_cancellation_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_duration_options: {
        Row: {
          active: boolean
          created_at: string
          duration_days: number
          id: string
          label: string
          product_id: string
          rental_fee_cents: number
          sort_order: number
          square_variation_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          duration_days: number
          id?: string
          label: string
          product_id: string
          rental_fee_cents: number
          sort_order?: number
          square_variation_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          duration_days?: number
          id?: string
          label?: string
          product_id?: string
          rental_fee_cents?: number
          sort_order?: number
          square_variation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_duration_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_products"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_products: {
        Row: {
          active: boolean
          created_at: string
          deposit_cents: number
          description: string | null
          fulfillment_methods: string[]
          id: string
          inspection_buffer_hours: number
          location_id: string
          metadata: Json
          name: string
          outbound_buffer_hours: number
          prep_buffer_hours: number
          return_buffer_hours: number
          slug: string
          square_sync_status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deposit_cents?: number
          description?: string | null
          fulfillment_methods?: string[]
          id?: string
          inspection_buffer_hours?: number
          location_id: string
          metadata?: Json
          name: string
          outbound_buffer_hours?: number
          prep_buffer_hours?: number
          return_buffer_hours?: number
          slug: string
          square_sync_status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deposit_cents?: number
          description?: string | null
          fulfillment_methods?: string[]
          id?: string
          inspection_buffer_hours?: number
          location_id?: string
          metadata?: Json
          name?: string
          outbound_buffer_hours?: number
          prep_buffer_hours?: number
          return_buffer_hours?: number
          slug?: string
          square_sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_quote_operations: {
        Row: {
          created_at: string
          customer_id: string
          delivery_address: Json | null
          duration_option_id: string
          expires_at: string
          fulfillment_method: string
          id: string
          location_id: string
          product_id: string
          provider_quote: Json
          request_hash: string
          shipping_cents: number
          tax_cents: number
          use_start: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_address?: Json | null
          duration_option_id: string
          expires_at: string
          fulfillment_method: string
          id: string
          location_id: string
          product_id: string
          provider_quote: Json
          request_hash: string
          shipping_cents: number
          tax_cents: number
          use_start: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_address?: Json | null
          duration_option_id?: string
          expires_at?: string
          fulfillment_method?: string
          id?: string
          location_id?: string
          product_id?: string
          provider_quote?: Json
          request_hash?: string
          shipping_cents?: number
          tax_cents?: number
          use_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_quote_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_quote_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_camera_quote_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_camera_quote_operations_duration_option_id_fkey"
            columns: ["duration_option_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_duration_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_quote_operations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_quote_operations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_products"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_rentals: {
        Row: {
          agreement_acceptance_id: string
          coi_review_id: string | null
          created_at: string
          delivery_address: Json | null
          deposit_cents: number
          duration_option_id: string
          extension_count: number
          id: string
          product_id: string
          rental_fee_cents: number
          reservation_id: string
          shipping_cents: number
          status: string
          tax_cents: number
          unit_id: string
          updated_at: string
          use_end_date: string
          use_start_date: string
        }
        Insert: {
          agreement_acceptance_id: string
          coi_review_id?: string | null
          created_at?: string
          delivery_address?: Json | null
          deposit_cents: number
          duration_option_id: string
          extension_count?: number
          id?: string
          product_id: string
          rental_fee_cents: number
          reservation_id: string
          shipping_cents?: number
          status?: string
          tax_cents?: number
          unit_id: string
          updated_at?: string
          use_end_date: string
          use_start_date: string
        }
        Update: {
          agreement_acceptance_id?: string
          coi_review_id?: string | null
          created_at?: string
          delivery_address?: Json | null
          deposit_cents?: number
          duration_option_id?: string
          extension_count?: number
          id?: string
          product_id?: string
          rental_fee_cents?: number
          reservation_id?: string
          shipping_cents?: number
          status?: string
          tax_cents?: number
          unit_id?: string
          updated_at?: string
          use_end_date?: string
          use_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_rentals_agreement_acceptance_id_fkey"
            columns: ["agreement_acceptance_id"]
            isOneToOne: false
            referencedRelation: "rental_agreement_acceptances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_rentals_coi_review_id_fkey"
            columns: ["coi_review_id"]
            isOneToOne: false
            referencedRelation: "rental_coi_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_rentals_duration_option_id_fkey"
            columns: ["duration_option_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_duration_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_rentals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_rentals_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_rentals_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_units"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_camera_units: {
        Row: {
          active: boolean
          asset_tag: string
          condition_status: string
          created_at: string
          id: string
          last_reserved_at: string | null
          metadata: Json
          operational_status: string
          product_id: string
          resource_id: string
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          asset_tag: string
          condition_status?: string
          created_at?: string
          id?: string
          last_reserved_at?: string | null
          metadata?: Json
          operational_status?: string
          product_id: string
          resource_id: string
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          asset_tag?: string
          condition_status?: string
          created_at?: string
          id?: string
          last_reserved_at?: string | null
          metadata?: Json
          operational_status?: string
          product_id?: string
          resource_id?: string
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_camera_units_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_camera_units_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "rental_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_catalog_operations: {
        Row: {
          actor_id: string
          created_at: string
          location_id: string | null
          operation_key: string
          operation_type: string
          request_payload: Json
          result: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          location_id?: string | null
          operation_key: string
          operation_type: string
          request_payload: Json
          result: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          location_id?: string | null
          operation_key?: string
          operation_type?: string
          request_payload?: Json
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rental_catalog_operations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_checkout_operations: {
        Row: {
          camera_rental_id: string | null
          created_at: string
          deposit_cents: number
          expected_amount_cents: number
          id: string
          last_error_code: string | null
          last_provider_occurred_at: string | null
          operation_key: string
          provider_request_hash: string | null
          provider_request_snapshot: Json
          provider_started_at: string | null
          reconciled_at: string | null
          recovery_attempts: number
          recovery_available_at: string
          recovery_lease_expires_at: string | null
          recovery_lease_owner: string | null
          rental_fee_cents: number
          request_hash: string
          reservation_id: string
          response: Json
          shipping_cents: number
          square_order_id: string | null
          square_payment_id: string | null
          status: string
          tax_cents: number
          updated_at: string
        }
        Insert: {
          camera_rental_id?: string | null
          created_at?: string
          deposit_cents?: number
          expected_amount_cents: number
          id?: string
          last_error_code?: string | null
          last_provider_occurred_at?: string | null
          operation_key: string
          provider_request_hash?: string | null
          provider_request_snapshot?: Json
          provider_started_at?: string | null
          reconciled_at?: string | null
          recovery_attempts?: number
          recovery_available_at?: string
          recovery_lease_expires_at?: string | null
          recovery_lease_owner?: string | null
          rental_fee_cents?: number
          request_hash: string
          reservation_id: string
          response?: Json
          shipping_cents?: number
          square_order_id?: string | null
          square_payment_id?: string | null
          status?: string
          tax_cents?: number
          updated_at?: string
        }
        Update: {
          camera_rental_id?: string | null
          created_at?: string
          deposit_cents?: number
          expected_amount_cents?: number
          id?: string
          last_error_code?: string | null
          last_provider_occurred_at?: string | null
          operation_key?: string
          provider_request_hash?: string | null
          provider_request_snapshot?: Json
          provider_started_at?: string | null
          reconciled_at?: string | null
          recovery_attempts?: number
          recovery_available_at?: string
          recovery_lease_expires_at?: string | null
          recovery_lease_owner?: string | null
          rental_fee_cents?: number
          request_hash?: string
          reservation_id?: string
          response?: Json
          shipping_cents?: number
          square_order_id?: string | null
          square_payment_id?: string | null
          status?: string
          tax_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_checkout_operations_camera_rental_id_fkey"
            columns: ["camera_rental_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_checkout_operations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_coi_reviews: {
        Row: {
          approved_deposit_cents: number | null
          coverage_cents: number | null
          covered_value_ceiling_cents: number | null
          created_at: string
          customer_id: string
          deductible_cents: number | null
          document_deleted_at: string | null
          document_purge_error: string | null
          document_purge_status: string
          effective_from: string | null
          effective_to: string | null
          id: string
          location_id: string
          metadata: Json
          purge_after: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_paths: string[]
          submission_key: string
          updated_at: string
        }
        Insert: {
          approved_deposit_cents?: number | null
          coverage_cents?: number | null
          covered_value_ceiling_cents?: number | null
          created_at?: string
          customer_id: string
          deductible_cents?: number | null
          document_deleted_at?: string | null
          document_purge_error?: string | null
          document_purge_status?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          location_id: string
          metadata?: Json
          purge_after?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_paths?: string[]
          submission_key: string
          updated_at?: string
        }
        Update: {
          approved_deposit_cents?: number | null
          coverage_cents?: number | null
          covered_value_ceiling_cents?: number | null
          created_at?: string
          customer_id?: string
          deductible_cents?: number | null
          document_deleted_at?: string | null
          document_purge_error?: string | null
          document_purge_status?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          location_id?: string
          metadata?: Json
          purge_after?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_paths?: string[]
          submission_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_coi_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_coi_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_coi_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_coi_reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_customer_verifications: {
        Row: {
          created_at: string
          customer_id: string
          document_deleted_at: string | null
          document_fingerprint: string | null
          document_purge_error: string | null
          document_purge_status: string
          expires_at: string | null
          id: string
          location_id: string
          metadata: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_paths: string[]
          submission_key: string
          updated_at: string
          verification_type: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          document_deleted_at?: string | null
          document_fingerprint?: string | null
          document_purge_error?: string | null
          document_purge_status?: string
          expires_at?: string | null
          id?: string
          location_id: string
          metadata?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_paths?: string[]
          submission_key: string
          updated_at?: string
          verification_type?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          document_deleted_at?: string | null
          document_fingerprint?: string | null
          document_purge_error?: string | null
          document_purge_status?: string
          expires_at?: string | null
          id?: string
          location_id?: string
          metadata?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_paths?: string[]
          submission_key?: string
          updated_at?: string
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_customer_verifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_customer_verifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_customer_verifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_customer_verifications_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_addon_units: {
        Row: {
          active: boolean
          addon_id: string
          condition_status: string
          created_at: string
          id: string
          notes: string | null
          operational_status: string
          resource_id: string
          unit_label: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          addon_id: string
          condition_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          operational_status?: string
          resource_id: string
          unit_label: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          addon_id?: string
          condition_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          operational_status?: string
          resource_id?: string
          unit_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_addon_units_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_addon_units_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "rental_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_addons: {
        Row: {
          active: boolean
          category: string | null
          compatibility_notes: string | null
          created_at: string
          credit_rate: number
          description: string | null
          eligible_facility_ids: string[]
          focal_length: string | null
          id: string
          location_id: string
          make_model: string | null
          metadata: Json
          name: string
          paper_sizes: string[]
          pricing_mode: string
          review_required: boolean
          slug: string
          sort_order: number
          source_pool: string | null
          supported_formats: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          compatibility_notes?: string | null
          created_at?: string
          credit_rate?: number
          description?: string | null
          eligible_facility_ids?: string[]
          focal_length?: string | null
          id?: string
          location_id: string
          make_model?: string | null
          metadata?: Json
          name: string
          paper_sizes?: string[]
          pricing_mode?: string
          review_required?: boolean
          slug: string
          sort_order?: number
          source_pool?: string | null
          supported_formats?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          compatibility_notes?: string | null
          created_at?: string
          credit_rate?: number
          description?: string | null
          eligible_facility_ids?: string[]
          focal_length?: string | null
          id?: string
          location_id?: string
          make_model?: string | null
          metadata?: Json
          name?: string
          paper_sizes?: string[]
          pricing_mode?: string
          review_required?: boolean
          slug?: string
          sort_order?: number
          source_pool?: string | null
          supported_formats?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_addons_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_bays: {
        Row: {
          active: boolean
          capabilities: string[]
          condition_notes: string | null
          created_at: string
          facility_id: string
          fixed_kit: boolean
          id: string
          make_model: string | null
          metadata: Json
          name: string
          operational_status: string
          resource_id: string
          slug: string
          sort_order: number
          supported_formats: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          capabilities: string[]
          condition_notes?: string | null
          created_at?: string
          facility_id: string
          fixed_kit?: boolean
          id?: string
          make_model?: string | null
          metadata?: Json
          name: string
          operational_status?: string
          resource_id: string
          slug: string
          sort_order?: number
          supported_formats?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          capabilities?: string[]
          condition_notes?: string | null
          created_at?: string
          facility_id?: string
          fixed_kit?: boolean
          id?: string
          make_model?: string | null
          metadata?: Json
          name?: string
          operational_status?: string
          resource_id?: string
          slug?: string
          sort_order?: number
          supported_formats?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_bays_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_bays_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "rental_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_billable_reviews: {
        Row: {
          billable_id: string
          id: string
          location_id: string
          operation_key: string
          reviewed_at: string
          reviewed_by: string
          revision_id: string
          warnings_acknowledged: string[]
        }
        Insert: {
          billable_id: string
          id?: string
          location_id: string
          operation_key: string
          reviewed_at?: string
          reviewed_by: string
          revision_id: string
          warnings_acknowledged?: string[]
        }
        Update: {
          billable_id?: string
          id?: string
          location_id?: string
          operation_key?: string
          reviewed_at?: string
          reviewed_by?: string
          revision_id?: string
          warnings_acknowledged?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_billable_reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_billable_reviews_revision_fkey"
            columns: ["revision_id", "billable_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_billable_revisions"
            referencedColumns: ["id", "billable_id"]
          },
        ]
      }
      rental_darkroom_billable_revisions: {
        Row: {
          amount_cents: number | null
          billable_id: string
          billing_unit: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          display_name: string
          duration_minutes: number | null
          id: string
          is_taxable: boolean
          location_id: string
          operation_key: string
          revision: number
          source_mode: string
          source_snapshot_id: string | null
          warnings: string[]
        }
        Insert: {
          amount_cents?: number | null
          billable_id: string
          billing_unit?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          display_name: string
          duration_minutes?: number | null
          id?: string
          is_taxable?: boolean
          location_id: string
          operation_key: string
          revision: number
          source_mode: string
          source_snapshot_id?: string | null
          warnings?: string[]
        }
        Update: {
          amount_cents?: number | null
          billable_id?: string
          billing_unit?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          display_name?: string
          duration_minutes?: number | null
          id?: string
          is_taxable?: boolean
          location_id?: string
          operation_key?: string
          revision?: number
          source_mode?: string
          source_snapshot_id?: string | null
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_billable_revisions_billable_location_fkey"
            columns: ["billable_id", "location_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_billables"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "rental_darkroom_billable_revisions_source_location_fkey"
            columns: ["source_snapshot_id", "location_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_reference_snapshots"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      rental_darkroom_billables: {
        Row: {
          addon_id: string | null
          bay_id: string | null
          created_at: string
          id: string
          location_id: string
        }
        Insert: {
          addon_id?: string | null
          bay_id?: string | null
          created_at?: string
          id?: string
          location_id: string
        }
        Update: {
          addon_id?: string | null
          bay_id?: string | null
          created_at?: string
          id?: string
          location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_billables_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_billables_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_billables_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_booking_addons: {
        Row: {
          addon_id: string
          booking_id: string
          created_at: string
          credit_rate: number
          credits_charged: number
          id: string
          pricing_mode: string
          quantity: number
        }
        Insert: {
          addon_id: string
          booking_id: string
          created_at?: string
          credit_rate: number
          credits_charged: number
          id?: string
          pricing_mode: string
          quantity: number
        }
        Update: {
          addon_id?: string
          booking_id?: string
          created_at?: string
          credit_rate?: number
          credits_charged?: number
          id?: string
          pricing_mode?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_booking_credit_allocations: {
        Row: {
          booking_id: string
          created_at: string
          credits_burned: number
          credits_refunded: number
          id: string
          lot_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          credits_burned: number
          credits_refunded?: number
          id?: string
          lot_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          credits_burned?: number
          credits_refunded?: number
          id?: string
          lot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_booking_credit_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_booking_credit_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_credit_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_bookings: {
        Row: {
          addon_credits: number
          bay_credits: number
          bay_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          capability: string
          completed_at: string | null
          created_at: string
          duration_hours: number
          emergency_reschedule_used: boolean
          facility_id: string
          id: string
          membership_id: string
          reschedule_count: number
          reservation_id: string
          status: string
          total_credits: number | null
          updated_at: string
        }
        Insert: {
          addon_credits?: number
          bay_credits: number
          bay_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capability: string
          completed_at?: string | null
          created_at?: string
          duration_hours: number
          emergency_reschedule_used?: boolean
          facility_id: string
          id?: string
          membership_id: string
          reschedule_count?: number
          reservation_id: string
          status?: string
          total_credits?: number | null
          updated_at?: string
        }
        Update: {
          addon_credits?: number
          bay_credits?: number
          bay_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capability?: string
          completed_at?: string | null
          created_at?: string
          duration_hours?: number
          emergency_reschedule_used?: boolean
          facility_id?: string
          id?: string
          membership_id?: string
          reschedule_count?: number
          reservation_id?: string
          status?: string
          total_credits?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_bookings_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_bookings_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_bookings_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_checkout_price_attempts: {
        Row: {
          attempt_key: string
          attempt_number: number
          authorization_id: string | null
          authorized_at: string
          provider_request_sha256: string
          reconciliation_snapshot: Json | null
          reconciliation_snapshot_sha256: string | null
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Insert: {
          attempt_key: string
          attempt_number: number
          authorization_id?: string | null
          authorized_at?: string
          provider_request_sha256: string
          reconciliation_snapshot?: Json | null
          reconciliation_snapshot_sha256?: string | null
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Update: {
          attempt_key?: string
          attempt_number?: number
          authorization_id?: string | null
          authorized_at?: string
          provider_request_sha256?: string
          reconciliation_snapshot?: Json | null
          reconciliation_snapshot_sha256?: string | null
          request_id?: string
          worker_contract_version?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_checkout_price_attempts_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_checkout_price_attempts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_checkout_price_authorizations: {
        Row: {
          actor_id: string
          authorization_reason: string
          authorized_at: string
          command_key: string | null
          expires_at: string
          id: string
          request_id: string
        }
        Insert: {
          actor_id: string
          authorization_reason: string
          authorized_at: string
          command_key?: string | null
          expires_at: string
          id?: string
          request_id: string
        }
        Update: {
          actor_id?: string
          authorization_reason?: string
          authorized_at?: string
          command_key?: string | null
          expires_at?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_checkout_price_authorizations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_checkout_price_escalations: {
        Row: {
          actor_id: string
          attempt_count: number
          command_key: string
          escalated_at: string
          id: string
          latest_attempt_key: string
          latest_result_id: string
          location_id: string
          observed_at: string
          provider_idempotency_key: string
          provider_request_sha256: string
          reason_code: string
          reconciliation_snapshot: Json
          reconciliation_snapshot_sha256: string
          request_id: string
          square_location_id: string
        }
        Insert: {
          actor_id: string
          attempt_count: number
          command_key: string
          escalated_at?: string
          id?: string
          latest_attempt_key: string
          latest_result_id: string
          location_id: string
          observed_at: string
          provider_idempotency_key: string
          provider_request_sha256: string
          reason_code: string
          reconciliation_snapshot: Json
          reconciliation_snapshot_sha256: string
          request_id: string
          square_location_id: string
        }
        Update: {
          actor_id?: string
          attempt_count?: number
          command_key?: string
          escalated_at?: string
          id?: string
          latest_attempt_key?: string
          latest_result_id?: string
          location_id?: string
          observed_at?: string
          provider_idempotency_key?: string
          provider_request_sha256?: string
          reason_code?: string
          reconciliation_snapshot?: Json
          reconciliation_snapshot_sha256?: string
          request_id?: string
          square_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_checkout_price_escalati_latest_attempt_key_fkey"
            columns: ["latest_attempt_key"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_attempts"
            referencedColumns: ["attempt_key"]
          },
          {
            foreignKeyName: "rental_darkroom_checkout_price_escalation_latest_result_id_fkey"
            columns: ["latest_result_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_checkout_price_escalations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_checkout_price_escalations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_checkout_price_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_checkout_price_requests: {
        Row: {
          amount_cents: number
          completed_at: string | null
          currency: string
          destination_category_id: string
          display_name: string
          id: string
          kind: string
          last_error_code: string | null
          location_id: string
          operation_key: string
          provider_idempotency_key: string
          provider_parent_catalog_version: number | null
          provider_parent_id: string | null
          provider_request: Json
          provider_request_sha256: string
          provider_variation_catalog_version: number | null
          provider_variation_id: string | null
          requested_at: string
          requested_by: string
          square_location_id: string
          status: string
          terminal_completion_key: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          completed_at?: string | null
          currency?: string
          destination_category_id: string
          display_name: string
          id?: string
          kind: string
          last_error_code?: string | null
          location_id: string
          operation_key: string
          provider_idempotency_key: string
          provider_parent_catalog_version?: number | null
          provider_parent_id?: string | null
          provider_request: Json
          provider_request_sha256: string
          provider_variation_catalog_version?: number | null
          provider_variation_id?: string | null
          requested_at?: string
          requested_by: string
          square_location_id: string
          status?: string
          terminal_completion_key?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          completed_at?: string | null
          currency?: string
          destination_category_id?: string
          display_name?: string
          id?: string
          kind?: string
          last_error_code?: string | null
          location_id?: string
          operation_key?: string
          provider_idempotency_key?: string
          provider_parent_catalog_version?: number | null
          provider_parent_id?: string | null
          provider_request?: Json
          provider_request_sha256?: string
          provider_variation_catalog_version?: number | null
          provider_variation_id?: string | null
          requested_at?: string
          requested_by?: string
          square_location_id?: string
          status?: string
          terminal_completion_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_checkout_price_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_checkout_price_results: {
        Row: {
          attempt_key: string
          completion_key: string
          created_at: string
          error_code: string | null
          id: string
          outcome: string
          provider_result: Json | null
          provider_result_sha256: string | null
          request_id: string
        }
        Insert: {
          attempt_key: string
          completion_key: string
          created_at?: string
          error_code?: string | null
          id?: string
          outcome: string
          provider_result?: Json | null
          provider_result_sha256?: string | null
          request_id: string
        }
        Update: {
          attempt_key?: string
          completion_key?: string
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: string
          provider_result?: Json | null
          provider_result_sha256?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_checkout_price_results_attempt_key_fkey"
            columns: ["attempt_key"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_attempts"
            referencedColumns: ["attempt_key"]
          },
          {
            foreignKeyName: "rental_darkroom_checkout_price_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_checkout_price_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_credit_entries: {
        Row: {
          actor_id: string | null
          amount: number
          booking_id: string | null
          created_at: string
          customer_id: string
          entry_type: string
          id: string
          lot_id: string
          reason: string | null
          reversal_of: string | null
          source_ref: string | null
        }
        Insert: {
          actor_id?: string | null
          amount: number
          booking_id?: string | null
          created_at?: string
          customer_id: string
          entry_type: string
          id?: string
          lot_id: string
          reason?: string | null
          reversal_of?: string | null
          source_ref?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number
          booking_id?: string | null
          created_at?: string
          customer_id?: string
          entry_type?: string
          id?: string
          lot_id?: string
          reason?: string | null
          reversal_of?: string | null
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_credit_entries_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_entries_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_credit_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_entries_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_credit_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_credit_lots: {
        Row: {
          created_at: string
          credits_granted: number
          credits_remaining: number
          customer_id: string
          expires_at: string
          granted_at: string
          id: string
          location_id: string
          membership_id: string | null
          metadata: Json
          revoked_at: string | null
          source_ref: string
          source_type: string
        }
        Insert: {
          created_at?: string
          credits_granted: number
          credits_remaining: number
          customer_id: string
          expires_at: string
          granted_at: string
          id?: string
          location_id: string
          membership_id?: string | null
          metadata?: Json
          revoked_at?: string | null
          source_ref: string
          source_type: string
        }
        Update: {
          created_at?: string
          credits_granted?: number
          credits_remaining?: number
          customer_id?: string
          expires_at?: string
          granted_at?: string
          id?: string
          location_id?: string
          membership_id?: string | null
          metadata?: Json
          revoked_at?: string | null
          source_ref?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_credit_lots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_lots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_lots_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_lots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_credit_lots_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_customer_controls: {
        Row: {
          booking_enabled: boolean
          created_at: string
          location_id: string
          membership_checkout_enabled: boolean
          topoff_checkout_enabled: boolean
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          booking_enabled?: boolean
          created_at?: string
          location_id: string
          membership_checkout_enabled?: boolean
          topoff_checkout_enabled?: boolean
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          booking_enabled?: boolean
          created_at?: string
          location_id?: string
          membership_checkout_enabled?: boolean
          topoff_checkout_enabled?: boolean
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_customer_controls_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_facilities: {
        Row: {
          active: boolean
          booking_horizon_days: number
          capabilities: string[]
          created_at: string
          id: string
          lead_time_minutes: number
          location_id: string
          max_duration_hours: number
          metadata: Json
          min_duration_hours: number
          name: string
          orientation_enforced: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          booking_horizon_days?: number
          capabilities?: string[]
          created_at?: string
          id?: string
          lead_time_minutes?: number
          location_id: string
          max_duration_hours?: number
          metadata?: Json
          min_duration_hours?: number
          name: string
          orientation_enforced?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          booking_horizon_days?: number
          capabilities?: string[]
          created_at?: string
          id?: string
          lead_time_minutes?: number
          location_id?: string
          max_duration_hours?: number
          metadata?: Json
          min_duration_hours?: number
          name?: string
          orientation_enforced?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_facilities_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_membership_plans: {
        Row: {
          active: boolean
          bank_cap: number
          booking_horizon_days: number
          created_at: string
          credit_expiry_days: number
          id: string
          metadata: Json
          monthly_credits: number
          name: string
          price_cents: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank_cap: number
          booking_horizon_days?: number
          created_at?: string
          credit_expiry_days?: number
          id?: string
          metadata?: Json
          monthly_credits: number
          name: string
          price_cents: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank_cap?: number
          booking_horizon_days?: number
          created_at?: string
          credit_expiry_days?: number
          id?: string
          metadata?: Json
          monthly_credits?: number
          name?: string
          price_cents?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      rental_darkroom_memberships: {
        Row: {
          cancel_at: string | null
          created_at: string
          customer_id: string
          ended_at: string | null
          home_location_id: string
          id: string
          last_provider_event_id: string | null
          last_provider_occurred_at: string | null
          last_provider_version: number | null
          metadata: Json
          paid_through_at: string | null
          period_start_at: string | null
          plan_id: string
          square_customer_id: string | null
          square_subscription_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          created_at?: string
          customer_id: string
          ended_at?: string | null
          home_location_id: string
          id?: string
          last_provider_event_id?: string | null
          last_provider_occurred_at?: string | null
          last_provider_version?: number | null
          metadata?: Json
          paid_through_at?: string | null
          period_start_at?: string | null
          plan_id: string
          square_customer_id?: string | null
          square_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          created_at?: string
          customer_id?: string
          ended_at?: string | null
          home_location_id?: string
          id?: string
          last_provider_event_id?: string | null
          last_provider_occurred_at?: string | null
          last_provider_version?: number | null
          metadata?: Json
          paid_through_at?: string | null
          period_start_at?: string | null
          plan_id?: string
          square_customer_id?: string | null
          square_subscription_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_memberships_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_memberships_home_location_id_fkey"
            columns: ["home_location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_memberships_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_orientations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          capability: string
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          location_id: string
          notes: string | null
          revoked_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          capability: string
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          location_id: string
          notes?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          capability?: string
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_orientations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_orientations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_orientations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_darkroom_orientations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_plan_locations: {
        Row: {
          created_at: string
          location_id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          plan_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_plan_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_plan_locations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_pricing_bay_assignments: {
        Row: {
          bay_id: string
          class_key: string
          location_id: string
          pricing_version_id: string
        }
        Insert: {
          bay_id: string
          class_key: string
          location_id: string
          pricing_version_id: string
        }
        Update: {
          bay_id?: string
          class_key?: string
          location_id?: string
          pricing_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_pricing_bay_assignments_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_pricing_bay_assignments_class_fkey"
            columns: ["pricing_version_id", "class_key"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_pricing_classes"
            referencedColumns: ["pricing_version_id", "class_key"]
          },
          {
            foreignKeyName: "rental_darkroom_pricing_bay_assignments_version_location_fkey"
            columns: ["pricing_version_id", "location_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_pricing_versions"
            referencedColumns: ["id", "location_id"]
          },
        ]
      }
      rental_darkroom_pricing_classes: {
        Row: {
          class_key: string
          full_day_hours: number
          full_day_price_cents: number
          half_day_hours: number
          half_day_price_cents: number
          hourly_minimum_hours: number
          hourly_price_cents: number
          label: string
          pricing_version_id: string
          time_pack_hours: number
          time_pack_price_cents: number
          time_pack_validity_months: number
        }
        Insert: {
          class_key: string
          full_day_hours: number
          full_day_price_cents: number
          half_day_hours: number
          half_day_price_cents: number
          hourly_minimum_hours: number
          hourly_price_cents: number
          label: string
          pricing_version_id: string
          time_pack_hours: number
          time_pack_price_cents: number
          time_pack_validity_months: number
        }
        Update: {
          class_key?: string
          full_day_hours?: number
          full_day_price_cents?: number
          half_day_hours?: number
          half_day_price_cents?: number
          hourly_minimum_hours?: number
          hourly_price_cents?: number
          label?: string
          pricing_version_id?: string
          time_pack_hours?: number
          time_pack_price_cents?: number
          time_pack_validity_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_pricing_classes_pricing_version_id_fkey"
            columns: ["pricing_version_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_pricing_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_pricing_versions: {
        Row: {
          contract_version: string
          currency: string
          id: string
          location_id: string
          member_discount_bps: number
          operation_key: string
          orientation_member_price_cents: number
          orientation_price_cents: number
          published_at: string
          published_by: string
          version: number
        }
        Insert: {
          contract_version?: string
          currency?: string
          id?: string
          location_id: string
          member_discount_bps: number
          operation_key: string
          orientation_member_price_cents: number
          orientation_price_cents: number
          published_at?: string
          published_by: string
          version: number
        }
        Update: {
          contract_version?: string
          currency?: string
          id?: string
          location_id?: string
          member_discount_bps?: number
          operation_key?: string
          orientation_member_price_cents?: number
          orientation_price_cents?: number
          published_at?: string
          published_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_pricing_versions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_binding_version_observations: {
        Row: {
          billable_id: string
          created_at: string
          id: string
          location_id: string
          observed_at: string
          observed_item_catalog_version: number
          observed_variation_catalog_version: number
          operation_key: string
          previous_observation_id: string | null
          prior_item_catalog_version: number
          prior_variation_catalog_version: number
          provider_snapshot: Json
          provider_snapshot_sha256: string
          recorded_by: string
          semantic_sha256: string
          source_result_id: string
          source_sync_request_id: string
          square_item_id: string
          square_location_id: string
          square_variation_id: string
        }
        Insert: {
          billable_id: string
          created_at?: string
          id?: string
          location_id: string
          observed_at: string
          observed_item_catalog_version: number
          observed_variation_catalog_version: number
          operation_key: string
          previous_observation_id?: string | null
          prior_item_catalog_version: number
          prior_variation_catalog_version: number
          provider_snapshot: Json
          provider_snapshot_sha256: string
          recorded_by: string
          semantic_sha256: string
          source_result_id: string
          source_sync_request_id: string
          square_item_id: string
          square_location_id: string
          square_variation_id: string
        }
        Update: {
          billable_id?: string
          created_at?: string
          id?: string
          location_id?: string
          observed_at?: string
          observed_item_catalog_version?: number
          observed_variation_catalog_version?: number
          operation_key?: string
          previous_observation_id?: string | null
          prior_item_catalog_version?: number
          prior_variation_catalog_version?: number
          provider_snapshot?: Json
          provider_snapshot_sha256?: string
          recorded_by?: string
          semantic_sha256?: string
          source_result_id?: string
          source_sync_request_id?: string
          square_item_id?: string
          square_location_id?: string
          square_variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_binding_ver_previous_observation_id_fkey"
            columns: ["previous_observation_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_binding_version_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_binding_vers_source_sync_request_id_fkey"
            columns: ["source_sync_request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_binding_version_ob_source_result_id_fkey"
            columns: ["source_result_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_binding_version_observa_billable_id_fkey"
            columns: ["billable_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_billables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_binding_version_observa_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_destination_profiles: {
        Row: {
          created_at: string
          id: string
          location_id: string
          observed_at: string
          product_type: string
          reporting_category_id: string
          reporting_category_name: string
          reporting_category_version: number
          snapshot_kind: string
          square_api_version: string
          square_location_id: string
          tax_application_mode: string | null
          tax_applies_to_custom_amounts: boolean | null
          tax_calculation_phase: string | null
          tax_catalog_version: number | null
          tax_id: string | null
          tax_inclusion_type: string | null
          tax_name: string | null
          tax_percentage: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          observed_at: string
          product_type?: string
          reporting_category_id: string
          reporting_category_name: string
          reporting_category_version: number
          snapshot_kind?: string
          square_api_version: string
          square_location_id: string
          tax_application_mode?: string | null
          tax_applies_to_custom_amounts?: boolean | null
          tax_calculation_phase?: string | null
          tax_catalog_version?: number | null
          tax_id?: string | null
          tax_inclusion_type?: string | null
          tax_name?: string | null
          tax_percentage?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          observed_at?: string
          product_type?: string
          reporting_category_id?: string
          reporting_category_name?: string
          reporting_category_version?: number
          snapshot_kind?: string
          square_api_version?: string
          square_location_id?: string
          tax_application_mode?: string | null
          tax_applies_to_custom_amounts?: boolean | null
          tax_calculation_phase?: string | null
          tax_catalog_version?: number | null
          tax_id?: string | null
          tax_inclusion_type?: string | null
          tax_name?: string | null
          tax_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_destination_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_managed_bindings: {
        Row: {
          billable_id: string
          created_at: string
          first_sync_request_id: string
          location_id: string
          square_item_id: string
          square_location_id: string
          square_variation_id: string
        }
        Insert: {
          billable_id: string
          created_at?: string
          first_sync_request_id: string
          location_id: string
          square_item_id: string
          square_location_id: string
          square_variation_id: string
        }
        Update: {
          billable_id?: string
          created_at?: string
          first_sync_request_id?: string
          location_id?: string
          square_item_id?: string
          square_location_id?: string
          square_variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_managed_bindi_first_sync_request_id_fkey"
            columns: ["first_sync_request_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_managed_bindings_billable_id_fkey"
            columns: ["billable_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_billables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_managed_bindings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_reference_snapshots: {
        Row: {
          allowed_billable_id: string | null
          amount_cents: number
          available_at_location: boolean
          billing_unit: string
          currency: string
          duration_minutes: number | null
          id: string
          item_catalog_version: number
          item_name: string
          item_product_type: string
          location_id: string
          observed_at: string | null
          operation_key: string | null
          recorded_at: string
          recorded_by: string | null
          reference_role: string
          snapshot_kind: string
          source_absent_at_location_ids: string[]
          source_created_at: string | null
          source_present_at_all_locations: boolean
          source_present_at_location_ids: string[]
          source_updated_at: string | null
          square_api_version: string
          square_is_taxable: boolean
          square_item_id: string
          square_location_id: string
          square_variation_id: string
          variation_catalog_version: number
          variation_name: string
        }
        Insert: {
          allowed_billable_id?: string | null
          amount_cents: number
          available_at_location: boolean
          billing_unit: string
          currency?: string
          duration_minutes?: number | null
          id?: string
          item_catalog_version: number
          item_name: string
          item_product_type: string
          location_id: string
          observed_at?: string | null
          operation_key?: string | null
          recorded_at?: string
          recorded_by?: string | null
          reference_role: string
          snapshot_kind: string
          source_absent_at_location_ids: string[]
          source_created_at?: string | null
          source_present_at_all_locations: boolean
          source_present_at_location_ids: string[]
          source_updated_at?: string | null
          square_api_version: string
          square_is_taxable: boolean
          square_item_id: string
          square_location_id: string
          square_variation_id: string
          variation_catalog_version: number
          variation_name: string
        }
        Update: {
          allowed_billable_id?: string | null
          amount_cents?: number
          available_at_location?: boolean
          billing_unit?: string
          currency?: string
          duration_minutes?: number | null
          id?: string
          item_catalog_version?: number
          item_name?: string
          item_product_type?: string
          location_id?: string
          observed_at?: string | null
          operation_key?: string | null
          recorded_at?: string
          recorded_by?: string | null
          reference_role?: string
          snapshot_kind?: string
          source_absent_at_location_ids?: string[]
          source_created_at?: string | null
          source_present_at_all_locations?: boolean
          source_present_at_location_ids?: string[]
          source_updated_at?: string | null
          square_api_version?: string
          square_is_taxable?: boolean
          square_item_id?: string
          square_location_id?: string
          square_variation_id?: string
          variation_catalog_version?: number
          variation_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_reference_billable_fkey"
            columns: ["allowed_billable_id", "location_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_billables"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_reference_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_sync_claims: {
        Row: {
          claim_token: string
          claimed_at: string
          control_version: number
          expires_at: string
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Insert: {
          claim_token?: string
          claimed_at?: string
          control_version: number
          expires_at: string
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Update: {
          claim_token?: string
          claimed_at?: string
          control_version?: number
          expires_at?: string
          request_id?: string
          worker_contract_version?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_claims_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_sync_control_versions: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          location_id: string
          operation_key: string | null
          provider_writes_enabled: boolean
          reason: string
          recovery_verified_at: string | null
          version: number
          worker_contract_version: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          location_id: string
          operation_key?: string | null
          provider_writes_enabled?: boolean
          reason: string
          recovery_verified_at?: string | null
          version: number
          worker_contract_version?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          location_id?: string
          operation_key?: string | null
          provider_writes_enabled?: boolean
          reason?: string
          recovery_verified_at?: string | null
          version?: number
          worker_contract_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_control_versions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_sync_replay_authorizations: {
        Row: {
          attempt_number: number
          authorized_at: string
          claim_token: string
          control_version: number
          operation_key: string
          provider_payload_sha256: string
          reconciliation_snapshot: Json
          reconciliation_snapshot_sha256: string
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Insert: {
          attempt_number: number
          authorized_at?: string
          claim_token: string
          control_version: number
          operation_key: string
          provider_payload_sha256: string
          reconciliation_snapshot: Json
          reconciliation_snapshot_sha256: string
          request_id: string
          worker_contract_version: string
          worker_id: string
        }
        Update: {
          attempt_number?: number
          authorized_at?: string
          claim_token?: string
          control_version?: number
          operation_key?: string
          provider_payload_sha256?: string
          reconciliation_snapshot?: Json
          reconciliation_snapshot_sha256?: string
          request_id?: string
          worker_contract_version?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_replay_authorizati_claim_token_fkey"
            columns: ["claim_token"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_square_sync_claims"
            referencedColumns: ["claim_token"]
          },
          {
            foreignKeyName: "rental_darkroom_square_sync_replay_authorizatio_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_sync_requests: {
        Row: {
          billable_id: string
          completed_at: string | null
          completion_key: string | null
          destination_profile_id: string
          error_code: string | null
          id: string
          location_id: string
          operation_key: string
          provider_item_catalog_version: number | null
          provider_snapshot: Json | null
          provider_square_item_id: string | null
          provider_square_variation_id: string | null
          provider_variation_catalog_version: number | null
          request_snapshot: Json
          requested_at: string
          requested_by: string
          revision_id: string
          square_location_id: string
          status: string
        }
        Insert: {
          billable_id: string
          completed_at?: string | null
          completion_key?: string | null
          destination_profile_id: string
          error_code?: string | null
          id?: string
          location_id: string
          operation_key: string
          provider_item_catalog_version?: number | null
          provider_snapshot?: Json | null
          provider_square_item_id?: string | null
          provider_square_variation_id?: string | null
          provider_variation_catalog_version?: number | null
          request_snapshot: Json
          requested_at?: string
          requested_by: string
          revision_id: string
          square_location_id: string
          status?: string
        }
        Update: {
          billable_id?: string
          completed_at?: string | null
          completion_key?: string | null
          destination_profile_id?: string
          error_code?: string | null
          id?: string
          location_id?: string
          operation_key?: string
          provider_item_catalog_version?: number | null
          provider_snapshot?: Json | null
          provider_square_item_id?: string | null
          provider_square_variation_id?: string | null
          provider_variation_catalog_version?: number | null
          request_snapshot?: Json
          requested_at?: string
          requested_by?: string
          revision_id?: string
          square_location_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_destination_profile_fkey"
            columns: ["destination_profile_id", "location_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_destination_profiles"
            referencedColumns: ["id", "location_id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_sync_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_darkroom_square_sync_revision_fkey"
            columns: ["revision_id", "billable_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_billable_revisions"
            referencedColumns: ["id", "billable_id"]
          },
        ]
      }
      rental_darkroom_square_sync_results: {
        Row: {
          claim_token: string
          completion_key: string
          created_at: string
          error_code: string | null
          id: string
          outcome: string
          provider_payload_sha256: string | null
          provider_snapshot: Json | null
          request_id: string
        }
        Insert: {
          claim_token: string
          completion_key: string
          created_at?: string
          error_code?: string | null
          id?: string
          outcome: string
          provider_payload_sha256?: string | null
          provider_snapshot?: Json | null
          request_id: string
        }
        Update: {
          claim_token?: string
          completion_key?: string
          created_at?: string
          error_code?: string | null
          id?: string
          outcome?: string
          provider_payload_sha256?: string | null
          provider_snapshot?: Json | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_results_claim_fkey"
            columns: ["claim_token"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_claims"
            referencedColumns: ["claim_token"]
          },
          {
            foreignKeyName: "rental_darkroom_square_sync_results_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_square_sync_starts: {
        Row: {
          claim_token: string
          control_version: number
          provider_payload: Json
          provider_payload_sha256: string
          request_id: string
          request_snapshot_sha256: string
          started_at: string
          worker_contract_version: string
          worker_id: string
        }
        Insert: {
          claim_token: string
          control_version: number
          provider_payload: Json
          provider_payload_sha256: string
          request_id: string
          request_snapshot_sha256: string
          started_at?: string
          worker_contract_version: string
          worker_id: string
        }
        Update: {
          claim_token?: string
          control_version?: number
          provider_payload?: Json
          provider_payload_sha256?: string
          request_id?: string
          request_snapshot_sha256?: string
          started_at?: string
          worker_contract_version?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_square_sync_starts_claim_token_fkey"
            columns: ["claim_token"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_square_sync_claims"
            referencedColumns: ["claim_token"]
          },
          {
            foreignKeyName: "rental_darkroom_square_sync_starts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "rental_darkroom_square_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_darkroom_topoff_options: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          expiry_days: number
          id: string
          location_id: string | null
          metadata: Json
          name: string
          price_cents: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          expiry_days?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          name: string
          price_cents: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          expiry_days?: number
          id?: string
          location_id?: string | null
          metadata?: Json
          name?: string
          price_cents?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_darkroom_topoff_options_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_financial_operations: {
        Row: {
          amount_cents: number
          attempted_at: string | null
          attempts: number
          available_at: string
          checkout_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error_code: string | null
          last_provider_occurred_at: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          operation_key: string
          operation_type: string
          provider_event_id: string | null
          provider_request_snapshot: Json
          provider_step: string
          reason: string | null
          request_snapshot: Json
          reservation_id: string
          response: Json
          square_invoice_id: string | null
          square_order_id: string | null
          square_payment_id: string | null
          square_refund_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          attempted_at?: string | null
          attempts?: number
          available_at?: string
          checkout_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error_code?: string | null
          last_provider_occurred_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          operation_key: string
          operation_type: string
          provider_event_id?: string | null
          provider_request_snapshot?: Json
          provider_step?: string
          reason?: string | null
          request_snapshot?: Json
          reservation_id: string
          response?: Json
          square_invoice_id?: string | null
          square_order_id?: string | null
          square_payment_id?: string | null
          square_refund_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          attempted_at?: string | null
          attempts?: number
          available_at?: string
          checkout_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error_code?: string | null
          last_provider_occurred_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          operation_key?: string
          operation_type?: string
          provider_event_id?: string | null
          provider_request_snapshot?: Json
          provider_step?: string
          reason?: string | null
          request_snapshot?: Json
          reservation_id?: string
          response?: Json
          square_invoice_id?: string | null
          square_order_id?: string | null
          square_payment_id?: string | null
          square_refund_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_financial_operations_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "rental_checkout_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_financial_operations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_inspections: {
        Row: {
          after_evidence_paths: string[]
          approved_at: string | null
          approved_by: string | null
          approved_deduction_cents: number | null
          before_evidence_paths: string[]
          camera_rental_id: string
          checklist: Json
          condition_after: string | null
          condition_before: string | null
          created_at: string
          customer_facing_reason: string | null
          evidence_deleted_at: string | null
          evidence_paths: string[]
          evidence_purge_after: string | null
          evidence_purge_error: string | null
          evidence_purge_status: string
          id: string
          inspected_at: string | null
          inspected_by: string | null
          notes: string | null
          recommended_deduction_cents: number
          recorded_reservation_state_version: number | null
          status: string
          updated_at: string
          upload_manifest_id: string | null
          zero_damage_confirmed: boolean
        }
        Insert: {
          after_evidence_paths?: string[]
          approved_at?: string | null
          approved_by?: string | null
          approved_deduction_cents?: number | null
          before_evidence_paths?: string[]
          camera_rental_id: string
          checklist?: Json
          condition_after?: string | null
          condition_before?: string | null
          created_at?: string
          customer_facing_reason?: string | null
          evidence_deleted_at?: string | null
          evidence_paths?: string[]
          evidence_purge_after?: string | null
          evidence_purge_error?: string | null
          evidence_purge_status?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          recommended_deduction_cents?: number
          recorded_reservation_state_version?: number | null
          status?: string
          updated_at?: string
          upload_manifest_id?: string | null
          zero_damage_confirmed?: boolean
        }
        Update: {
          after_evidence_paths?: string[]
          approved_at?: string | null
          approved_by?: string | null
          approved_deduction_cents?: number | null
          before_evidence_paths?: string[]
          camera_rental_id?: string
          checklist?: Json
          condition_after?: string | null
          condition_before?: string | null
          created_at?: string
          customer_facing_reason?: string | null
          evidence_deleted_at?: string | null
          evidence_paths?: string[]
          evidence_purge_after?: string | null
          evidence_purge_error?: string | null
          evidence_purge_status?: string
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          notes?: string | null
          recommended_deduction_cents?: number
          recorded_reservation_state_version?: number | null
          status?: string
          updated_at?: string
          upload_manifest_id?: string | null
          zero_damage_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rental_inspections_camera_rental_id_fkey"
            columns: ["camera_rental_id"]
            isOneToOne: true
            referencedRelation: "rental_camera_rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_inspections_upload_manifest_id_fkey"
            columns: ["upload_manifest_id"]
            isOneToOne: false
            referencedRelation: "rental_upload_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_locations: {
        Row: {
          active: boolean
          camera_enabled: boolean
          created_at: string
          darkroom_enabled: boolean
          id: string
          metadata: Json
          name: string
          orientation_enforced: boolean
          shipping_enabled: boolean
          site_key: string
          slug: string
          square_location_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          camera_enabled?: boolean
          created_at?: string
          darkroom_enabled?: boolean
          id?: string
          metadata?: Json
          name: string
          orientation_enforced?: boolean
          shipping_enabled?: boolean
          site_key: string
          slug: string
          square_location_id: string
          timezone: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          camera_enabled?: boolean
          created_at?: string
          darkroom_enabled?: boolean
          id?: string
          metadata?: Json
          name?: string
          orientation_enforced?: boolean
          shipping_enabled?: boolean
          site_key?: string
          slug?: string
          square_location_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      rental_mail_outbox: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          customer_id: string | null
          dedupe_key: string
          event_type: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          location_id: string
          payload: Json
          recipient_scope: string
          reservation_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          customer_id?: string | null
          dedupe_key: string
          event_type: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          location_id: string
          payload?: Json
          recipient_scope?: string
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          customer_id?: string | null
          dedupe_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          location_id?: string
          payload?: Json
          recipient_scope?: string
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_mail_outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_mail_outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_mail_outbox_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_mail_outbox_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_mail_outbox_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_membership_checkout_operations: {
        Row: {
          catalog_evidence: Json
          created_at: string
          customer_id: string
          expected_amount_cents: number
          expected_bank_cap: number
          expected_cadence: string
          expected_credit_expiry_days: number
          expected_credits: number
          expected_currency: string
          expected_square_location_id: string
          expected_timezone: string
          failure_code: string | null
          frozen_request: Json
          id: string
          last_payment_occurred_at: string | null
          location_id: string
          membership_id: string
          operation_key: string
          plan_id: string
          provider_response: Json
          provider_started_at: string | null
          request_hash: string | null
          square_catalog_version: number | null
          square_mapping_id: string
          square_order_id: string | null
          square_payment_id: string | null
          square_payment_link_id: string | null
          square_payment_order_id: string | null
          square_plan_variation_id: string
          square_subscription_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          catalog_evidence?: Json
          created_at?: string
          customer_id: string
          expected_amount_cents: number
          expected_bank_cap: number
          expected_cadence: string
          expected_credit_expiry_days: number
          expected_credits: number
          expected_currency: string
          expected_square_location_id: string
          expected_timezone: string
          failure_code?: string | null
          frozen_request?: Json
          id?: string
          last_payment_occurred_at?: string | null
          location_id: string
          membership_id: string
          operation_key: string
          plan_id: string
          provider_response?: Json
          provider_started_at?: string | null
          request_hash?: string | null
          square_catalog_version?: number | null
          square_mapping_id: string
          square_order_id?: string | null
          square_payment_id?: string | null
          square_payment_link_id?: string | null
          square_payment_order_id?: string | null
          square_plan_variation_id: string
          square_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          catalog_evidence?: Json
          created_at?: string
          customer_id?: string
          expected_amount_cents?: number
          expected_bank_cap?: number
          expected_cadence?: string
          expected_credit_expiry_days?: number
          expected_credits?: number
          expected_currency?: string
          expected_square_location_id?: string
          expected_timezone?: string
          failure_code?: string | null
          frozen_request?: Json
          id?: string
          last_payment_occurred_at?: string | null
          location_id?: string
          membership_id?: string
          operation_key?: string
          plan_id?: string
          provider_response?: Json
          provider_started_at?: string | null
          request_hash?: string | null
          square_catalog_version?: number | null
          square_mapping_id?: string
          square_order_id?: string | null
          square_payment_id?: string | null
          square_payment_link_id?: string | null
          square_payment_order_id?: string | null
          square_plan_variation_id?: string
          square_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_membership_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_checkout_operations_square_mapping_id_fkey"
            columns: ["square_mapping_id"]
            isOneToOne: false
            referencedRelation: "rental_square_variation_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_membership_invoice_operations: {
        Row: {
          checkout_id: string | null
          created_at: string
          credits_granted: number
          currency: string
          customer_id: string
          evidence: Json
          expected_amount_cents: number
          id: string
          invoice_id: string
          invoice_version: number
          last_provider_occurred_at: string
          location_id: string
          membership_id: string
          paid_amount_cents: number
          period_end_at: string | null
          period_start_at: string | null
          plan_id: string
          provider_invoice_status_at_version: string
          provider_invoice_status_version: number
          refund_ids: string[]
          refunded_amount_cents: number
          review_at: string | null
          review_reason: string | null
          review_required: boolean
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string | null
          square_payment_ids: string[]
          square_plan_variation_id: string
          square_subscription_id: string
          status: string
          updated_at: string
        }
        Insert: {
          checkout_id?: string | null
          created_at?: string
          credits_granted?: number
          currency: string
          customer_id: string
          evidence?: Json
          expected_amount_cents: number
          id?: string
          invoice_id: string
          invoice_version: number
          last_provider_occurred_at: string
          location_id: string
          membership_id: string
          paid_amount_cents: number
          period_end_at?: string | null
          period_start_at?: string | null
          plan_id: string
          provider_invoice_status_at_version: string
          provider_invoice_status_version: number
          refund_ids?: string[]
          refunded_amount_cents?: number
          review_at?: string | null
          review_reason?: string | null
          review_required?: boolean
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id?: string | null
          square_payment_ids?: string[]
          square_plan_variation_id: string
          square_subscription_id: string
          status: string
          updated_at?: string
        }
        Update: {
          checkout_id?: string | null
          created_at?: string
          credits_granted?: number
          currency?: string
          customer_id?: string
          evidence?: Json
          expected_amount_cents?: number
          id?: string
          invoice_id?: string
          invoice_version?: number
          last_provider_occurred_at?: string
          location_id?: string
          membership_id?: string
          paid_amount_cents?: number
          period_end_at?: string | null
          period_start_at?: string | null
          plan_id?: string
          provider_invoice_status_at_version?: string
          provider_invoice_status_version?: number
          refund_ids?: string[]
          refunded_amount_cents?: number
          review_at?: string | null
          review_reason?: string | null
          review_required?: boolean
          square_customer_id?: string
          square_location_id?: string
          square_order_id?: string
          square_payment_id?: string | null
          square_payment_ids?: string[]
          square_plan_variation_id?: string
          square_subscription_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_membership_invoice_operations_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "rental_membership_checkout_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_membership_invoice_operations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_policy_versions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          effective_at: string
          id: string
          location_id: string | null
          program: string
          rules: Json
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          location_id?: string | null
          program: string
          rules: Json
          version: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          effective_at?: string
          id?: string
          location_id?: string | null
          program?: string
          rules?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_policy_versions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_provider_events: {
        Row: {
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          payload_sha256: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at: string
          payload_sha256: string
          processed_at?: string | null
          provider: string
          provider_event_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          payload_sha256?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rental_reservations: {
        Row: {
          created_at: string
          customer_id: string
          fulfillment_method: string | null
          hold_expires_at: string | null
          id: string
          idempotency_key: string
          location_id: string
          occupied_range: unknown
          policy_version_id: string | null
          program: string
          provider_fence_at: string | null
          quote_snapshot: Json
          quote_version: string
          state_version: number
          status: string
          updated_at: string
          use_range: unknown
        }
        Insert: {
          created_at?: string
          customer_id: string
          fulfillment_method?: string | null
          hold_expires_at?: string | null
          id?: string
          idempotency_key: string
          location_id: string
          occupied_range: unknown
          policy_version_id?: string | null
          program: string
          provider_fence_at?: string | null
          quote_snapshot?: Json
          quote_version: string
          state_version?: number
          status?: string
          updated_at?: string
          use_range: unknown
        }
        Update: {
          created_at?: string
          customer_id?: string
          fulfillment_method?: string | null
          hold_expires_at?: string | null
          id?: string
          idempotency_key?: string
          location_id?: string
          occupied_range?: unknown
          policy_version_id?: string | null
          program?: string
          provider_fence_at?: string | null
          quote_snapshot?: Json
          quote_version?: string
          state_version?: number
          status?: string
          updated_at?: string
          use_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "rental_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_reservations_policy_version_id_fkey"
            columns: ["policy_version_id"]
            isOneToOne: false
            referencedRelation: "rental_policy_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_resource_allocations: {
        Row: {
          allocation_kind: string
          created_at: string
          hold_expires_at: string | null
          id: string
          metadata: Json
          occupied_range: unknown
          reason: string | null
          reservation_id: string | null
          resource_id: string
          status: string
          updated_at: string
          use_range: unknown
        }
        Insert: {
          allocation_kind?: string
          created_at?: string
          hold_expires_at?: string | null
          id?: string
          metadata?: Json
          occupied_range: unknown
          reason?: string | null
          reservation_id?: string | null
          resource_id: string
          status?: string
          updated_at?: string
          use_range: unknown
        }
        Update: {
          allocation_kind?: string
          created_at?: string
          hold_expires_at?: string | null
          id?: string
          metadata?: Json
          occupied_range?: unknown
          reason?: string | null
          reservation_id?: string | null
          resource_id?: string
          status?: string
          updated_at?: string
          use_range?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "rental_resource_allocations_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_resource_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "rental_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_resources: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          location_id: string
          metadata: Json
          resource_kind: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id?: string
          location_id: string
          metadata?: Json
          resource_kind: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          location_id?: string
          metadata?: Json
          resource_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_schedule_exceptions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          exception_kind: string
          facility_id: string | null
          id: string
          location_id: string
          occupied_range: unknown
          program: string
          reason: string
          resource_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          exception_kind: string
          facility_id?: string | null
          id?: string
          location_id: string
          occupied_range: unknown
          program?: string
          reason: string
          resource_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          exception_kind?: string
          facility_id?: string | null
          id?: string
          location_id?: string
          occupied_range?: unknown
          program?: string
          reason?: string
          resource_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_schedule_exceptions_facility_id_fkey"
            columns: ["facility_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_schedule_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_schedule_exceptions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "rental_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_shipments: {
        Row: {
          camera_rental_id: string
          carrier_code: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          estimated_delivery_at: string | null
          id: string
          idempotency_key: string
          label_download_path: string | null
          last_event_at: string | null
          provider_snapshot: Json
          service_code: string | null
          ship_date: string | null
          shipstation_label_id: string | null
          shipstation_shipment_id: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          camera_rental_id: string
          carrier_code?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          estimated_delivery_at?: string | null
          id?: string
          idempotency_key: string
          label_download_path?: string | null
          last_event_at?: string | null
          provider_snapshot?: Json
          service_code?: string | null
          ship_date?: string | null
          shipstation_label_id?: string | null
          shipstation_shipment_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          camera_rental_id?: string
          carrier_code?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          estimated_delivery_at?: string | null
          id?: string
          idempotency_key?: string
          label_download_path?: string | null
          last_event_at?: string | null
          provider_snapshot?: Json
          service_code?: string | null
          ship_date?: string | null
          shipstation_label_id?: string | null
          shipstation_shipment_id?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_shipments_camera_rental_id_fkey"
            columns: ["camera_rental_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_square_variation_mappings: {
        Row: {
          active: boolean
          cadence: string | null
          camera_product_id: string | null
          created_at: string
          credits: number | null
          duration_option_id: string | null
          id: string
          location_id: string | null
          metadata: Json
          plan_id: string | null
          program: string
          square_location_id: string | null
          square_variation_id: string
          topoff_option_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          cadence?: string | null
          camera_product_id?: string | null
          created_at?: string
          credits?: number | null
          duration_option_id?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          plan_id?: string | null
          program: string
          square_location_id?: string | null
          square_variation_id: string
          topoff_option_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          cadence?: string | null
          camera_product_id?: string | null
          created_at?: string
          credits?: number | null
          duration_option_id?: string | null
          id?: string
          location_id?: string | null
          metadata?: Json
          plan_id?: string | null
          program?: string
          square_location_id?: string | null
          square_variation_id?: string
          topoff_option_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_square_variation_mappings_camera_product_id_fkey"
            columns: ["camera_product_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_square_variation_mappings_duration_option_id_fkey"
            columns: ["duration_option_id"]
            isOneToOne: false
            referencedRelation: "rental_camera_duration_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_square_variation_mappings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_square_variation_mappings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_square_variation_mappings_topoff_option_id_fkey"
            columns: ["topoff_option_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_topoff_options"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_topoff_checkout_operations: {
        Row: {
          created_at: string
          credits: number
          customer_id: string
          expected_amount_cents: number
          expected_currency: string
          expected_expiry_days: number
          expected_payment_note: string
          expected_payment_reference_id: string
          expected_provider_idempotency_key: string
          expected_square_customer_id: string
          expected_square_location_id: string
          financial_review_at: string | null
          financial_review_reason: string | null
          financial_review_required: boolean
          id: string
          last_provider_occurred_at: string | null
          last_refund_occurred_at: string | null
          location_id: string
          membership_id: string
          operation_key: string
          payment_evidence: Json
          provider_started_at: string | null
          refund_evidence: Json
          refund_status: string | null
          refunded_at: string | null
          request_hash: string
          response: Json
          square_order_id: string | null
          square_payment_id: string | null
          square_refund_id: string | null
          square_variation_id: string
          status: string
          topoff_option_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          customer_id: string
          expected_amount_cents: number
          expected_currency: string
          expected_expiry_days: number
          expected_payment_note: string
          expected_payment_reference_id: string
          expected_provider_idempotency_key: string
          expected_square_customer_id: string
          expected_square_location_id: string
          financial_review_at?: string | null
          financial_review_reason?: string | null
          financial_review_required?: boolean
          id?: string
          last_provider_occurred_at?: string | null
          last_refund_occurred_at?: string | null
          location_id: string
          membership_id: string
          operation_key: string
          payment_evidence?: Json
          provider_started_at?: string | null
          refund_evidence?: Json
          refund_status?: string | null
          refunded_at?: string | null
          request_hash: string
          response?: Json
          square_order_id?: string | null
          square_payment_id?: string | null
          square_refund_id?: string | null
          square_variation_id: string
          status?: string
          topoff_option_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          customer_id?: string
          expected_amount_cents?: number
          expected_currency?: string
          expected_expiry_days?: number
          expected_payment_note?: string
          expected_payment_reference_id?: string
          expected_provider_idempotency_key?: string
          expected_square_customer_id?: string
          expected_square_location_id?: string
          financial_review_at?: string | null
          financial_review_reason?: string | null
          financial_review_required?: boolean
          id?: string
          last_provider_occurred_at?: string | null
          last_refund_occurred_at?: string | null
          location_id?: string
          membership_id?: string
          operation_key?: string
          payment_evidence?: Json
          provider_started_at?: string | null
          refund_evidence?: Json
          refund_status?: string | null
          refunded_at?: string | null
          request_hash?: string
          response?: Json
          square_order_id?: string | null
          square_payment_id?: string | null
          square_refund_id?: string | null
          square_variation_id?: string
          status?: string
          topoff_option_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_topoff_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_topoff_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_topoff_checkout_operations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_topoff_checkout_operations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_topoff_checkout_operations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_topoff_checkout_operations_topoff_option_id_fkey"
            columns: ["topoff_option_id"]
            isOneToOne: false
            referencedRelation: "rental_darkroom_topoff_options"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_upload_manifests: {
        Row: {
          attached_at: string | null
          attempts: number
          available_at: string
          cleanup_phase: string
          created_at: string
          created_by: string | null
          customer_id: string
          document_fingerprint: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          last_error: string | null
          late_object_sweeps: number
          lease_expires_at: string | null
          lease_owner: string | null
          location_id: string
          operation_key: string
          purge_after: string | null
          purged_at: string | null
          purpose: string
          reservation_id: string | null
          status: string
          storage_bucket: string
          storage_paths: string[]
          updated_at: string
          upload_expires_at: string
        }
        Insert: {
          attached_at?: string | null
          attempts?: number
          available_at?: string
          cleanup_phase?: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          document_fingerprint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          late_object_sweeps?: number
          lease_expires_at?: string | null
          lease_owner?: string | null
          location_id: string
          operation_key: string
          purge_after?: string | null
          purged_at?: string | null
          purpose: string
          reservation_id?: string | null
          status?: string
          storage_bucket: string
          storage_paths: string[]
          updated_at?: string
          upload_expires_at?: string
        }
        Update: {
          attached_at?: string | null
          attempts?: number
          available_at?: string
          cleanup_phase?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          document_fingerprint?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_error?: string | null
          late_object_sweeps?: number
          lease_expires_at?: string | null
          lease_owner?: string | null
          location_id?: string
          operation_key?: string
          purge_after?: string | null
          purged_at?: string | null
          purpose?: string
          reservation_id?: string | null
          status?: string
          storage_bucket?: string
          storage_paths?: string[]
          updated_at?: string
          upload_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_upload_manifests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_upload_manifests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "links_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_upload_manifests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "orders_with_customers"
            referencedColumns: ["db_customer_id"]
          },
          {
            foreignKeyName: "rental_upload_manifests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "rental_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_upload_manifests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "rental_reservations"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "service_instance_heartbeats_current"
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
            referencedRelation: "service_instance_heartbeats_current"
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
      support_ticket_operations: {
        Row: {
          comment_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_error_code: string | null
          notification_attempts: number
          notification_claimed_at: string | null
          notification_sent_at: string | null
          notification_status: string
          operation_key: string
          provider_message_id: string | null
          queue: string
          recipient_email: string | null
          request_hash: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          last_error_code?: string | null
          notification_attempts?: number
          notification_claimed_at?: string | null
          notification_sent_at?: string | null
          notification_status?: string
          operation_key: string
          provider_message_id?: string | null
          queue: string
          recipient_email?: string | null
          request_hash: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_error_code?: string | null
          notification_attempts?: number
          notification_claimed_at?: string | null
          notification_sent_at?: string | null
          notification_status?: string
          operation_key?: string
          provider_message_id?: string | null
          queue?: string
          recipient_email?: string | null
          request_hash?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_operations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
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
          customer_visible_notes: string | null
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
          order_customer_visible_notes: string | null
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
          attempted_at: string | null
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
      service_instance_heartbeats_current: {
        Row: {
          environment: string | null
          finished_at: string | null
          id: string | null
          instance_key: string | null
          message: string | null
          metadata: Json | null
          release: string | null
          service: string | null
          service_key: string | null
          signal_at: string | null
          started_at: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acknowledge_cart_checkout: {
        Args: { p_cart_id: string; p_checkout_attempt_id: string }
        Returns: number
      }
      add_settings_template_column: {
        Args: { p_column_name: string }
        Returns: string
      }
      app_error_severity_rank: { Args: { p_severity: string }; Returns: number }
      apply_order_service_item_completion: {
        Args: {
          p_actor_user_id: string
          p_all_line_item_uids: string[]
          p_completed: boolean
          p_line_item_catalog_map: Json
          p_operation: string
          p_order_id: number
          p_service_line_item_uids: string[]
          p_snapshot_trackable: boolean
          p_target_line_item_uid: string
        }
        Returns: {
          changed_line_item_uids: string[]
          completed_line_item_uids: string[]
          order_changed: boolean
          order_completed: boolean
          service_completion_updated_at: string
          service_progress_changed: boolean
        }[]
      }
      authorize_loyalty_adjustment_replay: {
        Args: { p_operation_key: string; p_requested_by_service: string }
        Returns: {
          actor_user_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          points: number | null
          provider_idempotency_key: string
          provider_response: Json | null
          provider_started_at: string | null
          provider_started_by_service: string | null
          reason: string | null
          request_hash: string
          request_payload: Json
          requested_by_service: string
          square_customer_id: string | null
          square_loyalty_account_id: string | null
          square_order_id: string | null
          square_reward_id: string | null
          square_reward_tier_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      backfill_membership_credit_grants: {
        Args: { p_membership_id?: string }
        Returns: number
      }
      begin_loyalty_operation: {
        Args: {
          p_actor_user_id?: string
          p_customer_id?: string
          p_location_id?: string
          p_operation_key: string
          p_operation_kind: string
          p_points?: number
          p_reason?: string
          p_request_hash: string
          p_request_payload?: Json
          p_requested_by_service: string
          p_square_customer_id?: string
          p_square_loyalty_account_id?: string
          p_square_order_id?: string
          p_square_reward_id?: string
          p_square_reward_tier_id?: string
        }
        Returns: {
          actor_user_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          points: number | null
          provider_idempotency_key: string
          provider_response: Json | null
          provider_started_at: string | null
          provider_started_by_service: string | null
          reason: string | null
          request_hash: string
          request_payload: Json
          requested_by_service: string
          square_customer_id: string | null
          square_loyalty_account_id: string | null
          square_order_id: string | null
          square_reward_id: string | null
          square_reward_tier_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_booking_with_credit_refund: {
        Args: {
          p_booking_id: string
          p_metadata: Json
          p_operation_key: string
          p_refund_amount: number
          p_user_id: string
        }
        Returns: {
          already_canceled: boolean
          booking_id: string
          credits_refunded: number
          holds_removed: number
          new_balance: number
        }[]
      }
      cancel_pending_membership_credit_grants: {
        Args: { p_from?: string; p_membership_id: string; p_reason?: string }
        Returns: number
      }
      claim_cart_checkout: {
        Args: { p_cart_id: string; p_proposed_attempt_id: string }
        Returns: {
          acquired: boolean
          checkout_attempt_id: string
          claimed_at: string
          completed_at: string
          provider_started_at: string
        }[]
      }
      claim_customer_profile_sync: {
        Args: {
          p_created_by?: string
          p_customer_id: string
          p_operation_key: string
          p_request_hash: string
          p_request_payload: Json
          p_square_customer_id: string
        }
        Returns: {
          attempts: number
          auth_synced_at: string
          claimed: boolean
          customer_id: string
          db_synced_at: string
          id: string
          operation_key: string
          request_hash: string
          result: Json
          square_customer_id: string
          square_synced_at: string
          status: string
        }[]
      }
      claim_dashboard_mail_operation: {
        Args: {
          p_created_by?: string
          p_dedupe_key: string
          p_kind: string
          p_operation_key: string
          p_order_db_id: number
          p_refund_id?: number
          p_request_hash: string
        }
        Returns: {
          attempts: number
          claimed: boolean
          dedupe_key: string
          id: string
          kind: string
          operation_key: string
          order_db_id: number
          recipient_email: string
          refund_id: number
          request_hash: string
          response: Json
          status: string
        }[]
      }
      claim_expired_note_media: {
        Args: { p_limit: number; p_now: string }
        Returns: {
          id: string
          object_path: string
        }[]
      }
      claim_fomailer_dispatch: {
        Args: {
          p_event_type: string
          p_operation_key: string
          p_request_hash: string
        }
        Returns: {
          claimed: boolean
          operation_key: string
          response: Json
          status: string
        }[]
      }
      claim_order_shipstation_sync: {
        Args: {
          p_batch_size?: number
          p_lease_seconds?: number
          p_worker: string
        }
        Returns: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "order_shipstation_sync_operations"
          isOneToOne: false
          isSetofReturn: true
        }
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
      claim_public_link_regeneration_request: {
        Args: {
          p_claimed_by: string
          p_expected_attempts: number
          p_expected_claimed_at: string
          p_expected_claimed_by: string
          p_expected_status: string
          p_location_id: string
          p_order_db_id: number
          p_order_number: number
          p_request_id: string
          p_square_order_id: string
        }
        Returns: {
          action: string
          attempts: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          id: string
          last_error: string | null
          location_id: string
          operation_key: string
          order_db_id: number
          order_number: number
          request_expires_at: string | null
          request_source: string
          requested_at: string
          requested_by: string | null
          requester_fingerprint: string | null
          requester_token_hash: string | null
          result: Json
          send_email: boolean
          square_order_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "link_worker_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_refund_request: {
        Args: { p_refund_id: number }
        Returns: {
          amount: number
          attempted_at: string | null
          created_at: string
          error_message: string | null
          id: number
          idempotency_key: string
          initiated_by: string | null
          notification_policy: string
          order_db_id: number
          order_id: string
          processed_at: string | null
          reason: string | null
          request_hash: string
          request_key: string
          square_refund_id: string | null
          square_response: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "refund_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_support_ticket_notification: {
        Args: { p_operation_key: string; p_request_hash: string }
        Returns: Json
      }
      complete_cart_checkout: {
        Args: { p_cart_id: string; p_checkout_attempt_id: string }
        Returns: boolean
      }
      complete_checkout_inventory_reservations: {
        Args: { p_checkout_attempt_id: string }
        Returns: boolean
      }
      complete_order_shipstation_sync: {
        Args: {
          p_claim_token: string
          p_completion_source: string
          p_operation_id: string
          p_provider_result: Json
          p_rate_id?: string
          p_rate_request_id?: string
          p_shipstation_shipment_id: string
        }
        Returns: {
          already_completed: boolean
          operation_status: string
          order_shipping_status: string
        }[]
      }
      confirm_checkout_inventory_reflection: {
        Args: { p_adjustments: Json; p_checkout_attempt_id: string }
        Returns: {
          catalog_variation_id: string
          confirmed_quantity: number
          required_quantity: number
          reservation_status: string
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
      consume_credit_lots: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_component: string
          p_membership_id: string
          p_metadata: Json
          p_operation_key: string
          p_reason: string
          p_user_id: string
        }
        Returns: {
          credits_burned: number
          new_balance: number
        }[]
      }
      count_order_note_events: {
        Args: { p_order_ids: number[] }
        Returns: {
          note_count: number
          order_db_id: number
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
      create_support_ticket_idempotent: {
        Args: {
          p_created_by: string
          p_operation_key: string
          p_queue: string
          p_request_hash: string
          p_ticket: Json
        }
        Returns: Json
      }
      current_app_role: { Args: never; Returns: string }
      darkroom_grant_invoice_credits: {
        Args: {
          p_customer_id: string
          p_event_occurred_at: string
          p_invoice_id: string
          p_metadata?: Json
          p_paid_at: string
          p_payload_sha256: string
          p_period_end: string
          p_period_start: string
          p_plan_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_square_customer_id: string
          p_square_plan_variation_id: string
          p_square_subscription_id: string
        }
        Returns: Json
      }
      darkroom_reconcile_membership_invoice_payment: {
        Args: {
          p_currency: string
          p_event_occurred_at: string
          p_invoice_amount_cents: number
          p_invoice_id: string
          p_invoice_is_latest: boolean
          p_invoice_status: string
          p_invoice_version: number
          p_metadata?: Json
          p_order_id: string
          p_paid_amount_cents: number
          p_paid_at: string
          p_payload_sha256: string
          p_payment_evidence: Json
          p_payment_id: string
          p_payment_ids: string[]
          p_payment_note: string
          p_payment_reference_id: string
          p_payment_request_count: number
          p_period_end: string
          p_period_start: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_provider_identity_consistent: boolean
          p_square_customer_id: string
          p_square_location_id: string
          p_square_plan_variation_id: string
          p_square_subscription_id: string
          p_subscription_evidence: Json
          p_subscription_invoice_ids: string[]
        }
        Returns: Json
      }
      darkroom_reconcile_membership_invoice_refund: {
        Args: {
          p_currency: string
          p_event_occurred_at: string
          p_invoice_id: string
          p_invoice_status: string
          p_invoice_version: number
          p_metadata?: Json
          p_order_id: string
          p_paid_amount_cents: number
          p_payload_sha256: string
          p_payment_evidence: Json
          p_payment_ids: string[]
          p_provider_event_id: string
          p_provider_event_type: string
          p_provider_identity_consistent: boolean
          p_refund_evidence: Json
          p_refund_ids: string[]
          p_refunded_amount_cents: number
          p_square_customer_id: string
          p_square_location_id: string
          p_square_plan_variation_id: string
          p_square_subscription_id: string
        }
        Returns: Json
      }
      darkroom_reconcile_topoff_payment: {
        Args: {
          p_amount_cents: number
          p_checkout_id: string
          p_currency: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_payload_sha256: string
          p_payment_evidence: Json
          p_payment_id: string
          p_payment_note: string
          p_payment_order_id: string
          p_payment_reference_id: string
          p_payment_status: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_refund_ids: string[]
          p_refunded_amount_cents: number
          p_square_customer_id: string
          p_square_location_id: string
        }
        Returns: Json
      }
      darkroom_reconcile_topoff_payment_legacy_blocked: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_order_id: string
          p_payload_sha256: string
          p_payment_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_square_customer_id: string
          p_square_location_id: string
          p_status: string
        }
        Returns: Json
      }
      darkroom_reconcile_topoff_refund: {
        Args: {
          p_checkout_id: string
          p_completed_refund_ids: string[]
          p_completed_refunded_amount_cents: number
          p_event_occurred_at: string
          p_metadata?: Json
          p_payload_sha256: string
          p_payment_amount_cents: number
          p_payment_currency: string
          p_payment_evidence: Json
          p_payment_id: string
          p_payment_note: string
          p_payment_order_id: string
          p_payment_reference_id: string
          p_payment_refunded_amount_cents: number
          p_payment_status: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_refund_evidence: Json
          p_square_customer_id: string
          p_square_location_id: string
        }
        Returns: Json
      }
      darkroom_reconcile_topoff_refund_legacy_blocked: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_order_id: string
          p_payload_sha256: string
          p_payment_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_refund_id: string
          p_square_location_id: string
          p_status: string
        }
        Returns: Json
      }
      darkroom_sync_membership_from_square: {
        Args: {
          p_current_period_end: string
          p_current_period_start: string
          p_customer_id: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_payload_sha256: string
          p_plan_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_square_customer_id: string
          p_square_plan_variation_id: string
          p_square_subscription_id: string
          p_status: string
          p_subscription_evidence: Json
        }
        Returns: Json
      }
      darkroom_sync_membership_from_square_unverified: {
        Args: {
          p_current_period_end: string
          p_current_period_start: string
          p_customer_id: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_payload_sha256: string
          p_plan_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_square_customer_id: string
          p_square_plan_variation_id: string
          p_square_subscription_id: string
          p_status: string
        }
        Returns: Json
      }
      dashboard_ready_for_pickup_order_page: {
        Args: {
          p_customer_id: string
          p_db_customer_id: string
          p_location_id: string
          p_page: number
          p_per_page: number
        }
        Returns: Json
      }
      defer_order_shipstation_sync: {
        Args: {
          p_claim_token: string
          p_error_code: string
          p_error_detail: string
          p_failure_stage: string
          p_next_attempt_at?: string
          p_operation_id: string
        }
        Returns: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_shipstation_sync_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_order_shipstation_sync: {
        Args: { p_created_by?: string; p_order_db_id: number }
        Returns: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_shipstation_sync_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_public_link_regeneration_requests: {
        Args: { p_limit?: number }
        Returns: number
      }
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
      finalize_customer_profile_sync:
        | {
            Args: {
              p_address: Json
              p_email: string
              p_first_name: string
              p_last_name: string
              p_operation_id: string
              p_phone: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address: Json
              p_email: string
              p_first_name: string
              p_lab_notes: string
              p_last_name: string
              p_operation_id: string
              p_phone: string
            }
            Returns: Json
          }
      finalize_refund_result: {
        Args: {
          p_error_message?: string
          p_refund_id: number
          p_square_refund_id: string
          p_square_response: Json
          p_square_status: string
        }
        Returns: {
          already_finalized: boolean
          mail_operation_id: string
          notification_policy: string
          notification_staged: boolean
          queue_status: string
        }[]
      }
      finish_fomailer_dispatch: {
        Args: {
          p_error_code?: string
          p_operation_key: string
          p_request_hash: string
          p_response: Json
          p_status: string
        }
        Returns: Json
      }
      finish_loyalty_operation: {
        Args: {
          p_error_code?: string
          p_error_message?: string
          p_operation_key: string
          p_provider_response?: Json
          p_square_loyalty_account_id?: string
          p_square_reward_id?: string
          p_status: string
        }
        Returns: {
          actor_user_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          points: number | null
          provider_idempotency_key: string
          provider_response: Json | null
          provider_started_at: string | null
          provider_started_by_service: string | null
          reason: string | null
          request_hash: string
          request_payload: Json
          requested_by_service: string
          square_customer_id: string | null
          square_loyalty_account_id: string | null
          square_order_id: string | null
          square_reward_id: string | null
          square_reward_tier_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finish_support_ticket_notification: {
        Args: {
          p_notification: Json
          p_operation_key: string
          p_request_hash: string
          p_status: string
        }
        Returns: Json
      }
      get_customer_rentals_summary: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_dashboard_scan_workload_counts: {
        Args: { p_location_id?: string }
        Returns: {
          counted_at: string
          scan_35mm_tiff_rolls: number
          scan_jpg_120_rolls: number
          window_days: number
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
      get_public_download_link_regeneration_status: {
        Args: {
          p_operation_key: string
          p_order_reference: number
          p_public_order_token: string
        }
        Returns: Json
      }
      get_secret: { Args: { secret_name: string }; Returns: string }
      has_app_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      increment_refunded_amount: {
        Args: { p_amount: number; p_order_id: string }
        Returns: undefined
      }
      invalidate_public_download_link_regeneration_entitlement: {
        Args: { p_request_id: string }
        Returns: string
      }
      invoke_calendar_maintenance: { Args: never; Returns: number }
      invoke_fostudio_access_worker: { Args: never; Returns: number }
      invoke_mail_reminder_processor: { Args: never; Returns: number }
      invoke_rental_lifecycle_worker: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_auth_session_active: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      is_dashboard_staff: { Args: never; Returns: boolean }
      is_dashboard_writer: { Args: never; Returns: boolean }
      kiosk_order_persistence_readiness: { Args: never; Returns: Json }
      list_checkout_inventory_recovery_candidates: {
        Args: { p_limit?: number; p_min_age?: string }
        Returns: {
          age_seconds: number
          cart_id: string
          checkout_attempt_id: string
          item_count: number
          items: Json
          location_id: string
          provider_started_at: string
          recovery_state: string
          reserved_at: string
          reserved_quantity: number
          square_order_id: string
        }[]
      }
      list_darkroom_availability: {
        Args: {
          p_capability: string
          p_duration_hours?: number
          p_facility_id: string
          p_location_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          available: boolean
          bay_id: string
          bay_name: string
          capabilities: string[]
          facility_id: string
          slot_end: string
          slot_start: string
        }[]
      }
      list_rental_locations: {
        Args: { p_site_key?: string }
        Returns: {
          camera_enabled: boolean
          darkroom_enabled: boolean
          id: string
          name: string
          orientation_enforced: boolean
          shipping_enabled: boolean
          site_key: string
          slug: string
          square_location_id: string
          timezone: string
        }[]
      }
      loyalty_account_snapshot: {
        Args: { p_square_loyalty_account_id: string }
        Returns: Json
      }
      loyalty_accounting_contract_version: { Args: never; Returns: string }
      loyalty_accounting_readiness: { Args: never; Returns: Json }
      loyalty_customer_portal_control_readiness: { Args: never; Returns: Json }
      loyalty_customer_portal_workspace: {
        Args: { p_event_limit?: number; p_user_id: string }
        Returns: Json
      }
      loyalty_customer_workspace: {
        Args: { p_customer_id: string; p_event_limit?: number }
        Returns: Json
      }
      loyalty_status_tier: { Args: { p_points: number }; Returns: string }
      mark_loyalty_operation_provider_started: {
        Args: { p_operation_key: string; p_started_by_service: string }
        Returns: {
          actor_user_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          location_id: string | null
          operation_key: string
          operation_kind: string
          points: number | null
          provider_idempotency_key: string
          provider_response: Json | null
          provider_started_at: string | null
          provider_started_by_service: string | null
          reason: string | null
          request_hash: string
          request_payload: Json
          requested_by_service: string
          square_customer_id: string | null
          square_loyalty_account_id: string | null
          square_order_id: string | null
          square_reward_id: string | null
          square_reward_tier_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      observe_checkout_inventory_internal: {
        Args: {
          p_catalog_variation_id: string
          p_location_id: string
          p_square_calculated_at: string
          p_square_in_stock: number
        }
        Returns: {
          observation_applied: boolean
          square_calculated_at: string
          square_in_stock: number
        }[]
      }
      order_shipstation_external_id: {
        Args: { p_order_db_id: number; p_square_order_id: string }
        Returns: string
      }
      order_shipstation_sync_contract_version: { Args: never; Returns: string }
      order_shipstation_sync_readiness: { Args: never; Returns: Json }
      orders2_resolve_fulfillment_type: {
        Args: {
          p_fulfillment_meta: Json
          p_pickedup: boolean
          p_shipping_status: string
        }
        Returns: string
      }
      patch_support_ticket: {
        Args: {
          p_actor_id: string
          p_comment: Json
          p_has_is_resolved: boolean
          p_has_workflow_status: boolean
          p_is_resolved: boolean
          p_queue: string
          p_ticket_id: string
          p_workflow_status: string
        }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      patch_support_ticket_idempotent: {
        Args: {
          p_actor_id: string
          p_comment: Json
          p_has_is_resolved: boolean
          p_has_workflow_status: boolean
          p_is_resolved: boolean
          p_operation_key: string
          p_queue: string
          p_request_hash: string
          p_ticket_id: string
          p_workflow_status: string
        }
        Returns: Json
      }
      persist_kiosk_order_shipping_intent: {
        Args: {
          p_customer_id: string
          p_email: string
          p_fulfillment_meta: Json
          p_line_items: Json
          p_location_id: string
          p_name: string
          p_order_id: string
          p_order_type: string
          p_phone: string
          p_shipping_status: string
          p_square_order_json: Json
          p_state: string
          p_terminal_status: string
          p_total: number
        }
        Returns: {
          checkout_attempt_id: string | null
          completed: boolean
          confirmationSent: boolean | null
          created: string
          customer_visible_notes: string | null
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
          service_completion_updated_at: string | null
          shipping_status: string | null
          squareOrderJSON: Json | null
          ssOrderId: number | null
          state: string | null
          terminalStatus: string | null
          total: number | null
          type: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders2"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_order_shipstation_request: {
        Args: {
          p_claim_token: string
          p_operation_id: string
          p_provider_request: Json
        }
        Returns: {
          already_prepared: boolean
          operation_id: string
          provider_request_hash: string
        }[]
      }
      process_due_membership_credit_grants: {
        Args: { p_limit?: number }
        Returns: {
          canceled_count: number
          processed_count: number
          skipped_count: number
        }[]
      }
      project_square_loyalty_account: {
        Args: {
          p_balance_points?: number
          p_enrolled_at?: string
          p_expiring_point_deadlines?: Json
          p_lifetime_points?: number
          p_phone_number?: string
          p_projection_state?: string
          p_raw_account?: Json
          p_square_created_at?: string
          p_square_customer_id?: string
          p_square_loyalty_account_id: string
          p_square_program_id: string
          p_square_updated_at?: string
          p_synced_at?: string
        }
        Returns: {
          balance_points: number
          created_at: string
          customer_id: string | null
          enrolled_at: string | null
          expiring_point_deadlines: Json
          id: string
          last_square_event_at: string | null
          lifetime_points: number
          phone_number: string | null
          program_segment: string
          projection_state: string
          raw_account: Json
          rolling_12_month_points: number
          square_created_at: string | null
          square_customer_id: string | null
          square_loyalty_account_id: string
          square_program_id: string
          square_updated_at: string | null
          status_tier: string
          synced_at: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prune_checkout_inventory_reservations: {
        Args: { p_audit_retention?: string }
        Returns: number
      }
      prune_public_download_link_regeneration_data: {
        Args: { p_limit?: number }
        Returns: Json
      }
      prune_stale_cart_sessions: {
        Args: never
        Returns: {
          empty_sessions_deleted: number
          expired_items_deleted: number
          expired_sessions_deleted: number
        }[]
      }
      public_download_link_regeneration_entitlement_is_valid: {
        Args: {
          p_location_id: string
          p_now?: string
          p_order_db_id: number
          p_order_id: string
        }
        Returns: boolean
      }
      public_download_link_regeneration_readiness: {
        Args: never
        Returns: Json
      }
      public_link_regeneration_provider_window_expired: {
        Args: { p_now: string; p_result: Json }
        Returns: boolean
      }
      public_link_regeneration_recovery_checkpoint_is_valid: {
        Args: { p_result: Json }
        Returns: boolean
      }
      public_link_regeneration_recovery_is_active: {
        Args: { p_now: string; p_result: Json }
        Returns: boolean
      }
      public_link_regeneration_requires_operator_block: {
        Args: { p_now: string; p_result: Json }
        Returns: boolean
      }
      public_link_replacement_checkpointed_at: {
        Args: { p_result: Json }
        Returns: string
      }
      queue_refund_request: {
        Args: {
          p_amount: number
          p_initiated_by: string
          p_notification_policy?: string
          p_order_db_id: number
          p_order_id: string
          p_reason: string
          p_request_hash: string
          p_request_key: string
        }
        Returns: {
          amount: number
          attempted_at: string | null
          created_at: string
          error_message: string | null
          id: number
          idempotency_key: string
          initiated_by: string | null
          notification_policy: string
          order_db_id: number
          order_id: string
          processed_at: string | null
          reason: string | null
          request_hash: string
          request_key: string
          square_refund_id: string | null
          square_response: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "refund_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reconcile_checkout_inventory: {
        Args: { p_location_id: string; p_observations: Json }
        Returns: {
          active_reserved_quantity: number
          catalog_variation_id: string
          completed_unreflected_quantity: number
          effective_available_quantity: number
          observation_applied: boolean
          square_calculated_at: string
          square_in_stock: number
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
      record_order_shipstation_not_found: {
        Args: { p_claim_token: string; p_operation_id: string }
        Returns: {
          first_not_found_at: string
          next_attempt_at: string
          reconcile_not_found_count: number
          status: string
        }[]
      }
      record_square_loyalty_event: {
        Args: {
          p_event_source: string
          p_event_type: string
          p_location_id: string
          p_occurred_at: string
          p_payload_sha256: string
          p_points_change: number
          p_qualifying_points: number
          p_raw_event: Json
          p_reason: string
          p_square_loyalty_account_id: string
          p_square_loyalty_event_id: string
          p_square_order_id: string
          p_square_reward_id: string
          p_square_webhook_event_id: string
        }
        Returns: {
          event_source: string
          event_type: string
          id: string
          ingested_at: string
          location_id: string | null
          loyalty_account_id: string | null
          occurred_at: string
          payload_sha256: string | null
          points_change: number
          qualifying_points: number
          raw_event: Json
          reason: string | null
          square_loyalty_account_id: string
          square_loyalty_event_id: string
          square_order_id: string | null
          square_reward_id: string | null
          square_webhook_event_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_booking_credit_lots: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_component: string
          p_metadata: Json
          p_operation_key: string
          p_reason: string
          p_user_id: string
        }
        Returns: {
          credits_refunded: number
          new_balance: number
        }[]
      }
      refund_reconciliation_contract_version: { Args: never; Returns: string }
      release_cart_checkout: {
        Args: {
          p_cart_id: string
          p_checkout_attempt_id: string
          p_terminal_provider_failure: boolean
        }
        Returns: boolean
      }
      release_checkout_boundaries: {
        Args: {
          p_cart_id: string
          p_checkout_attempt_id: string
          p_terminal_provider_failure: boolean
        }
        Returns: boolean
      }
      release_checkout_inventory_reservations: {
        Args: { p_checkout_attempt_id: string }
        Returns: boolean
      }
      rental_accept_camera_agreement: {
        Args: {
          p_agreement_version_id: string
          p_customer_id: string
          p_request_ip_hash: string
          p_request_user_agent: string
          p_signature_hash: string
          p_typed_legal_name: string
        }
        Returns: {
          acceptance_id: string
          accepted_at: string
          agreement_version_id: string
          content_hash: string
        }[]
      }
      rental_actor_can_configure_location: {
        Args: { p_actor_id: string; p_location_id: string }
        Returns: boolean
      }
      rental_actor_can_configure_square_location: {
        Args: { p_actor_id: string; p_square_location_id: string }
        Returns: boolean
      }
      rental_actor_has_roles: {
        Args: { p_actor_id: string; p_roles: string[] }
        Returns: boolean
      }
      rental_admin_activate_camera_beta: {
        Args: {
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_block_unstarted_darkroom_checkout_price: {
        Args: {
          p_actor_id: string
          p_operation_key: string
          p_request_id: string
        }
        Returns: Json
      }
      rental_admin_catalog_readiness: { Args: never; Returns: Json }
      rental_admin_escalate_exhausted_darkroom_checkout_price: {
        Args: {
          p_actor_id: string
          p_command_key: string
          p_location_id: string
          p_reconciliation_snapshot: Json
          p_request_id: string
        }
        Returns: Json
      }
      rental_admin_invalidate_unstarted_darkroom_square_sync: {
        Args: {
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
          p_request_id: string
        }
        Returns: Json
      }
      rental_admin_prepare_darkroom_worker: {
        Args: {
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_publish_camera_agreement: {
        Args: {
          p_actor_id: string
          p_body: string
          p_effective_at: string
          p_operation_key: string
          p_title: string
          p_version: string
        }
        Returns: Json
      }
      rental_admin_publish_camera_policy: {
        Args: {
          p_actor_id: string
          p_effective_at: string
          p_location_id: string
          p_operation_key: string
          p_rules: Json
        }
        Returns: Json
      }
      rental_admin_publish_darkroom_policy: {
        Args: {
          p_activate: boolean
          p_actor_id: string
          p_effective_at: string
          p_location_id: string
          p_operation_key: string
          p_rules: Json
        }
        Returns: Json
      }
      rental_admin_publish_darkroom_pricing: {
        Args: {
          p_actor_id: string
          p_bay_assignments: Json
          p_classes: Json
          p_currency: string
          p_expected_version: number
          p_location_id: string
          p_member_discount_bps: number
          p_operation_key: string
          p_orientation: Json
        }
        Returns: Json
      }
      rental_admin_record_darkroom_square_reference: {
        Args: {
          p_actor_id: string
          p_billable_id: string
          p_location_id: string
          p_operation_key: string
          p_snapshot: Json
        }
        Returns: Json
      }
      rental_admin_replace_camera_hours: {
        Args: {
          p_actor_id: string
          p_hours: Json
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_replace_location_hours: {
        Args: {
          p_actor_id: string
          p_conflict_acknowledged: boolean
          p_hours: Json
          p_location_id: string
          p_operation_key: string
          p_source: string
          p_source_fingerprint: string
        }
        Returns: Json
      }
      rental_admin_request_darkroom_checkout_price: {
        Args: {
          p_actor_id: string
          p_amount_cents: number
          p_confirm: boolean
          p_destination_category_id: string
          p_display_name: string
          p_kind: string
          p_location_id: string
          p_operation_key: string
          p_provider_request: Json
        }
        Returns: Json
      }
      rental_admin_request_darkroom_square_sync: {
        Args: {
          p_actor_id: string
          p_billable_id: string
          p_expected_revision: number
          p_location_id: string
          p_operation_key: string
          p_provider_context: Json
        }
        Returns: Json
      }
      rental_admin_resolve_darkroom_addon_review: {
        Args: {
          p_actor_id: string
          p_addon_id: string
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_resume_darkroom_checkout_price: {
        Args: {
          p_actor_id: string
          p_confirm: boolean
          p_location_id: string
          p_resume_key: string
        }
        Returns: Json
      }
      rental_admin_review_darkroom_billable_draft: {
        Args: {
          p_actor_id: string
          p_billable_id: string
          p_confirm: boolean
          p_expected_revision: number
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_review_darkroom_orientation: {
        Args: {
          p_actor_id: string
          p_capability: string
          p_customer_id: string
          p_expires_at: string
          p_location_id: string
          p_notes: string
          p_operation_key: string
          p_status: string
        }
        Returns: Json
      }
      rental_admin_save_camera_block: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_block_id: string
          p_ends_at: string
          p_location_id: string
          p_operation_key: string
          p_reason: string
          p_starts_at: string
          p_unit_id: string
        }
        Returns: Json
      }
      rental_admin_save_camera_duration: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_duration_days: number
          p_duration_id: string
          p_label: string
          p_location_id: string
          p_operation_key: string
          p_product_id: string
          p_rental_fee_cents: number
          p_sort_order: number
          p_square_variation_id: string
        }
        Returns: Json
      }
      rental_admin_save_camera_location: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_camera_enabled: boolean
          p_location_id: string
          p_metadata: Json
          p_name: string
          p_operation_key: string
          p_shipping_enabled: boolean
          p_site_key: string
          p_slug: string
          p_square_location_id: string
          p_timezone: string
        }
        Returns: Json
      }
      rental_admin_save_camera_product: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_deposit_cents: number
          p_description: string
          p_fulfillment_methods: string[]
          p_inspection_buffer_hours: number
          p_location_id: string
          p_metadata: Json
          p_name: string
          p_operation_key: string
          p_outbound_buffer_hours: number
          p_prep_buffer_hours: number
          p_product_id: string
          p_return_buffer_hours: number
          p_slug: string
        }
        Returns: Json
      }
      rental_admin_save_camera_unit: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_asset_tag: string
          p_condition_status: string
          p_location_id: string
          p_operation_key: string
          p_operational_status: string
          p_product_id: string
          p_serial_number: string
          p_unit_id: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_addon: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_addon_id: string
          p_category?: string
          p_credit_rate: number
          p_description: string
          p_eligible_facility_ids: string[]
          p_location_id: string
          p_name: string
          p_operation_key: string
          p_pricing_mode: string
          p_quantity: number
          p_slug: string
          p_sort_order: number
        }
        Returns: Json
      }
      rental_admin_save_darkroom_addon_details: {
        Args: {
          p_actor_id: string
          p_addon_id: string
          p_category: string
          p_compatibility_notes: string
          p_confirm_review: boolean
          p_focal_length: string
          p_location_id: string
          p_make_model: string
          p_operation_key: string
          p_paper_sizes: string[]
          p_supported_formats: string[]
        }
        Returns: Json
      }
      rental_admin_save_darkroom_addon_unit: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_condition_status: string
          p_location_id: string
          p_notes: string
          p_operation_key: string
          p_operational_status: string
          p_unit_id: string
          p_unit_label: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_addon_with_billing: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_addon_id: string
          p_amount_cents: number
          p_billing_unit: string
          p_category: string
          p_credit_rate: number
          p_currency: string
          p_description: string
          p_duration_minutes: number
          p_eligible_facility_ids: string[]
          p_expected_billing_revision: number
          p_is_taxable: boolean
          p_location_id: string
          p_name: string
          p_operation_key: string
          p_pricing_mode: string
          p_quantity: number
          p_slug: string
          p_sort_order: number
          p_source_snapshot_id: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_bay: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_bay_id: string
          p_capabilities: string[]
          p_facility_id: string
          p_fixed_kit?: boolean
          p_location_id: string
          p_name: string
          p_operation_key: string
          p_slug: string
          p_sort_order: number
        }
        Returns: Json
      }
      rental_admin_save_darkroom_bay_details: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_bay_id: string
          p_condition_notes: string
          p_fixed_kit: boolean
          p_location_id: string
          p_make_model: string
          p_operation_key: string
          p_operational_status: string
          p_supported_formats: string[]
        }
        Returns: Json
      }
      rental_admin_save_darkroom_bay_with_billing: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_amount_cents: number
          p_bay_id: string
          p_billing_unit: string
          p_capabilities: string[]
          p_currency: string
          p_duration_minutes: number
          p_expected_billing_revision: number
          p_facility_id: string
          p_fixed_kit: boolean
          p_is_taxable: boolean
          p_location_id: string
          p_name: string
          p_operation_key: string
          p_slug: string
          p_sort_order: number
          p_source_snapshot_id: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_billable_draft: {
        Args: {
          p_actor_id: string
          p_amount_cents: number
          p_billing_unit: string
          p_currency: string
          p_duration_minutes: number
          p_expected_revision: number
          p_is_taxable: boolean
          p_location_id: string
          p_operation_key: string
          p_source_snapshot_id: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_credit_pack: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_checkout_price_active: boolean
          p_checkout_price_id: string
          p_credit_pack_id: string
          p_credits: number
          p_expiry_days: number
          p_location_id: string
          p_name: string
          p_operation_key: string
          p_price_cents: number
          p_slug: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_location_settings: {
        Args: {
          p_actor_id: string
          p_business_email: string
          p_business_name: string
          p_darkroom_enabled: boolean
          p_expected_updated_at: string
          p_location_id: string
          p_operation_key: string
          p_orientation_enforced: boolean
        }
        Returns: Json
      }
      rental_admin_save_darkroom_membership_plan: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_bank_cap: number
          p_booking_horizon_days: number
          p_checkout_price_active: boolean
          p_checkout_price_id: string
          p_credit_expiry_days: number
          p_location_id: string
          p_monthly_credits: number
          p_name: string
          p_operation_key: string
          p_plan_id: string
          p_price_cents: number
          p_slug: string
        }
        Returns: Json
      }
      rental_admin_save_darkroom_notification_templates: {
        Args: {
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
          p_templates: Json
        }
        Returns: Json
      }
      rental_admin_set_camera_agreement_active: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_agreement_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_set_camera_policy_active: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_operation_key: string
          p_policy_id: string
        }
        Returns: Json
      }
      rental_admin_set_camera_product_sync: {
        Args: {
          p_actor_id: string
          p_expected_updated_at: string
          p_location_id: string
          p_operation_key: string
          p_product_id: string
          p_sync_status: string
        }
        Returns: Json
      }
      rental_admin_set_darkroom_booking_v2: {
        Args: {
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
          p_required: boolean
        }
        Returns: Json
      }
      rental_admin_set_darkroom_customer_access: {
        Args: {
          p_actor_id: string
          p_booking_enabled: boolean
          p_expected_version: number
          p_location_id: string
          p_membership_checkout_enabled: boolean
          p_operation_key: string
          p_topoff_checkout_enabled: boolean
        }
        Returns: Json
      }
      rental_admin_set_darkroom_facility_active: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_facility_id: string
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_admin_set_darkroom_policy_active: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
          p_policy_id: string
        }
        Returns: Json
      }
      rental_admin_set_darkroom_square_sync_control: {
        Args: {
          p_actor_id: string
          p_confirm: boolean
          p_expected_version: number
          p_location_id: string
          p_operation_key: string
          p_provider_writes_enabled: boolean
          p_reason: string
          p_recovery_verified_at: string
          p_worker_contract_version: string
        }
        Returns: Json
      }
      rental_admin_set_location_active: {
        Args: {
          p_active: boolean
          p_actor_id: string
          p_location_id: string
          p_operation_key: string
        }
        Returns: Json
      }
      rental_append_audit: {
        Args: {
          p_actor_id: string
          p_after_state: Json
          p_before_state: Json
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_location_id: string
          p_metadata?: Json
          p_reason: string
          p_reservation_id: string
        }
        Returns: number
      }
      rental_approve_camera_inspection_v2: {
        Args: {
          p_actor_id: string
          p_approved_deduction_cents: number
          p_customer_facing_reason?: string
          p_expected_inspection_status: string
          p_expected_reservation_state_version: number
          p_inspection_id: string
          p_location_id: string
        }
        Returns: Json
      }
      rental_approve_inspection: {
        Args: {
          p_actor_id: string
          p_approved_deduction_cents: number
          p_expected_status: string
          p_inspection_id: string
          p_location_id: string
          p_reason: string
        }
        Returns: Json
      }
      rental_assert_darkroom_customer_beta_ready: {
        Args: { p_location_id: string }
        Returns: undefined
      }
      rental_camera_availability: {
        Args: {
          p_from: string
          p_location_id: string
          p_product_id: string
          p_to: string
        }
        Returns: Json
      }
      rental_camera_availability_v2: {
        Args: {
          p_from: string
          p_fulfillment_method: string
          p_location_id: string
          p_product_id: string
          p_to: string
        }
        Returns: Json
      }
      rental_camera_beta_launch_readiness: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_camera_checkout_context: {
        Args: {
          p_agreement_acceptance_id?: string
          p_coi_review_id?: string
          p_customer_id: string
          p_duration_option_id: string
          p_fulfillment_method: string
          p_location_id: string
          p_operation_key?: string
          p_product_id: string
          p_use_start: string
        }
        Returns: Json
      }
      rental_camera_policy_rules_valid: {
        Args: { p_rules: Json }
        Returns: boolean
      }
      rental_cancel_darkroom_booking: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_expected_version: number
          p_override_refund?: boolean
          p_reason: string
        }
        Returns: {
          booking_id: string
          credits_refunded: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_checkpoint_financial_operation: {
        Args: {
          p_attempt: number
          p_error_code?: string
          p_financial_operation_id: string
          p_provider_step: string
          p_response?: Json
          p_retryable?: boolean
          p_square_invoice_id?: string
          p_square_order_id?: string
          p_square_refund_id?: string
          p_worker: string
        }
        Returns: Json
      }
      rental_claim_camera_checkout_recovery: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          checkout_id: string
          checkout_status: string
          deposit_cents: number
          duration_label: string
          expected_amount_cents: number
          lease_expires_at: string
          operation_key: string
          product_name: string
          provider_request_hash: string
          provider_request_snapshot: Json
          provider_started_at: string
          recovery_attempt: number
          rental_fee_cents: number
          request_hash: string
          shipping_cents: number
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string
          square_variation_id: string
          tax_cents: number
        }[]
      }
      rental_claim_financial_operations: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          amount_cents: number
          attempt: number
          camera_rental_id: string
          currency: string
          customer_email: string
          damage_invoice_due_date: string
          damage_invoice_due_days: number
          damage_invoice_policy_id: string
          damage_invoice_policy_version: number
          financial_operation_id: string
          lease_expires_at: string
          location_timezone: string
          operation_key: string
          operation_type: string
          provider_request_snapshot: Json
          provider_step: string
          reason: string
          reservation_id: string
          square_customer_id: string
          square_invoice_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string
          square_refund_id: string
        }[]
      }
      rental_claim_mail_outbox: {
        Args: { p_lease_seconds: number; p_limit: number; p_worker: string }
        Returns: {
          attempts: number
          customer_id: string
          dedupe_key: string
          event_type: string
          id: string
          lease_expires_at: string
          location: Json
          location_id: string
          payload: Json
          recipient_email: string
          recipient_scope: string
          reservation_id: string
          user_id: string
        }[]
      }
      rental_claim_upload_cleanup: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempts: number
          cleanup_reason: string
          lease_expires_at: string
          manifest_id: string
          operation_key: string
          purpose: string
          storage_bucket: string
          storage_paths: string[]
        }[]
      }
      rental_complete_verification_document_purge: {
        Args: {
          p_actor_id: string
          p_error?: string
          p_location_id: string
          p_success: boolean
          p_verification_id: string
        }
        Returns: Json
      }
      rental_confirm_darkroom_booking: {
        Args: {
          p_actor_id?: string
          p_expected_version: number
          p_reservation_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_confirm_darkroom_booking_pre_customer_control: {
        Args: {
          p_actor_id?: string
          p_expected_version: number
          p_reservation_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_contract_version: { Args: never; Returns: Json }
      rental_create_camera_hold: {
        Args: {
          p_agreement_acceptance_id: string
          p_coi_review_id?: string
          p_customer_id: string
          p_duration_option_id: string
          p_fulfillment_method: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_location_id: string
          p_product_id: string
          p_quote: Json
          p_request_hash: string
          p_use_start: string
        }
        Returns: {
          camera_rental_id: string
          camera_unit_id: string
          checkout_id: string
          deposit_cents: number
          expected_amount_cents: number
          hold_expires_at: string
          rental_fee_cents: number
          reservation_id: string
          shipping_cents: number
          state_version: number
          status: string
          tax_cents: number
        }[]
      }
      rental_create_darkroom_hold: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_facility_id: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_create_darkroom_hold_pre_customer_control: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_facility_id: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_create_darkroom_hold_v2: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_facility_id: string
          p_film_format: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_paper_size: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_create_darkroom_hold_v2_accepted: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_expected_credits: number
          p_expected_location_id: string
          p_expected_policy_id: string
          p_expected_policy_version: number
          p_expected_site_key: string
          p_facility_id: string
          p_film_format: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_paper_size: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_create_darkroom_hold_v2_pre_customer_control: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_facility_id: string
          p_film_format: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_paper_size: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_create_darkroom_hold_v2_unchecked: {
        Args: {
          p_addons: Json
          p_bay_id: string
          p_capability: string
          p_customer_id: string
          p_duration_hours: number
          p_facility_id: string
          p_film_format: string
          p_hold_minutes?: number
          p_idempotency_key: string
          p_paper_size: string
          p_quote_version: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          credits_required: number
          hold_expires_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_current_camera_agreement: { Args: never; Returns: Json }
      rental_customer_camera_checkout_attempt: {
        Args: {
          p_location_id: string
          p_operation_key: string
          p_site_key: string
          p_user_id: string
        }
        Returns: Json
      }
      rental_customer_camera_rental_detail: {
        Args: {
          p_location_id?: string
          p_rental_id: string
          p_site_key: string
          p_user_id: string
        }
        Returns: Json
      }
      rental_customer_cancel_darkroom_booking_v2: {
        Args: {
          p_booking_id: string
          p_expected_version: number
          p_location_id: string
          p_reason?: string
          p_site_key: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_refunded: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_customer_confirm_darkroom_booking_v2: {
        Args: {
          p_expected_version: number
          p_location_id: string
          p_reservation_id: string
          p_site_key: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_customer_confirm_darkroom_booking_v2_unchecked: {
        Args: {
          p_expected_version: number
          p_location_id: string
          p_reservation_id: string
          p_site_key: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_customer_confirm_darkroom_v2_pre_access: {
        Args: {
          p_expected_version: number
          p_location_id: string
          p_reservation_id: string
          p_site_key: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credits_burned: number
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_customer_darkroom_summary_v2: {
        Args: { p_location_id: string; p_site_key: string; p_user_id: string }
        Returns: Json
      }
      rental_customer_summary: {
        Args: { p_location_id?: string; p_site_key?: string; p_user_id: string }
        Returns: Json
      }
      rental_darkroom_availability: {
        Args: {
          p_capability?: string
          p_duration_hours?: number
          p_facility_id?: string
          p_from: string
          p_location_id: string
          p_to: string
        }
        Returns: Json
      }
      rental_darkroom_availability_v2: {
        Args: {
          p_capability: string
          p_duration_hours?: number
          p_facility_id?: string
          p_film_format: string
          p_from: string
          p_location_id: string
          p_to: string
        }
        Returns: Json
      }
      rental_darkroom_catalog_v2: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_checkout_price_operation_readiness: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_customer_beta_readiness: { Args: never; Returns: Json }
      rental_darkroom_customer_beta_readiness_pre_payment_hardening: {
        Args: never
        Returns: Json
      }
      rental_darkroom_customer_billing_catalog: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_customer_launch_readiness: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_customer_launch_summary: { Args: never; Returns: Json }
      rental_darkroom_facility_activation_readiness: {
        Args: { p_facility_id: string; p_location_id: string }
        Returns: Json
      }
      rental_darkroom_launch_readiness: { Args: never; Returns: Json }
      rental_darkroom_policy_rules_valid: {
        Args: { p_rules: Json }
        Returns: boolean
      }
      rental_darkroom_pricing_catalog: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_public_square_billables: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_darkroom_square_billing_catalog: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_enqueue_mail: {
        Args: {
          p_available_at?: string
          p_customer_id: string
          p_dedupe_key: string
          p_event_type: string
          p_location_id: string
          p_payload: Json
          p_recipient_scope: string
          p_reservation_id: string
        }
        Returns: string
      }
      rental_expire_stale_holds: { Args: { p_limit?: number }; Returns: Json }
      rental_finalize_camera_settlement: {
        Args: { p_reservation_id: string; p_source?: string }
        Returns: Json
      }
      rental_finish_camera_checkout_recovery: {
        Args: {
          p_checkout_id: string
          p_error_code?: string
          p_recovered: boolean
          p_recovery_attempt: number
          p_retryable: boolean
          p_worker: string
        }
        Returns: Json
      }
      rental_finish_mail_outbox: {
        Args: { p_error?: string; p_outbox_id: string; p_status: string }
        Returns: Json
      }
      rental_finish_membership_provider: {
        Args: {
          p_checkout_id: string
          p_idempotency_key: string
          p_request_hash: string
          p_response?: Json
          p_square_order_id: string
          p_square_payment_link_id: string
        }
        Returns: Json
      }
      rental_finish_upload_cleanup: {
        Args: {
          p_attempt: number
          p_error?: string
          p_manifest_id: string
          p_success: boolean
          p_worker: string
        }
        Returns: Json
      }
      rental_lookup_darkroom_topoff_checkout: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_topoff_option_id: string
          p_user_id: string
        }
        Returns: {
          checkout_id: string
          credits: number
          currency: string
          customer_id: string
          financial_review_required: boolean
          membership_id: string
          payment_note: string
          payment_reference_id: string
          price_cents: number
          provider_idempotency_key: string
          provider_started_at: string
          refund_status: string
          request_hash: string
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string
          square_variation_id: string
          status: string
        }[]
      }
      rental_process_due_actions: { Args: { p_limit?: number }; Returns: Json }
      rental_public_program: { Args: { p_site_key?: string }; Returns: Json }
      rental_queue_shipment: {
        Args: {
          p_actor_id: string
          p_camera_rental_id: string
          p_direction: string
          p_idempotency_key: string
          p_location_id: string
        }
        Returns: {
          direction: string
          idempotency_key: string
          shipment_id: string
          status: string
        }[]
      }
      rental_readiness: { Args: never; Returns: Json }
      rental_recompute_darkroom_membership_eligibility: {
        Args: { p_membership_id: string; p_resolved_invoice_id?: string }
        Returns: undefined
      }
      rental_reconcile_damage_invoice: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_occurred_at: string
          p_financial_operation_id: string
          p_invoice_id: string
          p_metadata?: Json
          p_payload_sha256: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_status: string
        }
        Returns: Json
      }
      rental_reconcile_square_payment: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_order_id: string
          p_payload_sha256: string
          p_payment_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_square_customer_id: string
          p_square_location_id: string
          p_status: string
        }
        Returns: Json
      }
      rental_reconcile_square_refund: {
        Args: {
          p_amount_cents: number
          p_currency: string
          p_event_occurred_at: string
          p_metadata?: Json
          p_order_id: string
          p_payload_sha256: string
          p_payment_id: string
          p_provider_event_id: string
          p_provider_event_type: string
          p_refund_id: string
          p_status: string
        }
        Returns: Json
      }
      rental_record_camera_checkout_provider_result: {
        Args: {
          p_checkout_id: string
          p_error_code?: string
          p_operation_key: string
          p_outcome: string
          p_provider_status?: string
          p_request_hash: string
          p_response?: Json
          p_square_order_id?: string
          p_square_payment_id?: string
        }
        Returns: Json
      }
      rental_record_camera_inspection_v2: {
        Args: {
          p_actor_id: string
          p_after_evidence_paths: string[]
          p_before_evidence_paths: string[]
          p_camera_rental_id: string
          p_checklist: Json
          p_condition_after: string
          p_condition_before: string
          p_expected_reservation_state_version: number
          p_internal_notes: string
          p_location_id: string
          p_recommended_deduction_cents: number
          p_upload_manifest_id?: string
          p_zero_damage_confirmed: boolean
        }
        Returns: Json
      }
      rental_record_camera_quote: {
        Args: {
          p_customer_id: string
          p_delivery_address: Json
          p_duration_option_id: string
          p_expires_at: string
          p_fulfillment_method: string
          p_location_id: string
          p_product_id: string
          p_provider_quote: Json
          p_quote_id: string
          p_request_hash: string
          p_shipping_cents: number
          p_tax_cents: number
          p_use_start: string
        }
        Returns: Json
      }
      rental_record_camera_quote_null_unchecked: {
        Args: {
          p_customer_id: string
          p_delivery_address: Json
          p_duration_option_id: string
          p_expires_at: string
          p_fulfillment_method: string
          p_location_id: string
          p_product_id: string
          p_provider_quote: Json
          p_quote_id: string
          p_request_hash: string
          p_shipping_cents: number
          p_tax_cents: number
          p_use_start: string
        }
        Returns: Json
      }
      rental_record_inspection:
        | {
            Args: {
              p_actor_id: string
              p_camera_rental_id: string
              p_condition_after: string
              p_evidence_paths: string[]
              p_expected_status: string
              p_location_id: string
              p_notes: string
              p_recommended_deduction_cents: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_id: string
              p_camera_rental_id: string
              p_condition_after: string
              p_evidence_paths: string[]
              p_expected_status: string
              p_location_id: string
              p_notes: string
              p_recommended_deduction_cents: number
              p_upload_manifest_id: string
            }
            Returns: Json
          }
      rental_record_membership_checkout:
        | {
            Args: {
              p_checkout_id: string
              p_response?: Json
              p_square_customer_id?: string
              p_square_status: string
              p_square_subscription_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount_cents: number
              p_checkout_id: string
              p_currency: string
              p_event_occurred_at: string
              p_metadata?: Json
              p_order_id: string
              p_payload_sha256: string
              p_payment_id: string
              p_payment_note: string
              p_payment_reference_id: string
              p_provider_event_id: string
              p_provider_event_type: string
              p_square_customer_id: string
              p_square_location_id: string
              p_status: string
            }
            Returns: Json
          }
      rental_record_membership_provider_outcome: {
        Args: {
          p_checkout_id: string
          p_error_code: string
          p_idempotency_key: string
          p_outcome: string
          p_request_hash: string
        }
        Returns: Json
      }
      rental_record_provider_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_metadata?: Json
          p_occurred_at: string
          p_payload_sha256: string
          p_provider: string
        }
        Returns: {
          inserted: boolean
          provider_event_id: string
          status: string
        }[]
      }
      rental_record_topoff_provider_outcome: {
        Args: {
          p_checkout_id: string
          p_error_code: string
          p_idempotency_key: string
          p_outcome: string
          p_request_hash: string
        }
        Returns: Json
      }
      rental_record_topoff_provider_outcome_unchecked: {
        Args: {
          p_checkout_id: string
          p_error_code: string
          p_idempotency_key: string
          p_outcome: string
          p_request_hash: string
        }
        Returns: Json
      }
      rental_register_upload_manifest: {
        Args: {
          p_actor_id?: string
          p_customer_id: string
          p_document_fingerprint?: string
          p_location_id: string
          p_operation_key: string
          p_purpose: string
          p_reservation_id?: string
          p_storage_paths: string[]
          p_upload_expires_at?: string
        }
        Returns: Json
      }
      rental_release_reservation_hold: {
        Args: {
          p_expected_version: number
          p_reason: string
          p_reservation_id: string
          p_terminal_provider_failure?: boolean
        }
        Returns: Json
      }
      rental_request_paid_camera_cancellation: {
        Args: {
          p_camera_rental_id: string
          p_location_id: string
          p_reason?: string
          p_request_key: string
          p_site_key: string
          p_user_id: string
        }
        Returns: Json
      }
      rental_reschedule_darkroom_booking: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_duration_hours: number
          p_expected_version: number
          p_new_bay_id: string
          p_new_start_at: string
          p_reason: string
        }
        Returns: {
          booking_id: string
          emergency_reschedule_used: boolean
          ends_at: string
          reservation_id: string
          starts_at: string
          state_version: number
          status: string
        }[]
      }
      rental_reschedule_darkroom_booking_pre_customer_control: {
        Args: {
          p_actor_id: string
          p_booking_id: string
          p_duration_hours: number
          p_expected_version: number
          p_new_bay_id: string
          p_new_start_at: string
          p_reason: string
        }
        Returns: {
          booking_id: string
          emergency_reschedule_used: boolean
          ends_at: string
          reservation_id: string
          starts_at: string
          state_version: number
          status: string
        }[]
      }
      rental_resolve_membership_settlement_context: {
        Args: {
          p_checkout_id: string
          p_square_order_id: string
          p_square_subscription_id: string
        }
        Returns: Json
      }
      rental_review_coi: {
        Args: {
          p_actor_id: string
          p_approved_deposit_cents: number
          p_coverage_cents: number
          p_covered_value_ceiling_cents: number
          p_decision: string
          p_deductible_cents: number
          p_effective_from: string
          p_effective_to: string
          p_expected_status: string
          p_location_id: string
          p_purge_after: string
          p_reason: string
          p_review_id: string
        }
        Returns: Json
      }
      rental_review_customer_verification: {
        Args: {
          p_actor_id: string
          p_decision: string
          p_document_deleted_at?: string
          p_expected_status: string
          p_expires_at: string
          p_location_id: string
          p_reason: string
          p_verification_id: string
        }
        Returns: Json
      }
      rental_service_authorize_darkroom_checkout_price_attempt: {
        Args: {
          p_attempt_key: string
          p_expected_provider_request_sha256: string
          p_reconciliation_snapshot?: Json
          p_request_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rental_service_authorize_darkroom_square_sync_replay: {
        Args: {
          p_claim_token: string
          p_operation_key: string
          p_provider_payload_sha256: string
          p_reconciliation_snapshot: Json
          p_request_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rental_service_claim_darkroom_square_sync: {
        Args: {
          p_claim_token: string
          p_lease_seconds?: number
          p_request_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rental_service_complete_darkroom_checkout_price_attempt: {
        Args: {
          p_attempt_key: string
          p_completion_key: string
          p_error_code: string
          p_outcome: string
          p_provider_result: Json
          p_request_id: string
        }
        Returns: Json
      }
      rental_service_complete_darkroom_square_sync: {
        Args: {
          p_claim_token: string
          p_completion_key: string
          p_error_code: string
          p_outcome: string
          p_provider_payload_sha256: string
          p_provider_snapshot: Json
          p_request_id: string
        }
        Returns: Json
      }
      rental_service_get_darkroom_checkout_price_operation: {
        Args: { p_operation_key: string }
        Returns: Json
      }
      rental_service_get_darkroom_checkout_price_pending: {
        Args: { p_location_id: string }
        Returns: Json
      }
      rental_service_get_darkroom_square_sync_request: {
        Args: { p_request_id: string }
        Returns: Json
      }
      rental_service_list_darkroom_square_sync_work: {
        Args: { p_limit?: number }
        Returns: Json
      }
      rental_service_mark_darkroom_checkout_attempt_unacknowledged: {
        Args: { p_completion_key: string; p_request_id: string }
        Returns: Json
      }
      rental_service_record_darkroom_square_version_observation: {
        Args: {
          p_actor_id: string
          p_billable_id: string
          p_expected_item_catalog_version: number
          p_expected_variation_catalog_version: number
          p_location_id: string
          p_operation_key: string
          p_provider_snapshot: Json
          p_source_sync_request_id: string
        }
        Returns: Json
      }
      rental_service_start_darkroom_square_sync: {
        Args: {
          p_claim_token: string
          p_provider_payload: Json
          p_request_id: string
          p_worker_id: string
        }
        Returns: Json
      }
      rental_start_camera_checkout: {
        Args: {
          p_checkout_id: string
          p_operation_key: string
          p_request_hash: string
        }
        Returns: {
          checkout_id: string
          provider_started_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_start_camera_checkout_v2: {
        Args: {
          p_checkout_id: string
          p_operation_key: string
          p_provider_snapshot: Json
          p_request_hash: string
        }
        Returns: {
          checkout_id: string
          provider_request_hash: string
          provider_started_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_start_camera_checkout_v2_null_unchecked: {
        Args: {
          p_checkout_id: string
          p_operation_key: string
          p_provider_snapshot: Json
          p_request_hash: string
        }
        Returns: {
          checkout_id: string
          provider_request_hash: string
          provider_started_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_start_checkout_provider: {
        Args: {
          p_checkout_id: string
          p_operation_key: string
          p_request_hash: string
        }
        Returns: {
          checkout_id: string
          provider_started_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_start_checkout_provider_null_unchecked: {
        Args: {
          p_checkout_id: string
          p_operation_key: string
          p_request_hash: string
        }
        Returns: {
          checkout_id: string
          provider_started_at: string
          reservation_id: string
          state_version: number
          status: string
        }[]
      }
      rental_start_darkroom_topoff_checkout: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_request_hash: string
          p_topoff_option_id: string
          p_user_id: string
        }
        Returns: {
          checkout_id: string
          credits: number
          currency: string
          customer_id: string
          financial_review_required: boolean
          membership_id: string
          payment_note: string
          payment_reference_id: string
          price_cents: number
          provider_idempotency_key: string
          provider_started_at: string
          refund_status: string
          request_hash: string
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string
          square_variation_id: string
          status: string
        }[]
      }
      rental_start_darkroom_topoff_checkout_pre_customer_control: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_request_hash: string
          p_topoff_option_id: string
          p_user_id: string
        }
        Returns: {
          checkout_id: string
          credits: number
          currency: string
          customer_id: string
          financial_review_required: boolean
          membership_id: string
          payment_note: string
          payment_reference_id: string
          price_cents: number
          provider_idempotency_key: string
          provider_started_at: string
          refund_status: string
          request_hash: string
          square_customer_id: string
          square_location_id: string
          square_order_id: string
          square_payment_id: string
          square_variation_id: string
          status: string
        }[]
      }
      rental_start_darkroom_topoff_checkout_unchecked: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_request_hash: string
          p_topoff_option_id: string
          p_user_id: string
        }
        Returns: {
          checkout_id: string
          credits: number
          currency: string
          customer_id: string
          price_cents: number
          square_location_id: string
          square_variation_id: string
          status: string
        }[]
      }
      rental_start_membership_checkout: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_plan_id: string
          p_user_id: string
        }
        Returns: {
          catalog_evidence: Json
          checkout_id: string
          currency: string
          frozen_request: Json
          location_timezone: string
          membership_id: string
          price_cents: number
          provider_started_at: string
          request_hash: string
          square_location_id: string
          square_plan_variation_id: string
          status: string
        }[]
      }
      rental_start_membership_checkout_pre_customer_control: {
        Args: {
          p_idempotency_key: string
          p_location_id: string
          p_plan_id: string
          p_user_id: string
        }
        Returns: {
          catalog_evidence: Json
          checkout_id: string
          currency: string
          frozen_request: Json
          location_timezone: string
          membership_id: string
          price_cents: number
          provider_started_at: string
          request_hash: string
          square_location_id: string
          square_plan_variation_id: string
          status: string
        }[]
      }
      rental_start_membership_provider:
        | {
            Args: {
              p_catalog_evidence: Json
              p_checkout_id: string
              p_frozen_request: Json
              p_idempotency_key: string
              p_request_hash: string
              p_square_catalog_version: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_checkout_id: string
              p_idempotency_key: string
              p_response?: Json
              p_square_order_id: string
              p_square_payment_link_id: string
            }
            Returns: Json
          }
      rental_start_topoff_provider: {
        Args: {
          p_checkout_id: string
          p_idempotency_key: string
          p_request_hash: string
        }
        Returns: Json
      }
      rental_start_topoff_provider_unchecked: {
        Args: {
          p_checkout_id: string
          p_idempotency_key: string
          p_request_hash: string
        }
        Returns: Json
      }
      rental_submit_coi:
        | {
            Args: {
              p_customer_id: string
              p_idempotency_key: string
              p_location_id: string
              p_storage_paths: string[]
            }
            Returns: {
              created_at: string
              location_id: string
              review_id: string
              status: string
            }[]
          }
        | {
            Args: {
              p_customer_id: string
              p_idempotency_key: string
              p_location_id: string
              p_storage_paths: string[]
              p_upload_manifest_id: string
            }
            Returns: {
              created_at: string
              location_id: string
              review_id: string
              status: string
            }[]
          }
      rental_submit_customer_verification:
        | {
            Args: {
              p_customer_id: string
              p_document_fingerprint: string
              p_idempotency_key: string
              p_location_id: string
              p_storage_paths: string[]
            }
            Returns: {
              created_at: string
              location_id: string
              status: string
              verification_id: string
            }[]
          }
        | {
            Args: {
              p_customer_id: string
              p_document_fingerprint: string
              p_idempotency_key: string
              p_location_id: string
              p_storage_paths: string[]
              p_upload_manifest_id: string
            }
            Returns: {
              created_at: string
              location_id: string
              status: string
              verification_id: string
            }[]
          }
      rental_transition_reservation: {
        Args: {
          p_actor_id: string
          p_expected_status: string
          p_expected_version: number
          p_metadata?: Json
          p_new_status: string
          p_reason: string
          p_reservation_id: string
        }
        Returns: {
          reservation_id: string
          state_version: number
          status: string
          updated_at: string
        }[]
      }
      rental_validate_worker_request_key: {
        Args: { p_key: string }
        Returns: boolean
      }
      rental_worker_readiness: { Args: never; Returns: Json }
      replace_link_for_claimed_worker: {
        Args: {
          p_claimed_at: string
          p_claimed_by: string
          p_email: string
          p_expected_current_link: string
          p_expires_at: string
          p_link: string
          p_location_id: string
          p_new_synology_link_id: string
          p_old_synology_link_id: string
          p_order_db_id: number
          p_order_id: string
          p_order_number: number
          p_password: string
          p_request_id: string
        }
        Returns: string
      }
      replace_link_for_worker: {
        Args: {
          p_email: string
          p_expected_current_link: string
          p_expires_at: string
          p_link: string
          p_location_id: string
          p_new_synology_link_id: string
          p_old_synology_link_id: string
          p_order_id: string
          p_password: string
          p_request_id: string
          p_ss_order_id: number
        }
        Returns: string
      }
      request_public_download_link_regeneration: {
        Args: {
          p_operation_key: string
          p_order_reference: number
          p_public_order_token: string
          p_request_fingerprint: string
        }
        Returns: Json
      }
      requeue_order_shipstation_sync: {
        Args: {
          p_actor_id: string
          p_mode?: string
          p_operation_id: string
          p_reason: string
        }
        Returns: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_shipstation_sync_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reschedule_booking_with_credit_adjustment: {
        Args: {
          p_booking_id: string
          p_end_time: string
          p_expected_end_time: string
          p_expected_start_time: string
          p_new_credits: number
          p_notes: string
          p_old_credits: number
          p_operation_key: string
          p_start_time: string
          p_user_id: string
        }
        Returns: {
          booking_id: string
          credit_delta: number
          credits_burned: number
          credits_charged: number
          credits_refunded: number
          end_time: string
          new_balance: number
          notes: string
          start_time: string
        }[]
      }
      reserve_checkout_inventory: {
        Args: {
          p_cart_id: string
          p_checkout_attempt_id: string
          p_items: Json
          p_location_id: string
        }
        Returns: {
          active_reserved_quantity: number
          available_after_reservation: number
          catalog_variation_id: string
          completed_unreflected_quantity: number
          requested_quantity: number
          reservation_status: string
          square_calculated_at: string
          square_in_stock: number
        }[]
      }
      resolve_blocked_public_link_regeneration_request: {
        Args: { p_request_id: string; p_resolution: string }
        Returns: boolean
      }
      resolve_order_db_id: {
        Args: { p_square_order_id: string; p_ss_order_id: number }
        Returns: number
      }
      resolve_rental_square_variation: {
        Args: { p_square_location_id?: string; p_variation_id: string }
        Returns: {
          active: boolean
          cadence: string
          camera_product_id: string
          credits: number
          duration_days: number
          duration_option_id: string
          location_id: string
          mapping_id: string
          metadata: Json
          plan_id: string
          price_cents: number
          program: string
          square_location_id: string
          topoff_option_id: string
        }[]
      }
      revalidate_order_shipstation_sync: {
        Args: { p_operation_id: string }
        Returns: {
          attempts: number
          claim_mode: string
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          completion_source: string | null
          created_at: string
          created_by: string | null
          external_shipment_id: string
          first_not_found_at: string | null
          id: string
          last_error_code: string | null
          last_error_detail: string | null
          last_reconciled_at: string | null
          last_requeue_reason: string | null
          last_requeued_at: string | null
          last_requeued_by: string | null
          lease_expires_at: string | null
          next_attempt_at: string | null
          operation_key: string
          order_db_id: number
          producer_contract: string
          provider_attempts: number
          provider_request: Json | null
          provider_request_hash: string | null
          provider_result: Json
          provider_started_at: string | null
          provider_started_token: string | null
          rate_id: string | null
          rate_request_id: string | null
          reconcile_not_found_count: number
          reconciliation_attempts: number
          shipstation_shipment_id: string | null
          source_invalidated_at: string | null
          source_invalidation_reason: string | null
          source_snapshot: Json
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "order_shipstation_sync_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_dashboard_user_sessions: {
        Args: { p_revoked_by?: string; p_user_id: string }
        Returns: {
          sessions_revoked: number
          setup_tokens_revoked: number
        }[]
      }
      save_rich_note_with_media: {
        Args: {
          p_actor_role: string
          p_actor_service: string
          p_actor_user_id: string
          p_customer_activity: Json
          p_customer_id: string
          p_customer_media_ids: string[]
          p_expected_customer_visible_note: string
          p_expected_internal_note: string
          p_has_customer_visible: boolean
          p_has_internal: boolean
          p_internal_activity: Json
          p_internal_media_ids: string[]
          p_next_customer_visible_note: string
          p_next_internal_note: string
          p_order_activity_customer_id: string
          p_order_db_id: number
          p_target_type: string
        }
        Returns: Json
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
      set_loyalty_account_segment: {
        Args: { p_program_segment: string; p_square_loyalty_account_id: string }
        Returns: {
          balance_points: number
          created_at: string
          customer_id: string | null
          enrolled_at: string | null
          expiring_point_deadlines: Json
          id: string
          last_square_event_at: string | null
          lifetime_points: number
          phone_number: string | null
          program_segment: string
          projection_state: string
          raw_account: Json
          rolling_12_month_points: number
          square_created_at: string | null
          square_customer_id: string | null
          square_loyalty_account_id: string
          square_program_id: string
          square_updated_at: string | null
          status_tier: string
          synced_at: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_loyalty_customer_portal_enabled: {
        Args: {
          p_confirmation: string
          p_enabled: boolean
          p_expected_version: number
        }
        Returns: Json
      }
      start_cart_checkout_provider: {
        Args: { p_cart_id: string; p_checkout_attempt_id: string }
        Returns: boolean
      }
      start_order_shipstation_provider_call: {
        Args: { p_claim_token: string; p_operation_id: string }
        Returns: {
          already_started: boolean
          external_shipment_id: string
          provider_attempt: number
          provider_request: Json
        }[]
      }
      update_pending_refund_request: {
        Args: {
          p_amount: number
          p_expected_request_hash: string
          p_reason: string
          p_refund_id: number
          p_request_hash: string
        }
        Returns: {
          amount: number
          attempted_at: string | null
          created_at: string
          error_message: string | null
          id: number
          idempotency_key: string
          initiated_by: string | null
          notification_policy: string
          order_db_id: number
          order_id: string
          processed_at: string | null
          reason: string | null
          request_hash: string
          request_key: string
          square_refund_id: string | null
          square_response: Json | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "refund_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_app_error_group: {
        Args: {
          p_fingerprint: string
          p_seen_at: string
          p_severity: string
          p_source_app: string
          p_title: string
        }
        Returns: string
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
