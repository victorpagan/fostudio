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
    eventType: 'membership.doorCodeUpdated',
    category: 'critical',
    description: 'Member door code was assigned or updated.'
  },
  {
    eventType: 'booking.guestConfirmed',
    category: 'critical',
    description: 'Guest booking confirmation with access details.'
  },
  {
    eventType: 'contact.formSubmitted',
    category: 'critical',
    description: 'Contact form submission delivered to studio admins.'
  },
  {
    eventType: 'mailing.memberBroadcast',
    category: 'non_critical',
    description: 'Manual member broadcast list email sent by admin.'
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
  'membership.doorCodeUpdated': [
    'customerName',
    'customerEmail',
    'doorCode',
    'doorCodeUpdatedAt',
    'tierId',
    'tierName',
    'membershipPlanName'
  ],
  'booking.guestConfirmed': [
    'guestName',
    'guestEmail',
    'bookingId',
    'bookingStart',
    'bookingEnd',
    'accessCode',
    'calendarUrl',
    'manageUrl',
    'studioAddress'
  ],
  'contact.formSubmitted': [
    'submittedAt',
    'source',
    'replyTo',
    'contactName',
    'contactEmail',
    'contactPhone',
    'contactSubject',
    'contactMessage'
  ],
  'mailing.memberBroadcast': [
    'customerName',
    'customerEmail',
    'membershipPlanName',
    'cadenceLabel',
    'startPeriodHuman',
    'endPeriodHuman',
    'doorCode',
    'bookUrl',
    'membershipUrl',
    'waiverUrl',
    'calendarUrl',
    'manageUrl',
    'studioAddress'
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
  'membership.waitlistInvite': {
    subjectTemplate: 'Your membership spot is available',
    preheaderTemplate: 'Complete checkout to claim your spot at FO Studio.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Membership spot available</h1>
<p style="margin:0 0 14px;">A spot has opened for your requested membership.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Plan:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Cadence:</strong> {{ cadenceLabel }}</p>
<p style="margin:0;"><strong>Priority waitlist:</strong> {{ isPriorityMember }}</p>
</div>
<p style="margin:0 0 14px;">Complete checkout to secure your spot:</p>
<p style="margin:0 0 16px;"><a href="{{ checkoutUrl }}">Complete membership checkout</a></p>
<p style="margin:0;">Questions? Contact <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
</div>`
  },
  'membership.checkoutActivationPending': {
    subjectTemplate: 'Complete your membership activation',
    preheaderTemplate: 'Payment was received. Finish activation to start booking.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Finish membership activation</h1>
<p style="margin:0 0 14px;">Your payment is complete. Activation is the last step before booking access.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Plan:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Cadence:</strong> {{ cadenceLabel }}</p>
<p style="margin:0;"><strong>Checkout token:</strong> {{ checkoutToken }}</p>
</div>
<p style="margin:0 0 14px;"><a href="{{ activationUrl }}">Activate membership now</a></p>
<p style="margin:0;">If you need help, email <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
</div>`
  },
  'membership.started': {
    subjectTemplate: 'Your {{ membershipPlanName }} membership is active',
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
  },
  'membership.pastDue': {
    subjectTemplate: 'Action needed: membership payment issue',
    preheaderTemplate: 'Your membership is past due. Update payment to keep access active.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Membership payment issue</h1>
<p style="margin:0 0 14px;">We could not process your latest membership payment.</p>
<div style="background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Plan:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>
<p style="margin:0;"><strong>Status:</strong> {{ squareStatus }}</p>
</div>
<p style="margin:0 0 14px;">Update billing in your dashboard to restore active status and uninterrupted access.</p>
<p style="margin:0;"><a href="https://fo.studio/dashboard/membership">Manage membership billing</a></p>
</div>`
  },
  'membership.ended': {
    subjectTemplate: 'Your membership has ended',
    preheaderTemplate: 'Your membership period has ended. Reactivate anytime.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Membership ended</h1>
<p style="margin:0 0 14px;">Your membership is no longer active.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Plan:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Last period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>
<p style="margin:0;"><strong>Status:</strong> {{ squareStatus }}</p>
</div>
<p style="margin:0 0 14px;">You can reactivate whenever you are ready.</p>
<p style="margin:0;"><a href="https://fo.studio/memberships">View memberships</a></p>
</div>`
  },
  'membership.renewed': {
    subjectTemplate: 'Your membership renewed successfully',
    preheaderTemplate: 'A new billing period has started for your membership.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Membership renewed</h1>
<p style="margin:0 0 14px;">Your renewal payment went through and your membership remains active.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Plan:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>New period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>
<p style="margin:0;"><strong>Invoice:</strong> {{ invoiceId }}</p>
</div>
<p style="margin:0 0 14px;">Door code reminder: <strong>{{ doorCode }}</strong></p>
<p style="margin:0;"><a href="https://fo.studio/dashboard/book">Book studio time</a></p>
</div>`
  },
  'credits.topupPurchased': {
    subjectTemplate: 'Credit top-up confirmed',
    preheaderTemplate: '{{ creditsAdded }} credits added. New balance: {{ newBalance }}.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Credit top-up complete</h1>
<p style="margin:0 0 14px;">Your account has been updated with additional booking credits.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Credits added:</strong> {{ creditsAdded }}</p>
<p style="margin:0 0 8px;"><strong>New balance:</strong> {{ newBalance }}</p>
<p style="margin:0;"><strong>Amount:</strong> &#36;{{ amountDollars }}</p>
</div>
<p style="margin:0 0 14px;">Payment reference: {{ paymentId }}</p>
<p style="margin:0;"><a href="https://fo.studio/dashboard/book">Use credits to book studio time</a></p>
</div>`
  },
  'holds.topupPurchased': {
    subjectTemplate: 'Equipment hold top-up confirmed',
    preheaderTemplate: '{{ holdsAdded }} hold credits added. New hold balance: {{ newHoldBalance }}.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Equipment hold top-up complete</h1>
<p style="margin:0 0 14px;">Your account now has additional hold credits.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Holds added:</strong> {{ holdsAdded }}</p>
<p style="margin:0 0 8px;"><strong>New hold balance:</strong> {{ newHoldBalance }}</p>
<p style="margin:0;"><strong>Amount:</strong> &#36;{{ amountDollars }}</p>
</div>
<p style="margin:0 0 14px;">Payment reference: {{ paymentId }}</p>
<p style="margin:0;"><a href="https://fo.studio/dashboard/bookings">Manage your bookings and holds</a></p>
</div>`
  },
  'membership.doorCodeUpdated': {
    subjectTemplate: 'Your studio door code was updated',
    preheaderTemplate: 'Save your updated code before your next session.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Door code updated</h1>
<p style="margin:0 0 14px;">Your studio door code has been updated.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>New code:</strong> <span style="font-size:18px;letter-spacing:1px;">{{ doorCode }}</span></p>
<p style="margin:0 0 8px;"><strong>Updated:</strong> {{ doorCodeUpdatedAt }}</p>
<p style="margin:0;"><strong>Membership:</strong> {{ membershipPlanName }}</p>
</div>
<p style="margin:0;">Keep this code private. If this change looks unexpected, contact <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
</div>`
  },
  'booking.guestConfirmed': {
    subjectTemplate: 'Guest booking confirmed',
    preheaderTemplate: 'Your booking is confirmed with access details included.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Guest booking confirmed</h1>
<p style="margin:0 0 14px;">Your booking is confirmed. Access details are below.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Booking ID:</strong> {{ bookingId }}</p>
<p style="margin:0 0 8px;"><strong>Start:</strong> {{ bookingStart }}</p>
<p style="margin:0 0 8px;"><strong>End:</strong> {{ bookingEnd }}</p>
<p style="margin:0;"><strong>Guest access code:</strong> <span style="font-size:18px;letter-spacing:1px;">{{ accessCode }}</span></p>
</div>
<p style="margin:0 0 8px;"><a href="{{ calendarUrl }}">Add to calendar</a></p>
<p style="margin:0 0 8px;"><a href="{{ manageUrl }}">View booking details</a></p>
<p style="margin:0;"><strong>Studio address:</strong> {{ studioAddress }}</p>
</div>`
  },
  'contact.formSubmitted': {
    subjectTemplate: 'Contact form: {{ contactSubject }}',
    preheaderTemplate: 'New contact request from {{ contactName }}.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">New contact request</h1>
<p style="margin:0 0 14px;">A new website contact form submission was received.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Submitted:</strong> {{ submittedAt }}</p>
<p style="margin:0 0 8px;"><strong>Name:</strong> {{ contactName }}</p>
<p style="margin:0 0 8px;"><strong>Email:</strong> {{ contactEmail }}</p>
<p style="margin:0 0 8px;"><strong>Phone:</strong> {{ contactPhone }}</p>
<p style="margin:0;"><strong>Subject:</strong> {{ contactSubject }}</p>
</div>
<p style="margin:0 0 8px;"><strong>Message:</strong></p>
<div style="white-space:pre-wrap;background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin:0 0 16px;">
{{ contactMessage }}
</div>
<p style="margin:0;">Reply to: <a href="mailto:{{ replyTo }}">{{ replyTo }}</a></p>
</div>`
  },
  'mailing.memberBroadcast': {
    subjectTemplate: 'Studio update for {{ customerName }}',
    preheaderTemplate: 'Important FO Studio updates and next steps.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">FO Studio update</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, here is the latest from the studio.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Membership:</strong> {{ membershipPlanName }}</p>
<p style="margin:0 0 8px;"><strong>Current period:</strong> {{ startPeriodHuman }} to {{ endPeriodHuman }}</p>
<p style="margin:0;"><strong>Door code on file:</strong> {{ doorCode }}</p>
</div>
<h2 style="font-size:18px;margin:0 0 10px;">Quick links</h2>
<ul style="margin:0 0 16px 20px;padding:0;">
<li style="margin:0 0 8px;"><a href="{{ bookUrl }}">Book studio time</a></li>
<li style="margin:0 0 8px;"><a href="{{ membershipUrl }}">Manage membership</a></li>
<li style="margin:0;"><a href="{{ waiverUrl }}">Review waiver</a></li>
</ul>
<p style="margin:0;">Questions? Reply to this email or contact <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
</div>`
  },
  'order.confirmation': {
    subjectTemplate: 'Order confirmation #{{ orderNumber }}',
    preheaderTemplate: 'We received your order and it is being processed.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Order received</h1>
<p style="margin:0 0 14px;">Thanks for your order. We have received it and started processing.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Order number:</strong> {{ orderNumber }}</p>
<p style="margin:0 0 8px;"><strong>Order date:</strong> {{ orderDate }}</p>
<p style="margin:0 0 8px;"><strong>Total:</strong> {{ total }}</p>
<p style="margin:0;"><strong>Tax:</strong> {{ totalTax }}</p>
</div>
<p style="margin:0;">Questions? Contact <a href="mailto:hello@lafilmlab.com">hello@lafilmlab.com</a>.</p>
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
