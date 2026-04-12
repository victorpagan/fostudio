export type AnalyticsSeverity = 'low' | 'medium' | 'high'
export type AnalyticsSource = 'supabase' | 'unavailable'

type AvailabilityBlock = {
  memberships?: AnalyticsSource
  bookings?: AnalyticsSource
  revenue?: AnalyticsSource
  ops?: AnalyticsSource
  ads?: AnalyticsSource
  notes?: {
    memberships?: string[]
    bookings?: string[]
    revenue?: string[]
    ops?: string[]
    ads?: string[]
  }
}

export type AnalyticsPayload = {
  metrics: {
    generated_at?: string
    week_of?: string
    data_availability?: AvailabilityBlock
    week?: {
      revenue_total?: number | null
      revenue_wow_pct?: number | null
      bookings_total?: number | null
      booked_hours?: number | null
      utilization_rate?: number | null
      active_members?: number | null
      new_members?: number | null
      canceled_members?: number | null
      net_members?: number | null
    }
    ops?: {
      incidents_created_week?: number | null
      incidents_open_count?: number | null
      incidents_high_severity_open_count?: number | null
      incidents_resolved_week?: number | null
      expenses_submitted_count?: number | null
      expenses_approved_unpaid_count?: number | null
      expenses_submitted_total_week?: number | null
      expenses_approved_total_week?: number | null
      expenses_paid_total_week?: number | null
    }
    tiers?: {
      creator?: number | null
      pro?: number | null
      studio_plus?: number | null
    }
    ads?: {
      google?: {
        spend?: number | null
        conversions?: number | null
        cost_per_conversion?: number | null
      } | null
      meta?: {
        spend?: number | null
        conversions?: number | null
        cost_per_conversion?: number | null
      } | null
    }
  } | null
  trends: {
    generated_at?: string
    week_of?: string
    data_availability?: AvailabilityBlock
    revenue_by_week?: Array<{ week: string, value: number }>
    members_by_week?: Array<{ week: string, active: number, new_members?: number, canceled_members?: number }>
    utilization_by_week?: Array<{ week: string, value: number, booked_hours?: number }>
    incidents_created_by_week?: Array<{ week: string, value: number }>
    incidents_open_by_week?: Array<{ week: string, value: number }>
    expenses_submitted_by_week?: Array<{ week: string, value: number, amount?: number }>
    expenses_paid_by_week?: Array<{ week: string, value: number, amount?: number }>
  } | null
  alerts: Array<{
    severity: AnalyticsSeverity
    type: string
    title: string
    detail: string
  }>
  weeklyReportMd: string | null
  weeklyReportJson: {
    generated_at?: string
    week_of?: string
    data_availability?: AvailabilityBlock
    recommended_next_actions?: string[]
    email_recommendations?: Array<{
      campaign_name?: string
      objective?: string
      audience?: string
      cta?: string
      send_window?: string
      subject_options?: string[]
    }>
  } | null
  generatedAt: string | null
  freshness: 'fresh' | 'stale' | 'missing'
  missingFiles: string[]
  storage?: 'supabase' | 'filesystem'
  source?: string | null
}

export async function useAdminAnalyticsData(keySuffix = 'default') {
  const { data, pending, refresh, error, status } = await useAsyncData<AnalyticsPayload>(
    `admin:analytics:payload:${keySuffix}`,
    async () => await $fetch('/api/admin/analytics')
  )

  onMounted(() => {
    void refresh()
  })

  return { data, pending, refresh, error, status }
}

function isNumeric(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function formatAnalyticsCurrency(value: number | null | undefined) {
  if (!isNumeric(value)) return 'Data unavailable'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

export function formatAnalyticsNumber(value: number | null | undefined) {
  if (!isNumeric(value)) return 'Data unavailable'
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function formatAnalyticsSignedPct(value: number | null | undefined) {
  if (!isNumeric(value)) return 'Data unavailable'
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`
}

export function formatAnalyticsHours(value: number | null | undefined, digits = 1) {
  if (!isNumeric(value)) return 'Data unavailable'
  return value.toFixed(digits)
}

export function formatAnalyticsRatioPct(value: number | null | undefined, digits = 1) {
  if (!isNumeric(value)) return 'Data unavailable'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatAnalyticsDatetime(value: string | null | undefined) {
  if (!value) return 'No analytics outputs generated yet.'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('en-US')
}

export async function copyAnalyticsText(value: string) {
  const text = String(value ?? '').trim()
  if (!text) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  }

  return false
}
