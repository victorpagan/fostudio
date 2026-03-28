type BuildAdminMailPayloadParams = {
  eventType: string
  recipient: string
  userId: string
  templateId: string
  origin: string
}

export function normalizeMailRecipient(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function isoDate(offsetDays = 0) {
  const at = new Date(Date.now() + (offsetDays * 24 * 60 * 60 * 1000))
  return at.toISOString()
}

export function formatHumanDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

export function formatCadenceLabel(cadence: string | null | undefined) {
  const value = String(cadence ?? '').trim().toLowerCase()
  if (value === 'daily') return 'Daily'
  if (value === 'weekly') return 'Weekly'
  if (value === 'yearly' || value === 'annual') return 'Yearly'
  return 'Monthly'
}

export function buildAdminMailPayload(params: BuildAdminMailPayloadParams) {
  const currentPeriodStart = isoDate(-1)
  const currentPeriodEnd = isoDate(29)
  const bookingStart = isoDate(1)
  const bookingEnd = isoDate(1 + (2 / 24))
  const humanPeriodStart = formatHumanDate(currentPeriodStart)
  const humanPeriodEnd = formatHumanDate(currentPeriodEnd)
  const tierName = 'Nano'
  const bookUrl = `${params.origin}/dashboard/book`
  const membershipUrl = `${params.origin}/dashboard/membership`
  const waiverUrl = `${params.origin}/dashboard/waiver`
  const calendarUrl = `${params.origin}/calendar`
  const manageUrl = `${params.origin}/dashboard/bookings`

  const base = {
    to: params.recipient,
    userId: params.userId,
    eventType: params.eventType,
    templateId: params.templateId
  }

  if (params.eventType === 'order.confirmation') {
    return {
      ...base,
      customer: {
        emailAddress: params.recipient,
        givenName: 'FO',
        familyName: 'Studio Test'
      },
      order: {
        id: 'TEST-0001',
        created: new Date().toISOString(),
        email: params.recipient,
        squareOrderJSON: {
          lineItems: [
            {
              name: 'Studio booking',
              variationName: '2 hours',
              quantity: '1',
              totalMoney: { amount: 12000 }
            }
          ],
          totalMoney: { amount: 12000 },
          totalTaxMoney: { amount: 0 },
          totalDiscountMoney: { amount: 0 }
        }
      },
      location: {
        id: 'test-location',
        timezone: 'America/Los_Angeles',
        phoneNumber: '(555) 010-0200',
        logoUrl: '',
        websiteUrl: params.origin,
        businessName: 'FO Studio'
      },
      orderNumber: 'TEST-0001',
      orderDate: new Date().toLocaleString('en-US'),
      phoneNumber: '(555) 010-0200',
      logo: '',
      website: params.origin,
      items: [
        { name: 'Studio booking', quantity: 1, total: '120.00' }
      ],
      total: '120.00',
      totalTax: '0.00',
      totalDiscount: '0.00',
      receipt: true
    }
  }

  return {
    ...base,
    tierId: 'nano',
    tierName,
    membershipPlanName: tierName,
    cadence: 'daily',
    cadenceLabel: 'Daily',
    checkoutUrl: `${params.origin}/checkout?tier=nano&cadence=daily`,
    activationUrl: `${params.origin}/checkout/success?checkout=test-token`,
    bookUrl,
    membershipUrl,
    waiverUrl,
    checkoutToken: 'test-token',
    planVariationId: 'test-plan-variation',
    paymentLinkId: 'test-payment-link',
    currentPeriodStart,
    currentPeriodEnd,
    startPeriodHuman: humanPeriodStart,
    endPeriodHuman: humanPeriodEnd,
    subscriptionId: 'test-subscription',
    squareStatus: 'ACTIVE',
    membershipId: 'test-membership',
    creditsAdded: 4,
    newBalance: 12,
    amountCents: 1200,
    amountDollars: 12,
    optionLabel: 'Test top-up',
    holdsAdded: 1,
    newHoldBalance: 3,
    label: 'Overnight Hold',
    paymentId: 'test-payment',
    isPriorityMember: true,
    customerName: 'FO Studio Test',
    customerEmail: params.recipient,
    doorCode: '123456',
    doorCodeUpdatedAt: new Date().toISOString(),
    guestName: 'FO Studio Guest',
    guestEmail: params.recipient,
    bookingId: 'test-booking-001',
    bookingStart,
    bookingEnd,
    accessCode: '654321',
    calendarUrl,
    manageUrl,
    studioAddress: '3131 N. San Fernando Rd., Los Angeles, CA 90065',
    orderNumber: 'TEST-0001',
    orderDate: new Date().toLocaleString('en-US'),
    phoneNumber: '(555) 010-0200',
    logo: '',
    website: params.origin,
    items: [
      { name: 'Studio booking', quantity: 1, total: '120.00' }
    ],
    total: '120.00',
    totalTax: '0.00',
    totalDiscount: '0.00',
    receipt: true
  }
}
