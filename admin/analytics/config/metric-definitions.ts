import type { TierKey } from '../scripts/lib/types'

export const analyticsMetricDefinitions = {
  timezone: 'America/Los_Angeles',
  weekStart: 'ISO_MONDAY',
  trendsLookbackWeeks: 12,
  weeklyCapacityHours: 168,
  defaultBookingChannel: 'website',
  tierLabels: {
    creator: 'Creator',
    pro: 'Pro',
    studio_plus: 'Studio+',
    other: 'Other'
  } satisfies Record<TierKey, string>,
  tierIncludedHoursPerMonth: {
    creator: 12,
    pro: 20,
    studio_plus: 32,
    other: 12
  } satisfies Record<TierKey, number>
} as const

export type AnalyticsMetricDefinitions = typeof analyticsMetricDefinitions
