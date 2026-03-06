export type MembershipPlanDetails = {
  title: string
  summary: string
  bestFor: string[]
  benefits: string[]
  includes: string[]
}

export function getMembershipPlanDetails(tierId: string, displayName?: string): MembershipPlanDetails {
  const normalized = (tierId || '').toLowerCase()

  if (normalized === 'creator') {
    return {
      title: displayName ?? 'Creator',
      summary: 'A practical starting point for shooters building consistency without overbuying.',
      bestFor: [
        'Weekend warriors and early-stage client work',
        'Test shoots, portfolio updates, and lower-frequency production',
        'Solo creators or very small teams'
      ],
      benefits: [
        'Lowest barrier to recurring studio access',
        'Clear credit model that still supports peak-hour bookings',
        'Upgrade path when production volume increases'
      ],
      includes: [
        'Full studio + lighting access',
        'Consumables like backdrop paper included',
        'Core booking controls and member support'
      ]
    }
  }

  if (normalized === 'pro') {
    return {
      title: displayName ?? 'Pro',
      summary: 'Built for working creatives with repeat client schedules and steadier monthly demand.',
      bestFor: [
        'Photographers with recurring paid sessions',
        'Teams that need better weekly booking consistency',
        'Growing production calendars with tighter turnaround'
      ],
      benefits: [
        'More monthly credit capacity for client-heavy periods',
        'Stronger planning flexibility during busy weeks',
        'Balanced cost for active but non-enterprise usage'
      ],
      includes: [
        'Everything in Creator',
        'Higher booking leverage for high-demand windows',
        'More room to manage regular production cycles'
      ]
    }
  }

  if (normalized === 'studio_plus') {
    return {
      title: displayName ?? 'Studio+',
      summary: 'Highest-capacity membership for production-heavy teams and priority scheduling needs.',
      bestFor: [
        'Small-to-medium crews running frequent client days',
        'Fashion, product, and campaign teams with larger setups',
        'Producers who need more confidence around peak-hour availability'
      ],
      benefits: [
        'Maximum monthly credit capacity and booking reach',
        'Best fit for sustained high-throughput studio use',
        'Most flexible option for complex production calendars'
      ],
      includes: [
        'Everything in lower tiers',
        'Highest scheduling flexibility by design',
        'Priority-friendly structure for demanding workflows'
      ]
    }
  }

  if (normalized === 'test') {
    return {
      title: displayName ?? 'Test',
      summary: 'Internal admin-only tier used to validate checkout and membership logic.',
      bestFor: [
        'Admin QA and checkout flow verification',
        'Non-production internal testing'
      ],
      benefits: [
        'No live billing required for tests',
        'Fast end-to-end activation checks'
      ],
      includes: [
        'Restricted visibility',
        'Operational testing controls'
      ]
    }
  }

  return {
    title: displayName ?? tierId,
    summary: 'Membership plan details.',
    bestFor: [],
    benefits: [],
    includes: []
  }
}
