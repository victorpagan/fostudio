export type TierKey = 'creator' | 'pro' | 'studio_plus' | 'other'
export type AdPlatform = 'meta' | 'google' | 'other'

export type IngestSource = 'supabase' | 'unavailable'

export type SourceNotesMap = {
  memberships: string[]
  bookings: string[]
  revenue: string[]
  ads: string[]
}

export type DataAvailability = {
  memberships: IngestSource
  bookings: IngestSource
  revenue: IngestSource
  ads: IngestSource
  notes: SourceNotesMap
}

export type IngestManifest = {
  generated_at: string
  source: IngestSource
  notes: string[]
}

export type AccountClassification = {
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type DataQualityMetadata = {
  source_completeness: {
    memberships: number
    bookings: number
    revenue: number
    ads: number
  }
  row_counts: {
    memberships: number
    membership_state: number
    bookings: number
    revenue: number
    ads: number
  }
  exclusions_applied: {
    memberships: number
    membership_state: number
    bookings: number
    revenue: number
    ads: number
    accounts: number
  }
  warnings: string[]
  confidence: {
    score: number
    label: 'high' | 'medium' | 'low'
  }
}

export type RawMembershipRecord = {
  membership_id: string
  user_id: string
  customer_id: string | null
  account_email: string | null
  tier: string
  cadence: string | null
  status: string
  amount: number
  created_at: string
  canceled_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type RawBookingRecord = {
  booking_id: string
  customer_id: string
  user_id: string | null
  guest_email: string | null
  start_time: string
  end_time: string
  status: string
  hours: number
  revenue: number
  booking_type: 'member' | 'guest' | 'hourly' | 'other'
  channel: string
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type RawRevenueEventRecord = {
  date: string
  user_id: string | null
  customer_id: string | null
  account_email: string | null
  source: 'membership' | 'credit_topup' | 'hold_topup' | 'guest_booking' | 'other'
  amount: number
  order_id: string | null
  tier: string | null
  cadence: string | null
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type RawAdRecord = {
  date: string
  platform: AdPlatform
  campaign: string
  spend: number
  clicks: number
  impressions: number
  conversions: number
}

export type NormalizedDateDims = {
  date: string
  week: string
  month: string
}

export type NormalizedMembershipRecord = NormalizedDateDims & {
  customer_id: string
  user_id: string | null
  membership_id: string | null
  account_email: string | null
  tier: TierKey
  status: string
  amount: number
  is_new: boolean
  is_canceled: boolean
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type MembershipStateRecord = {
  membership_id: string
  user_id: string
  customer_id: string
  account_email: string | null
  tier: TierKey
  cadence: string | null
  status: string
  amount: number
  created_at: string
  canceled_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type NormalizedBookingRecord = NormalizedDateDims & {
  booking_id: string
  customer_id: string
  user_id: string | null
  guest_email: string | null
  hours: number
  revenue: number
  booking_type: string
  channel: string
  status: string
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type NormalizedRevenueEventRecord = NormalizedDateDims & {
  user_id: string | null
  customer_id: string | null
  account_email: string | null
  source: string
  amount: number
  order_id: string | null
  tier: TierKey | null
  cadence: string | null
  is_test_account: boolean
  is_internal_account: boolean
  exclude_from_kpis: boolean
  expires_at: string | null
}

export type NormalizedAdRecord = NormalizedDateDims & {
  platform: AdPlatform
  campaign: string
  spend: number
  clicks: number
  impressions: number
  conversions: number
}

export type WeeklyMetrics = {
  revenue_total: number | null
  revenue_wow_pct: number | null
  cash_received: number | null
  cash_received_wow_pct: number | null
  recognized_revenue_total: number | null
  recognized_revenue_wow_pct: number | null
  recognized_membership_revenue: number | null
  one_time_booking_revenue: number | null
  other_revenue: number | null
  bookings_total: number | null
  booked_hours: number | null
  utilization_rate: number | null
  active_members: number | null
  new_members: number | null
  canceled_members: number | null
  net_members: number | null
}

export type MemberUsageMetrics = {
  bookings_per_member_7d: number | null
  bookings_per_member_30d: number | null
  booked_hours_per_member_30d: number | null
  members_with_zero_bookings_14d: number | null
  members_with_zero_bookings_30d: number | null
  tier_usage_pct: {
    creator: number | null
    pro: number | null
    studio_plus: number | null
  }
}

export type BookingSegmentationBucket = {
  bookings: number | null
  booked_hours: number | null
  revenue: number | null
}

export type BookingSegmentation = {
  member: BookingSegmentationBucket
  non_member: BookingSegmentationBucket
}

export type CohortMetrics = {
  repeat_guests_not_converted: number | null
  converted_guest_members: number | null
  avg_guest_to_member_lag_days: number | null
  median_guest_to_member_lag_days: number | null
}

export type PlatformSummary = {
  spend: number | null
  conversions: number | null
  cost_per_conversion: number | null
}

export type MetricsOutput = {
  generated_at: string
  week_of: string
  data_availability: DataAvailability
  data_quality: DataQualityMetadata
  week: WeeklyMetrics
  member_usage: MemberUsageMetrics
  booking_segmentation: BookingSegmentation
  cohorts: CohortMetrics
  tiers: {
    creator: number | null
    pro: number | null
    studio_plus: number | null
  }
  ads: {
    google: PlatformSummary | null
    meta: PlatformSummary | null
  }
}

export type AlertsOutputItem = {
  severity: 'low' | 'medium' | 'high'
  type: 'ads' | 'retention' | 'bookings' | 'revenue' | 'memberships' | 'channel' | 'data'
  title: string
  detail: string
}

export type TrendsOutput = {
  generated_at: string
  week_of: string
  data_availability: DataAvailability
  data_quality: DataQualityMetadata
  revenue_by_week: Array<{ week: string, value: number }>
  cash_received_by_week: Array<{ week: string, value: number }>
  recognized_revenue_by_week: Array<{ week: string, value: number }>
  one_time_booking_revenue_by_week: Array<{ week: string, value: number }>
  members_by_week: Array<{ week: string, active: number, new_members: number, canceled_members: number }>
  utilization_by_week: Array<{ week: string, value: number, booked_hours: number }>
  booking_mix_by_week: Array<{
    week: string
    member_bookings: number
    non_member_bookings: number
    member_booked_hours: number
    non_member_booked_hours: number
    member_revenue: number
    non_member_revenue: number
  }>
  weekday_utilization: {
    lookback_weeks: number
    bookings_by_weekday: Array<{ weekday: string, value: number }>
    booked_hours_by_weekday: Array<{ weekday: string, value: number }>
    weakest_day: {
      weekday: string
      bookings: number
      booked_hours: number
    } | null
  }
  cohort_conversion: {
    repeat_guests_not_converted: number
    converted_guest_members: number
    avg_guest_to_member_lag_days: number | null
    median_guest_to_member_lag_days: number | null
    records: Array<{
      customer_id: string
      first_booking_date: string | null
      member_start_date: string | null
      guest_bookings: number
      converted: boolean
      conversion_lag_days: number | null
    }>
  }
}

export type WeeklyReportJson = {
  generated_at: string
  week_of: string
  data_availability: DataAvailability
  data_quality: DataQualityMetadata
  snapshot: {
    revenue: number | null
    revenue_wow_pct: number | null
    cash_received: number | null
    cash_received_wow_pct: number | null
    recognized_revenue: number | null
    recognized_revenue_wow_pct: number | null
    one_time_booking_revenue: number | null
    bookings: number | null
    booked_hours: number | null
    utilization_rate: number | null
    active_members: number | null
    new_members: number | null
    cancellations: number | null
  }
  member_usage: MemberUsageMetrics
  booking_segmentation: BookingSegmentation
  cohorts: CohortMetrics
  weekday_focus: {
    weakest_day: string | null
    weakest_day_bookings: number | null
    weakest_day_booked_hours: number | null
  }
  memberships: {
    creator: number | null
    pro: number | null
    studio_plus: number | null
    net_growth: number | null
  }
  marketing: {
    google_ads: PlatformSummary | null
    meta_ads: PlatformSummary | null
  }
  what_changed: string[]
  alerts: string[]
  recommended_next_actions: string[]
  email_recommendations: Array<{
    campaign_name: string
    objective: string
    audience: string
    subject_options: string[]
    key_points: string[]
    cta: string
    send_window: string
    note?: string
  }>
}
