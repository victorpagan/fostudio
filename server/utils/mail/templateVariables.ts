export type MailTemplateCategory = 'critical' | 'non_critical'
export type AvailableVariablesByEvent = Record<string, string[]>

export type RegisteredMailEvent = {
  eventType: string
  category: MailTemplateCategory
  description: string
}

export type MailTemplateDefaultCopy = {
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
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
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'checkoutUrl',
    'isPriorityMember'
  ],
  'membership.checkoutActivationPending': [
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'activationUrl',
    'checkoutToken',
    'planVariationId',
    'paymentLinkId'
  ],
  'membership.started': [
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'startPeriodHuman',
    'currentPeriodEnd',
    'endPeriodHuman',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.pastDue': [
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'startPeriodHuman',
    'currentPeriodEnd',
    'endPeriodHuman',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.ended': [
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'startPeriodHuman',
    'currentPeriodEnd',
    'endPeriodHuman',
    'subscriptionId',
    'squareStatus'
  ],
  'membership.renewed': [
    'customerName',
    'customerEmail',
    'doorCode',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodStart',
    'startPeriodHuman',
    'currentPeriodEnd',
    'endPeriodHuman',
    'invoiceId',
    'subscriptionId'
  ],
  'credits.topupPurchased': [
    'customerName',
    'customerEmail',
    'membershipId',
    'creditsAdded',
    'newBalance',
    'amountCents',
    'amountDollars',
    'optionLabel',
    'paymentId'
  ],
  'holds.topupPurchased': [
    'customerName',
    'customerEmail',
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

const EVENT_DEFAULT_COPY: Record<string, MailTemplateDefaultCopy> = {
  'membership.started': {
    subjectTemplate: 'FO Studio: Your {{ membershipPlanName }} membership is active',
    preheaderTemplate: 'Your door code, membership period, waiver link, and booking link are inside.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Welcome to FO Studio {{ customerName }}!</h1>
<p style="margin:0 0 16px;">Your membership is active and you are ready to book. Here are the essentials to get started right away.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 18px;">
<p style="margin:0 0 8px;"><strong>Membership:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>
<p style="margin:0;"><strong>Door Code:</strong> <span style="font-size:18px;letter-spacing:1px;">{{ doorCode }}</span></p>
</div>
<h2 style="font-size:18px;margin:0 0 10px;">Next steps</h2>
<ol style="margin:0 0 18px 20px;padding:0;">
<li style="margin:0 0 8px;">Sign your waiver before your first session: <a href="https://fo.studio/dashboard/waiver">Complete waiver</a></li>
<li style="margin:0 0 8px;">Book your first studio time: <a href="https://fo.studio/dashboard/book">Book now</a></li>
<li style="margin:0;">Save your door code somewhere secure for day-of access.</li>
</ol>
<p style="margin:0;">Need help? Reply to this email or contact <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
</div>`
  }
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

export function getDefaultTemplateCopyForEvent(eventType: string): MailTemplateDefaultCopy | null {
  const key = String(eventType ?? '').trim()
  if (!key) return null
  const copy = EVENT_DEFAULT_COPY[key]
  if (!copy) return null
  return { ...copy }
}
