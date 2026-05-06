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
    eventType: 'account.signup',
    category: 'critical',
    description: 'New account created through public signup.'
  },
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
    eventType: 'booking.memberCreated',
    category: 'critical',
    description: 'Member booking confirmation after a session is created.'
  },
  {
    eventType: 'booking.memberRescheduled',
    category: 'critical',
    description: 'Member booking schedule updated (reschedule/extension).'
  },
  {
    eventType: 'booking.memberCanceled',
    category: 'critical',
    description: 'Member booking canceled with refund details when applicable.'
  },
  {
    eventType: 'booking.upcomingReminder',
    category: 'non_critical',
    description: 'Reminder before an upcoming booking.'
  },
  {
    eventType: 'credits.expiringReminder',
    category: 'non_critical',
    description: 'Reminder before active credits expire.'
  },
  {
    eventType: 'membership.cancellationEndingReminder',
    category: 'non_critical',
    description: 'Reminder before a scheduled membership cancellation reaches period end.'
  },
  {
    eventType: 'membership.pastDueReminder',
    category: 'non_critical',
    description: 'Follow-up reminder for a past-due membership.'
  },
  {
    eventType: 'account.guestOnboardingReminder',
    category: 'non_critical',
    description: 'New guest account onboarding reminder.'
  },
  {
    eventType: 'account.inactiveReminder',
    category: 'non_critical',
    description: 'Inactive account reminder.'
  },
  {
    eventType: 'booking.reactivationReminder',
    category: 'non_critical',
    description: 'Reactivation reminder after a user has not booked recently.'
  },
  {
    eventType: 'waiver.expiringReminder',
    category: 'non_critical',
    description: 'Reminder before a signed waiver expires.'
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
  }
]

const EVENT_VARIABLES: AvailableVariablesByEvent = {
  'account.signup': [
    'customerName',
    'customerEmail',
    'firstName',
    'lastName',
    'phone',
    'loginUrl',
    'onboardingUrl',
    'dashboardUrl',
    'bookUrl',
    'returnTo',
    'accountCreatedAt'
  ],
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
  'booking.memberCreated': [
    'customerName',
    'customerEmail',
    'bookingId',
    'bookingStart',
    'bookingEnd',
    'bookingStartHuman',
    'bookingEndHuman',
    'creditsBurned',
    'holdRequested',
    'holdCreated',
    'holdStatus',
    'actionedBy',
    'calendarUrl',
    'manageUrl',
    'studioAddress'
  ],
  'booking.memberRescheduled': [
    'customerName',
    'customerEmail',
    'bookingId',
    'bookingStart',
    'bookingEnd',
    'bookingStartHuman',
    'bookingEndHuman',
    'previousBookingStart',
    'previousBookingEnd',
    'previousBookingStartHuman',
    'previousBookingEndHuman',
    'creditsBurned',
    'creditsDelta',
    'holdCreated',
    'holdKept',
    'holdRemoved',
    'holdStatus',
    'actionedBy',
    'calendarUrl',
    'manageUrl',
    'studioAddress'
  ],
  'booking.memberCanceled': [
    'customerName',
    'customerEmail',
    'bookingId',
    'bookingStart',
    'bookingEnd',
    'bookingStartHuman',
    'bookingEndHuman',
    'creditsBurned',
    'creditsRefunded',
    'holdRemoved',
    'holdStatus',
    'actionedBy',
    'calendarUrl',
    'manageUrl',
    'studioAddress'
  ],
  'booking.upcomingReminder': [
    'customerName',
    'customerEmail',
    'bookingId',
    'bookingStart',
    'bookingEnd',
    'bookingStartHuman',
    'bookingEndHuman',
    'hoursUntilBooking',
    'reminderLabel',
    'manageUrl',
    'calendarUrl',
    'studioAddress'
  ],
  'credits.expiringReminder': [
    'customerName',
    'customerEmail',
    'creditsExpiring',
    'creditsExpireAt',
    'creditsExpireAtHuman',
    'daysUntilExpiry',
    'reminderLabel',
    'creditsUrl',
    'bookUrl'
  ],
  'membership.cancellationEndingReminder': [
    'customerName',
    'customerEmail',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodEnd',
    'endPeriodHuman',
    'daysUntilEnd',
    'reminderLabel',
    'membershipUrl'
  ],
  'membership.pastDueReminder': [
    'customerName',
    'customerEmail',
    'tierId',
    'tierName',
    'membershipPlanName',
    'cadence',
    'cadenceLabel',
    'currentPeriodEnd',
    'endPeriodHuman',
    'daysPastDue',
    'reminderLabel',
    'membershipUrl'
  ],
  'account.guestOnboardingReminder': [
    'customerName',
    'customerEmail',
    'daysSinceSignup',
    'reminderLabel',
    'dashboardUrl',
    'bookUrl',
    'creditsUrl',
    'membershipUrl'
  ],
  'account.inactiveReminder': [
    'customerName',
    'customerEmail',
    'daysSinceSignup',
    'reminderLabel',
    'dashboardUrl',
    'bookUrl',
    'membershipUrl'
  ],
  'booking.reactivationReminder': [
    'customerName',
    'customerEmail',
    'lastBookingStart',
    'lastBookingStartHuman',
    'daysSinceLastBooking',
    'reminderLabel',
    'bookUrl',
    'calendarUrl'
  ],
  'waiver.expiringReminder': [
    'customerName',
    'customerEmail',
    'waiverExpiresAt',
    'waiverExpiresAtHuman',
    'daysUntilExpiry',
    'reminderLabel',
    'waiverUrl'
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
  ]
}

