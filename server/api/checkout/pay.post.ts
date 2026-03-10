import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { ensureSquareCustomerForGuest, ensureSquareCustomerForUser } from '~~/server/utils/square/customer'
import { buildSubscriptionCreatePhasesFromPlanVariation } from '~~/server/utils/square/subscriptionPhases'

const bodySchema = z.object({
  token: z.string().uuid(),
  sourceId: z.string().min(10).optional(),
  cardId: z.string().min(5).optional()
}).refine(
  value => Boolean(value.sourceId) || Boolean(value.cardId),
  { message: 'sourceId or cardId is required' }
)

type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

type CheckoutSessionRow = {
  id: string
  token: string
  tier: string
  cadence: Cadence
  status: string
  guest_email: string | null
  plan_variation_id: string | null
  customer_id: string | null
  square_customer_id: string | null
  square_subscription_id: string | null
  paid_at: string | null
  metadata: Record<string, unknown> | null
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square request failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square request failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square request failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square request failed'
}

function addCadenceDate(cadence: Cadence, anchorIso: string) {
  const date = new Date(anchorIso)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  if (cadence === 'daily') {
    date.setUTCDate(date.getUTCDate() + 1)
    return date.toISOString().slice(0, 10)
  }
  if (cadence === 'weekly') {
    date.setUTCDate(date.getUTCDate() + 7)
    return date.toISOString().slice(0, 10)
  }
  const months = cadence === 'annual' ? 12 : cadence === 'quarterly' ? 3 : 1
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

function readMetadataPriceCents(metadata: Record<string, unknown> | null | undefined) {
  const value = metadata?.effective_price_cents
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed)
  }
  return null
}

