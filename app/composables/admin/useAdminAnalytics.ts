export type AnalyticsSeverity = 'low' | 'medium' | 'high'

export type AnalyticsPayload = {
  metrics: {
    generated_at?: string
    week_of?: string
    week?: {
      revenue_total?: number
      revenue_wow_pct?: number
      bookings_total?: number
      booked_hours?: number
      utilization_rate?: number
      active_members?: number
      new_members?: number
      canceled_members?: number
      net_members?: number
    }
    tiers?: {
      creator?: number
      pro?: number
      studio_plus?: number
    }
    ads?: {
      google?: {
        spend?: number
        conversions?: number
        cost_per_conversion?: number
      }
      meta?: {
        spend?: number
        conversions?: number
        cost_per_conversion?: number
      }
    }
  } | null
  trends: {
    generated_at?: string
    week_of?: string
    revenue_by_week?: Array<{ week: string, value: number }>
    members_by_week?: Array<{ week: string, active: number, new_members?: number, canceled_members?: number }>
    utilization_by_week?: Array<{ week: string, value: number, booked_hours?: number }>
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

export function formatAnalyticsCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

export function formatAnalyticsNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function formatAnalyticsSignedPct(value: number) {
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`
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