const EVENT_DEFAULT_COPY: Record<string, MailTemplateDefaultCopy> = {
  'account.signup': {
    subjectTemplate: 'Welcome to FO Studio',
    preheaderTemplate: 'Your FO Studio account is ready. Finish onboarding to start booking.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Welcome to FO Studio</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your account is ready.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Email:</strong> {{ customerEmail }}</p>
<p style="margin:0;"><strong>Phone:</strong> {{ phone }}</p>
</div>
<p style="margin:0 0 14px;">Next, complete onboarding so you can book studio time.</p>
<p style="margin:0 0 16px;"><a href="{{ onboardingUrl }}">Continue onboarding</a></p>
<p style="margin:0;">Already finished onboarding? <a href="{{ dashboardUrl }}">Open your dashboard</a>.</p>
</div>`
  },
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
  'booking.memberCreated': {
    subjectTemplate: 'Booking confirmed: {{ bookingStartHuman }}',
    preheaderTemplate: 'Your FO Studio session is confirmed.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Booking confirmed</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your booking is confirmed.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Booking ID:</strong> {{ bookingId }}</p>
<p style="margin:0 0 8px;"><strong>Start:</strong> {{ bookingStartHuman }}</p>
<p style="margin:0 0 8px;"><strong>End:</strong> {{ bookingEndHuman }}</p>
<p style="margin:0 0 8px;"><strong>Credits used:</strong> {{ creditsBurned }}</p>
<p style="margin:0;"><strong>Hold status:</strong> {{ holdStatus }}</p>
</div>
<p style="margin:0 0 8px;"><a href="{{ manageUrl }}">Manage booking</a></p>
<p style="margin:0 0 8px;"><a href="{{ calendarUrl }}">View calendar</a></p>
<p style="margin:0;"><strong>Studio address:</strong> {{ studioAddress }}</p>
</div>`
  },
  'booking.memberRescheduled': {
    subjectTemplate: 'Booking updated: {{ bookingStartHuman }}',
    preheaderTemplate: 'Your FO Studio booking schedule has been updated.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Booking updated</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your booking was updated by {{ actionedBy }}.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Booking ID:</strong> {{ bookingId }}</p>
<p style="margin:0 0 8px;"><strong>Previous:</strong> {{ previousBookingStartHuman }} → {{ previousBookingEndHuman }}</p>
<p style="margin:0 0 8px;"><strong>Updated:</strong> {{ bookingStartHuman }} → {{ bookingEndHuman }}</p>
<p style="margin:0 0 8px;"><strong>Credits now burned:</strong> {{ creditsBurned }}</p>
<p style="margin:0 0 8px;"><strong>Credit delta:</strong> {{ creditsDelta }}</p>
<p style="margin:0;"><strong>Hold status:</strong> {{ holdStatus }}</p>
</div>
<p style="margin:0 0 8px;"><a href="{{ manageUrl }}">Manage booking</a></p>
<p style="margin:0 0 8px;"><a href="{{ calendarUrl }}">View calendar</a></p>
<p style="margin:0;"><strong>Studio address:</strong> {{ studioAddress }}</p>
</div>`
  },
  'booking.memberCanceled': {
    subjectTemplate: 'Booking canceled: {{ bookingStartHuman }}',
    preheaderTemplate: 'Your FO Studio booking has been canceled.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Booking canceled</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, this booking was canceled by {{ actionedBy }}.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Booking ID:</strong> {{ bookingId }}</p>
<p style="margin:0 0 8px;"><strong>Original time:</strong> {{ bookingStartHuman }} → {{ bookingEndHuman }}</p>
<p style="margin:0 0 8px;"><strong>Credits originally burned:</strong> {{ creditsBurned }}</p>
<p style="margin:0 0 8px;"><strong>Credits refunded:</strong> {{ creditsRefunded }}</p>
<p style="margin:0;"><strong>Hold status:</strong> {{ holdStatus }}</p>
</div>
<p style="margin:0 0 8px;"><a href="{{ manageUrl }}">View bookings</a></p>
<p style="margin:0 0 8px;"><a href="{{ calendarUrl }}">View calendar</a></p>
<p style="margin:0;"><strong>Studio address:</strong> {{ studioAddress }}</p>
</div>`
  },
  'booking.upcomingReminder': {
    subjectTemplate: 'Reminder: your FO Studio booking is {{ reminderLabel }}',
    preheaderTemplate: 'Your session starts {{ bookingStartHuman }}.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Booking reminder</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, this is a reminder that your FO Studio booking is {{ reminderLabel }}.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Start:</strong> {{ bookingStartHuman }}</p>
<p style="margin:0 0 8px;"><strong>End:</strong> {{ bookingEndHuman }}</p>
<p style="margin:0;"><strong>Address:</strong> {{ studioAddress }}</p>
</div>
<p style="margin:0 0 8px;"><a href="{{ manageUrl }}">View booking</a></p>
<p style="margin:0;"><a href="{{ calendarUrl }}">Open studio calendar</a></p>
</div>`
  },
  'credits.expiringReminder': {
    subjectTemplate: '{{ creditsExpiring }} FO Studio credits expire {{ creditsExpireAtHuman }}',
    preheaderTemplate: 'Use your credits before they expire.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Credits expiring soon</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, you have {{ creditsExpiring }} credits expiring {{ creditsExpireAtHuman }}.</p>
<div style="background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Credits expiring:</strong> {{ creditsExpiring }}</p>
<p style="margin:0;"><strong>Expires:</strong> {{ creditsExpireAtHuman }}</p>
</div>
<p style="margin:0 0 8px;"><a href="{{ bookUrl }}">Book studio time</a></p>
<p style="margin:0;"><a href="{{ creditsUrl }}">View credits</a></p>
</div>`
  },
  'membership.cancellationEndingReminder': {
    subjectTemplate: 'Your FO Studio membership ends {{ endPeriodHuman }}',
    preheaderTemplate: 'Your scheduled cancellation is coming up.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Membership ending soon</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your {{ membershipPlanName }} membership is scheduled to end {{ endPeriodHuman }}.</p>
<div style="background:#f6f6f6;border:1px solid #e5e5e5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Membership:</strong> {{ membershipPlanName }}</p>
<p style="margin:0;"><strong>End date:</strong> {{ endPeriodHuman }}</p>
</div>
<p style="margin:0;">You can manage your membership from <a href="{{ membershipUrl }}">your dashboard</a>.</p>
</div>`
  },
  'membership.pastDueReminder': {
    subjectTemplate: 'Reminder: membership payment still needs attention',
    preheaderTemplate: 'Update billing to keep your FO Studio membership active.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Payment reminder</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your {{ membershipPlanName }} membership is still marked past due.</p>
<div style="background:#fff8f2;border:1px solid #ffd8b0;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
<p style="margin:0 0 8px;"><strong>Membership:</strong> {{ membershipPlanName }}</p>
<p style="margin:0;"><strong>Current period ends:</strong> {{ endPeriodHuman }}</p>
</div>
<p style="margin:0;">Please <a href="{{ membershipUrl }}">manage membership billing</a> to keep access active.</p>
</div>`
  },
  'account.guestOnboardingReminder': {
    subjectTemplate: 'Ready to book FO Studio?',
    preheaderTemplate: 'Your guest account is ready. Add credits or compare memberships.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Ready when you are</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your FO Studio guest account is ready.</p>
<p style="margin:0 0 14px;">Guests can book with premium credits during guest booking hours. If you plan to book often, memberships include lower effective credit costs and longer booking windows.</p>
<p style="margin:0 0 8px;"><a href="{{ creditsUrl }}">Buy guest credits</a></p>
<p style="margin:0 0 8px;"><a href="{{ bookUrl }}">View booking calendar</a></p>
<p style="margin:0;"><a href="{{ membershipUrl }}">Compare memberships</a></p>
</div>`
  },
  'account.inactiveReminder': {
    subjectTemplate: 'Still interested in FO Studio?',
    preheaderTemplate: 'Book as a guest or compare membership options.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Still interested?</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your FO Studio account is still available when you are ready.</p>
<p style="margin:0 0 14px;">You can book as a guest with premium credits or choose a membership for lower credit costs and member benefits.</p>
<p style="margin:0 0 8px;"><a href="{{ bookUrl }}">View booking calendar</a></p>
<p style="margin:0;"><a href="{{ membershipUrl }}">Compare memberships</a></p>
</div>`
  },
  'booking.reactivationReminder': {
    subjectTemplate: 'It has been a while since your last FO Studio booking',
    preheaderTemplate: 'Check the calendar and book your next session.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Book your next session</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, it has been {{ daysSinceLastBooking }} days since your last FO Studio booking.</p>
<p style="margin:0 0 14px;">Check the current calendar when you are ready for your next session.</p>
<p style="margin:0;"><a href="{{ bookUrl }}">Book studio time</a></p>
</div>`
  },
  'waiver.expiringReminder': {
    subjectTemplate: 'Your FO Studio waiver expires {{ waiverExpiresAtHuman }}',
    preheaderTemplate: 'Renew your waiver before your next booking.',
    bodyTemplate: `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;">
<h1 style="font-size:24px;margin:0 0 12px;">Waiver expiring soon</h1>
<p style="margin:0 0 14px;">Hi {{ customerName }}, your FO Studio waiver expires {{ waiverExpiresAtHuman }}.</p>
<p style="margin:0 0 14px;">Please renew it before your next session to avoid access delays.</p>
<p style="margin:0;"><a href="{{ waiverUrl }}">Review waiver</a></p>
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