export default defineEventHandler(async (event) => {
  const body = bodySchema.parse(await readBody(event))
  const user = await serverSupabaseUser(event).catch(() => null)
  const supabase = serverSupabaseServiceRole(event)

  const { data: rawSession, error: sessionErr } = await supabase
    .from('membership_checkout_sessions')
    .select('*')
    .eq('token', body.token)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!rawSession) throw createError({ statusCode: 404, statusMessage: 'Checkout session not found' })

  const session = rawSession as CheckoutSessionRow
  if (session.status === 'claimed') {
    return {
      ok: true,
      alreadyPaid: true,
      token: session.token,
      squareSubscriptionId: session.square_subscription_id
    }
  }
  if (session.status === 'failed' || session.status === 'expired') {
    throw createError({ statusCode: 409, statusMessage: 'This checkout session is no longer valid.' })
  }

  const { data: variation, error: variationErr } = await supabase
    .from('membership_plan_variations')
    .select('price_cents,currency,provider_plan_variation_id,active')
    .eq('tier_id', session.tier)
    .eq('cadence', session.cadence)
    .eq('provider', 'square')
    .maybeSingle()

  if (variationErr) throw createError({ statusCode: 500, statusMessage: variationErr.message })
  if (!variation || !variation.active) {
    throw createError({ statusCode: 409, statusMessage: 'This membership option is no longer available.' })
  }

  const amountCents = readMetadataPriceCents(session.metadata) ?? Number(variation.price_cents ?? 0)
  if (!Number.isFinite(amountCents) || amountCents < 0) {
    throw createError({ statusCode: 500, statusMessage: 'Invalid membership price configuration.' })
  }
  if (amountCents > 0 && amountCents < 100) {
    throw createError({ statusCode: 400, statusMessage: 'Square requires membership charges to be at least $1.00.' })
  }

  const currency = typeof variation.currency === 'string' && variation.currency.trim()
    ? variation.currency.trim().toUpperCase()
    : 'USD'
  const planVariationId = variation.provider_plan_variation_id?.trim() || session.plan_variation_id
  if (!planVariationId) {
    throw createError({ statusCode: 503, statusMessage: 'This membership is not linked to a Square plan variation yet.' })
  }

  let squareCustomerId = session.square_customer_id?.trim() || null
  if (!squareCustomerId) {
    if (user?.sub) {
      squareCustomerId = await ensureSquareCustomerForUser(event, {
        userId: user.sub,
        email: user.email ?? session.guest_email ?? null
      })
    } else {
      const guestEmail = (session.guest_email ?? '').trim().toLowerCase()
      if (!guestEmail) throw createError({ statusCode: 400, statusMessage: 'Checkout session is missing guest email.' })
      squareCustomerId = await ensureSquareCustomerForGuest(event, { email: guestEmail })
    }
  }

  if (!squareCustomerId) {
    throw createError({ statusCode: 503, statusMessage: 'Could not initialize customer for payment.' })
  }

  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const idempotencyBase = `mco:${session.id}`

  let selectedCardId = body.cardId?.trim() || null
  if (selectedCardId) {
    const listRes = await square.cards.list({ customerId: squareCustomerId, includeDisabled: false } as never)
    const cards = Array.isArray((listRes as { cards?: unknown }).cards)
      ? ((listRes as { cards?: Array<Record<string, unknown>> }).cards ?? [])
      : []
    const exists = cards.some(card => readString(card, 'id') === selectedCardId)
    if (!exists) throw createError({ statusCode: 400, statusMessage: 'Selected card is not available.' })
  }

  if (!selectedCardId) {
    const sourceId = body.sourceId?.trim()
    if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Card token is required.' })
    try {
      const cardRes = await square.cards.create({
        idempotencyKey: `${idempotencyBase}:c`,
        sourceId,
        card: {
          customerId: squareCustomerId
        }
      } as never)
      const createdCard = (cardRes as { card?: Record<string, unknown> | null }).card ?? null
      selectedCardId = readString(createdCard, 'id')
      if (!selectedCardId) {
        throw createError({ statusCode: 502, statusMessage: 'Square did not return a card id.' })
      }
    } catch (error) {
      throw createError({ statusCode: 502, statusMessage: `Failed to save card: ${readSquareErrorMessage(error)}` })
    }
  }

  let paymentId: string | null = null
  let paymentCreatedAt: string | null = null
  if (amountCents > 0) {
    try {
      const paymentRes = await square.payments.create({
        idempotencyKey: `${idempotencyBase}:p`,
        sourceId: selectedCardId,
        customerId: squareCustomerId,
        autocomplete: true,
        locationId,
        amountMoney: {
          amount: BigInt(amountCents),
          currency
        },
        note: `FO Studio membership checkout (${session.tier}/${session.cadence})`,
        referenceId: session.id
      } as never)
      const payment = (paymentRes as { payment?: Record<string, unknown> | null }).payment ?? null
      const paymentStatus = readString(payment, 'status')?.toUpperCase() ?? null
      if (paymentStatus !== 'COMPLETED') {
        throw createError({ statusCode: 402, statusMessage: 'Payment not completed.' })
      }
      paymentId = readString(payment, 'id')
      paymentCreatedAt = readString(payment, 'createdAt', 'created_at')
    } catch (error) {
      throw createError({ statusCode: 402, statusMessage: `Card charge failed: ${readSquareErrorMessage(error)}` })
    }
  }

  let subscriptionId: string | null = session.square_subscription_id?.trim() || null
  if (!subscriptionId) {
    const startDate = addCadenceDate(session.cadence, paymentCreatedAt ?? new Date().toISOString())
    const subscriptionPhases = await buildSubscriptionCreatePhasesFromPlanVariation(square, planVariationId)
    try {
      const createPayload: Record<string, unknown> = {
        idempotencyKey: `${idempotencyBase}:s`,
        locationId,
        customerId: squareCustomerId,
        planVariationId,
        cardId: selectedCardId,
        startDate,
        timezone: 'America/Los_Angeles',
        source: { name: 'FO Studio membership checkout pay' }
      }

      if (subscriptionPhases?.length) {
        createPayload.phases = subscriptionPhases
      }

      const subRes = await square.subscriptions.create(createPayload as never)
      const subscription = (subRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
      subscriptionId = readString(subscription, 'id')
      if (!subscriptionId) throw new Error('Square did not return a subscription id')
    } catch (error) {
      throw createError({ statusCode: 502, statusMessage: `Failed to create subscription: ${readSquareErrorMessage(error)}` })
    }
  }

  const nowIso = new Date().toISOString()
  const metadata = {
    ...(session.metadata ?? {}),
    payment_method: 'square_web_payments',
    payment_id: paymentId,
    payment_amount_cents: amountCents,
    charged_card_id: selectedCardId
  }

  const { data: customerRow } = await supabase
    .from('customers')
    .select('id')
    .eq('square_customer_id', squareCustomerId)
    .maybeSingle()

  const { error: updateErr } = await supabase
    .from('membership_checkout_sessions')
    .update({
      customer_id: customerRow?.id ?? session.customer_id,
      square_customer_id: squareCustomerId,
      square_subscription_id: subscriptionId,
      plan_variation_id: planVariationId,
      paid_at: session.paid_at ?? nowIso,
      metadata: metadata as any
    })
    .eq('id', session.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return {
    ok: true,
    token: session.token,
    squareSubscriptionId: subscriptionId
  }
})
