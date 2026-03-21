export type MailTemplateCategory = 'critical' | 'non_critical'
export type AvailableVariablesByEvent = Record<string, string[]>

export type RegisteredMailEvent = {
  eventType: string
  category: MailTemplateCategory
  description: string
}

const COMMON_VARIABLES = [
  'to',
  'userId',
  'eventType',
  'templateId'
]

const REGISTERED_MAIL_EVENTS: RegisteredMailEvent[] = [
  {
    eventType: 'membership.waitlistInvite',
    category: 'non_critical',
    description: 'Member invite to complete checkout from the waitlist.'
  },
  {
    eventType: 'membership.checkoutActivationPending',
    category: 'critical',
    description: 'Checkout paid, but activation requires follow-up action.'
  },
  {
    eventType: 'membership.started',
    category: 'critical',
    description: 'Membership started or returned to active.'
  },
  {
    eventType: 'membership.pastDue',
    category: 'critical',
    description: 'Membership payment moved to past due.'
  },
  {
    eventType: 'membership.ended',
    category: 'critical',
    description: 'Membership canceled or ended.'
  },
  {
    eventType: 'membership.renewed',
    category: 'critical',
    description: 'Membership invoice paid and cycle renewed.'
  },
  {
    eventType: 'credits.topupPurchased',
    category: 'critical',
    description: 'Credits top-off purchase completed.'
  },
  {
    eventType: 'holds.topupPurchased',
    category: 'critical',
    description: 'Equipment hold top-off purchase completed.'
  },
  {
    eventType: 'order.confirmation',
    category: 'critical',
    description: 'Order confirmation sent after checkout.'
  }
]

const EVENT_VARIABLES: AvailableVariablesByEvent = {
  'membership.waitlistInvite': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'checkoutUrl',
    'isPriorityMember'
  ],
  'membership.checkoutActivationPending': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'activationUrl',
    'checkoutToken',
    'planVariationId',
    'paymentLinkId'
  ],
  'membership.started': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'currentPeriodEnd',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.pastDue': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'currentPeriodEnd',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.ended': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'currentPeriodEnd',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.renewed': [
    'tierId',
    'tierName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'currentPeriodEnd',
    'invoiceId',
    'subscriptionId'
  ],
  'credits.topupPurchased': [
    'membershipId',
    'creditsAdded',
    'newBalance',
    'amountCents',
    'amountDollars',
    'optionLabel',
    'paymentId'
  ],
  'holds.topupPurchased': [
    'membershipId',
    'holdsAdded',
    'newHoldBalance',
    'amountCents',
    'amountDollars',
    'label',
    'paymentId'
  ],
  'order.confirmation': [
    'customerName',
    'customerEmail',
    'orderNumber',
    'orderDate',
    'phoneNumber',
    'logo',
    'website',
    'items',
    'total',
    'totalTax',
    'totalDiscount',
    'receipt'
  ]
}

export function getRegisteredMailEvents(): RegisteredMailEvent[] {
  return REGISTERED_MAIL_EVENTS
    .map(event => ({ ...event }))
    .sort((a, b) => a.eventType.localeCompare(b.eventType))
}

export function getAvailableVariablesByEvent(): AvailableVariablesByEvent {
  const merged: AvailableVariablesByEvent = {
    '*': [...COMMON_VARIABLES]
  }

  for (const [eventType, variables] of Object.entries(EVENT_VARIABLES)) {
    merged[eventType] = [...new Set(variables)]
  }

  return merged
}
