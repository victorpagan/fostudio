import { z } from 'zod'
import { getRequestURL } from 'h3'
import { requireServerAdmin } from '~~/server/utils/auth'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const bodySchema = z.object({
  eventType: z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9._-]+$/),
  recipient: z.string().trim().email().max(320).optional()
})

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string
  active: boolean
}

function normalizeEmail(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toLowerCase()
  return normalized || null
}

function isoDate(offsetDays = 0) {
  const at = new Date(Date.now() + (offsetDays * 24 * 60 * 60 * 1000))
  return at.toISOString()
}

function formatHumanDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

function readUpstreamErrorDetails(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const value = error as {
    statusCode?: number
    statusMessage?: string
    data?: unknown
    response?: { status?: number, _data?: unknown }
    message?: string
  }

  const status = value.statusCode ?? value.response?.status ?? null
  const payload = value.data ?? value.response?._data ?? null
  const payloadText = payload == null
    ? null
    : (typeof payload === 'string' ? payload : JSON.stringify(payload))

  return {
    status,
    message: value.statusMessage ?? value.message ?? null,
    payloadText
  }
}

function buildTestPayload(params: {
  eventType: string
  recipient: string
  userId: string
  templateId: string
  origin: string
}) {
  const currentPeriodStart = isoDate(-1)
  const currentPeriodEnd = isoDate(29)
  const bookingStart = isoDate(1)
  const bookingEnd = isoDate(1 + (2 / 24))
  const humanPeriodStart = formatHumanDate(currentPeriodStart)
  const humanPeriodEnd = formatHumanDate(currentPeriodEnd)
  const tierName = 'Nano'

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
    calendarUrl: `${params.origin}/calendar`,
    manageUrl: `${params.origin}/dashboard/bookings`,
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

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const recipient = normalizeEmail(body.recipient) ?? normalizeEmail(user.email)
  if (!recipient) {
    throw createError({ statusCode: 400, statusMessage: 'Recipient email is required' })
  }

  const { data: templateRowRaw, error: templateError } = await supabase
    .from('mail_template_registry')
    .select('event_type,sendgrid_template_id,active')
    .eq('event_type', body.eventType)
    .maybeSingle()

  if (templateError) throw createError({ statusCode: 500, statusMessage: templateError.message })

  const templateRow = (templateRowRaw ?? null) as MailTemplateRegistryRow | null
  const templateId = String(templateRow?.sendgrid_template_id ?? '').trim()
  if (!templateId) {
    throw createError({
      statusCode: 400,
      statusMessage: `No SendGrid template id configured for ${body.eventType}`
    })
  }

  const payload = buildTestPayload({
    eventType: body.eventType,
    recipient,
    userId: user.sub ?? 'admin-test-user',
    templateId,
    origin: getRequestURL(event).origin
  })

  let sendResult: Awaited<ReturnType<typeof sendViaFomailer>>
  try {
    sendResult = await sendViaFomailer(event, {
      type: body.eventType,
      payload
    })
    if (!sendResult.ok) {
      throw createError({
        statusCode: 502,
        statusMessage: `Test send failed before upstream request: ${sendResult.reason}`
      })
    }
  } catch (error: unknown) {
    const details = readUpstreamErrorDetails(error)
    const parts = [
      'Test send failed upstream',
      details?.status ? `(status ${details.status})` : '',
      details?.message ?? (error instanceof Error ? error.message : String(error))
    ].filter(Boolean)
    const baseMessage = parts.join(': ')

    throw createError({
      statusCode: 502,
      statusMessage: details?.payloadText
        ? `${baseMessage} | body: ${details.payloadText}`
        : baseMessage
    })
  }

  return {
    ok: Boolean(sendResult.ok),
    eventType: body.eventType,
    recipient,
    isActive: templateRow?.active !== false,
    mailer: sendResult.ok ? sendResult.data : { reason: sendResult.reason ?? 'unknown' }
  }
})
