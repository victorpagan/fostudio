export const analyticsAlertThresholds = {
  adPerformance: {
    cpaComparisonWindowDays: 14,
    highCpaMultiplier: 2.2,
    weakChannelMinConversions: 1,
    weakChannelMinSpend: 150
  },
  dataQuality: {
    noisyExclusionRatio: 0.2,
    minConfidenceForRevenueAlerts: 0.75,
    minConfidenceForHighSeverity: 0.8
  },
  retention: {
    lowUsageLookbackDays: 30,
    lowUsageThreshold: 0.25,
    lowUsageMinMembers: 3
  },
  memberActivity: {
    minActiveMembers: 4,
    zeroBooking14dWarnRatio: 0.35,
    zeroBooking30dWarnRatio: 0.22
  },
  utilization: {
    lowWeeklyUtilizationRatio: 0.2,
    wowDropPct: 0.2
  },
  bookings: {
    wowDropPct: 0.15,
    weakWeekdayName: 'Wednesday',
    weakWeekdayRatio: 0.55
  },
  memberships: {
    churnWarningCount: 3
  },
  revenue: {
    wowDropPct: 0.25,
    lumpyGapRatio: 0.35
  },
  ops: {
    highSeverityOpenIncidentWarnCount: 1,
    staleSubmittedExpenseDays: 7,
    staleApprovedExpenseDays: 5
  }
} as const

export type AnalyticsAlertThresholds = typeof analyticsAlertThresholds
