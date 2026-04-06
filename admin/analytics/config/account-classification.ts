export const analyticsAccountClassification = {
  // Domains treated as internal/staff traffic by default.
  internalEmailDomains: ['fo.studio'],
  // Domains commonly used for test accounts.
  testEmailDomains: ['example.com', 'mailinator.com', 'test.com'],
  // Additional local-part markers for QA/demo account emails.
  testEmailMarkers: ['+test', '+qa', 'sandbox', 'demo'],
  internalEmailPrefixes: ['admin@', 'team@', 'ops@'],
  excludeInternalByDefault: true,
  excludeTestByDefault: true
} as const

export type AnalyticsAccountClassification = typeof analyticsAccountClassification
