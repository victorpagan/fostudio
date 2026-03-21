export type AvailableVariablesByEvent = Record<string, string[]>

const COMMON_VARIABLES = [
  'to',
  'userId',
  'eventType',
  'templateId'
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

export function getAvailableVariablesByEvent(): AvailableVariablesByEvent {
  const merged: AvailableVariablesByEvent = {
    '*': [...COMMON_VARIABLES]
  }

  for (const [eventType, variables] of Object.entries(EVENT_VARIABLES)) {
    merged[eventType] = [...new Set(variables)]
  }

  return merged
}
