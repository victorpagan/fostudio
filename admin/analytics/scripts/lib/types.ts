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

export type RawMembershipRecord = {
  membership_id: string
  user_id: string
  customer_id: string | null
  tier: string
  cadence: string | null
  status: string
  amount: number
  created_at: string
  canceled_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
}

export type RawBookingRecord = {
  booking_id: string
  customer_id: string
  user_id: string | null
  start_time: string
  end_time: string
  status: string
  hours: number
  revenue: number
  booking_type: 'member' | 'guest' | 'hourly' | 'other'
  channel: string
}

export type RawRevenueEventRecord = {
  date: string
  user_id: string | null
  customer_id: string | null
  source: 'membership' | 'credit_topup' | 'hold_topup' | 'guest_booking' | 'other'
  amount: number
  order_id: string | null
  tier: string | null
  cadence: string | null
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
  tier: TierKey
  status: string
  amount: number
  is_new: boolean
  is_canceled: boolean
}

export type MembershipStateRecord = {
  membership_id: string
  user_id: string
  customer_id: string
  tier: TierKey
  cadence: string | null
  status: string
  amount: number
  created_at: string
  canceled_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
}

export type NormalizedBookingRecord = NormalizedDateDims & {
  booking_id: string
  customer_id: string
  user_id: string | null
  hours: number
  revenue: number
  booking_type: string
  channel: string
  status: string
}

export type NormalizedRevenueEventRecord = NormalizedDateDims & {
  user_id: string | null
  customer_id: string | null
  source: string
  amount: number
  order_id: string | null
  tier: TierKey | null
  cadence: string | null
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
  bookings_total: number | null
  booked_hours: number | null
  utilization_rate: number | null
  active_members: number | null
  new_members: number | null
  canceled_members: number | null
  net_members: number | null
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
  week: WeeklyMetrics
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
  revenue_by_week: Array<{ week: string, value: number }>
  members_by_week: Array<{ week: string, active: number, new_members: number, canceled_members: number }>
  utilization_by_week: Array<{ week: string, value: number, booked_hours: number }>
}

export type WeeklyReportJson = {
  generated_at: string
  week_of: string
  data_availability: DataAvailability
  snapshot: {
    revenue: number | null
    revenue_wow_pct: number | null
    bookings: number | null
    booked_hours: number | null
    utilization_rate: number | null
    active_members: number | null
    new_members: number | null
    cancellations: number | null
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
