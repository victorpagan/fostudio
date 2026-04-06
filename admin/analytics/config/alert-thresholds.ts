export const analyticsAlertThresholds = {
  adPerformance: {
    cpaComparisonWindowDays: 14,
    highCpaMultiplier: 2.2,
    weakChannelMinConversions: 1,
    weakChannelMinSpend: 150
  },
  retention: {
    lowUsageLookbackDays: 30,
    lowUsageThreshold: 0.25,
    lowUsageMinMembers: 3
  },
  bookings: {
    wowDropPct: 0.15,
    weakWeekdayName: 'Wednesday',
    weakWeekdayRatio: 0.55
  },
  memberships: {
    churnWarningCount: 3
  }
} as const

export type AnalyticsAlertThresholds = typeof analyticsAlertThresholds
