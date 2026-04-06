import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { ensureSquareCustomerForGuest, ensureSquareCustomerForUser } from '~~/server/utils/square/customer'
import { buildSubscriptionCreatePhasesFromPlanVariation } from '~~/server/utils/square/subscriptionPhases'
import { resolveOrCreateSquareCadenceDiscountId } from '~~/server/utils/square/cadenceDiscount'
import { parseDiscountLabel } from '~~/app/utils/membershipDiscount'

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

function isSquareInternalApiError(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const errors = (error as { errors?: unknown }).errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (first && typeof first === 'object') {
      const code = (first as { code?: unknown }).code
      const category = (first as { category?: unknown }).category
      if (code === 'INTERNAL_SERVER_ERROR' || category === 'API_ERROR') return true
    }
  }

  const message = error instanceof Error ? error.message : ''
  return message.includes('INTERNAL_SERVER_ERROR') || message.includes('"category": "API_ERROR"')
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function cadenceQuantityForSubscription(cadence: Cadence) {
  if (cadence === 'quarterly') return 3
  if (cadence === 'annual') return 12
  return 1
}

async function createOrderTemplateIdForPlanVariation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  planVariationId: string,
  locationId: string,
  cadence?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
) {
  const variationRes = await square.catalog.object.get({
    objectId: planVariationId,
    includeRelatedObjects: false
  } as never)
  const variationObject = asRecord((variationRes as { object?: unknown, catalogObject?: unknown }).object ?? (variationRes as { catalogObject?: unknown }).catalogObject)
  const variationData = asRecord(variationObject?.subscriptionPlanVariationData ?? variationObject?.subscription_plan_variation_data)
  const subscriptionPlanId = readString(variationData, 'subscriptionPlanId', 'subscription_plan_id')
  if (!subscriptionPlanId) throw new Error(`Square variation ${planVariationId} is missing subscription plan id`)

  const planRes = await square.catalog.object.get({
    objectId: subscriptionPlanId,
    includeRelatedObjects: false
  } as never)
  const planObject = asRecord((planRes as { object?: unknown, catalogObject?: unknown }).object ?? (planRes as { catalogObject?: unknown }).catalogObject)
  const planData = asRecord(planObject?.subscriptionPlanData ?? planObject?.subscription_plan_data)
  const eligibleIdsRaw = planData?.eligibleItemIds ?? planData?.eligible_item_ids
  const eligibleItemIds = Array.isArray(eligibleIdsRaw)
    ? eligibleIdsRaw
        .map(entry => typeof entry === 'string' ? entry.trim() : '')
        .filter(Boolean)
    : []
  const eligibleItemId = eligibleItemIds[0] ?? null
  if (!eligibleItemId) throw new Error(`Square plan ${subscriptionPlanId} has no eligible item id`)

  const itemRes = await square.catalog.object.get({
    objectId: eligibleItemId,
    includeRelatedObjects: false
  } as never)
  const itemObject = asRecord((itemRes as { object?: unknown, catalogObject?: unknown }).object ?? (itemRes as { catalogObject?: unknown }).catalogObject)
  const itemData = asRecord(itemObject?.itemData ?? itemObject?.item_data)
  const itemVariations = Array.isArray(itemData?.variations) ? itemData.variations : []
  const firstItemVariation = itemVariations
    .map(entry => asRecord(entry))
    .find(Boolean) ?? null
  const itemVariationId = readString(firstItemVariation, 'id')
  if (!itemVariationId) throw new Error(`Square item ${eligibleItemId} has no item variation id`)

  // Use cadence multiplier for quantity: quarterly=3, annual=12, others=1
  const cadenceQuantity = !cadence
    ? 1
    : cadence === 'quarterly'
      ? 3
      : cadence === 'annual'
        ? 12
        : 1

  const orderRes = await square.orders.create({
    idempotencyKey: randomUUID(),
    order: {
      locationId,
      state: 'DRAFT',
      lineItems: [
        {
          catalogObjectId: itemVariationId,
          quantity: String(cadenceQuantity)
        }
      ]
    }
  } as never)

  const order = asRecord((orderRes as { order?: unknown }).order)
  const orderId = readString(order, 'id')
  if (!orderId) throw new Error(`Could not create order template for variation ${planVariationId}`)
  return orderId
}

async function orderTemplateHasExpectedQuantity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  orderTemplateId: string,
  expectedQuantity: number
) {
  try {
    const templateRes = await square.catalog.object.get({
      objectId: orderTemplateId,
      includeRelatedObjects: false
    } as never)
    const templateObject = asRecord(
      (templateRes as { object?: unknown, catalogObject?: unknown }).object
      ?? (templateRes as { catalogObject?: unknown }).catalogObject
    )
    const templateData = asRecord(templateObject?.orderTemplateData ?? templateObject?.order_template_data)
    const lineItemsRaw = templateData?.lineItems ?? templateData?.line_items
    const lineItems = Array.isArray(lineItemsRaw) ? lineItemsRaw : []
    if (!lineItems.length) return false

    return lineItems.every((entry) => {
      const lineItem = asRecord(entry)
      const quantityRaw = readString(lineItem, 'quantity')
      const quantity = Number(quantityRaw ?? '')
      return Number.isFinite(quantity) && Math.floor(quantity) === expectedQuantity
    })
  } catch {
    return false
  }
}

function isSquareCardOnFileId(value: string | null | undefined) {
  if (!value) return false
  return value.trim().startsWith('ccof:')
}

function todayIsoDateInPacific() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10)
  return `${year}-${month}-${day}`
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

function readMetadataPromoSquareDiscountId(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.promo_square_discount_id
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  return value || null
}

function readPricingDiscountIds(pricing: Record<string, unknown> | null | undefined) {
  const raw = pricing?.discountIds ?? pricing?.discount_ids
  if (!Array.isArray(raw)) return [] as string[]
  return raw
    .map(value => String(value ?? '').trim())
    .filter(Boolean) as string[]
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
    .select('price_cents,currency,provider_plan_variation_id,active,discount_label,membership_tiers(display_name)')
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

  const metaFirstName = readString(session.metadata, 'guest_first_name')
  const metaLastName = readString(session.metadata, 'guest_last_name')
  const metaPhone = readString(session.metadata, 'guest_phone')

  // Extract name/phone from Supabase auth user_metadata if available
  const userMeta = (user as Record<string, unknown> | null)?.user_metadata as Record<string, unknown> | null | undefined
  const authDisplayName = readString(userMeta ?? null, 'full_name', 'name')
  const authDisplayNameParts = authDisplayName ? authDisplayName.split(/\s+/).filter(Boolean) : []
  const authFirstName = readString(userMeta ?? null, 'first_name', 'firstName', 'given_name') ?? authDisplayNameParts[0] ?? null
  const authLastName = readString(userMeta ?? null, 'last_name', 'lastName', 'family_name')
    ?? (authDisplayNameParts.length > 1 ? authDisplayNameParts.slice(1).join(' ') : null)
  const authPhone = readString(userMeta ?? null, 'phone', 'phoneNumber', 'phone_number')
    ?? readString((user as Record<string, unknown> | null), 'phone')

  let squareCustomerId: string | null = null
  if (user?.sub) {
    squareCustomerId = await ensureSquareCustomerForUser(event, {
      userId: user.sub,
      email: user.email ?? session.guest_email ?? null,
      firstName: metaFirstName ?? authFirstName,
      lastName: metaLastName ?? authLastName,
      phone: metaPhone ?? authPhone
    })
  } else {
    const guestEmail = (session.guest_email ?? '').trim().toLowerCase()
    if (!guestEmail) throw createError({ statusCode: 400, statusMessage: 'Checkout session is missing guest email.' })
    squareCustomerId = await ensureSquareCustomerForGuest(event, {
      email: guestEmail,
      firstName: metaFirstName,
      lastName: metaLastName,
      phone: metaPhone
    })
  }

  squareCustomerId = (squareCustomerId ?? session.square_customer_id?.trim()) || null

  if (!squareCustomerId) {
    throw createError({ statusCode: 503, statusMessage: 'Could not initialize customer for payment.' })
  }

  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const idempotencyBase = `mco:${session.id}`
  const logPrefix = '[checkout/pay]'

  console.info(logPrefix, 'start', {
    sessionId: session.id,
    token: session.token,
    status: session.status,
    tier: session.tier,
    cadence: session.cadence,
    planVariationId,
    amountCents,
    currency,
    sourceIdPrefix: body.sourceId?.trim().slice(0, 5) ?? null,
    hasSourceId: Boolean(body.sourceId?.trim()),
    hasCardId: Boolean(body.cardId?.trim())
  })

  let selectedCardId = body.cardId?.trim() || null
  if (!selectedCardId) {
    const sourceId = body.sourceId?.trim()
    if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Card token is required.' })

    if (isSquareCardOnFileId(sourceId)) {
      selectedCardId = sourceId
      console.info(logPrefix, 'using-source-card-id', {
        sessionId: session.id,
        cardIdSuffix: selectedCardId.slice(-6)
      })
    } else {
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
        console.info(logPrefix, 'created-card', {
          sessionId: session.id,
          cardIdSuffix: selectedCardId.slice(-6)
        })
      } catch (error) {
        console.error(logPrefix, 'create-card-failed', {
          sessionId: session.id,
          message: readSquareErrorMessage(error)
        })
        throw createError({ statusCode: 502, statusMessage: `Failed to save card: ${readSquareErrorMessage(error)}` })
      }
    }
  }

  if (!selectedCardId) {
    throw createError({ statusCode: 400, statusMessage: 'No payment method is available for this checkout.' })
  }

  console.info(logPrefix, 'card-selected', {
    sessionId: session.id,
    cardIdSuffix: selectedCardId.slice(-6)
  })

  const paymentId: string | null = null

  let subscriptionId: string | null = session.square_subscription_id?.trim() || null
  if (!subscriptionId) {
    const startDate = todayIsoDateInPacific()
    let subscriptionPhases = await buildSubscriptionCreatePhasesFromPlanVariation(square, planVariationId)
    const promoSquareDiscountId = readMetadataPromoSquareDiscountId(session.metadata)
    const parsedCadenceDiscount = parseDiscountLabel(variation.discount_label)
    const expectedCadenceDiscount = parsedCadenceDiscount.type !== 'none' && Number(parsedCadenceDiscount.amount) > 0
    let cadenceDiscountId: string | null = null

    if (expectedCadenceDiscount) {
      try {
        cadenceDiscountId = await resolveOrCreateSquareCadenceDiscountId({
          square,
          cadence: session.cadence,
          discountLabel: variation.discount_label,
          currency,
          tierDisplayName: readString(asRecord(variation.membership_tiers), 'display_name')
        })
      } catch (error) {
        throw createError({
          statusCode: 409,
          statusMessage: `Cadence discount is not available in Square: ${readSquareErrorMessage(error)}`
        })
      }
    }

    const requiredPhaseDiscountIds: string[] = []

    if (promoSquareDiscountId) {
      try {
        const discountRes = await square.catalog.object.get({
          objectId: promoSquareDiscountId,
          includeRelatedObjects: false
        } as never)
        const discountObject = asRecord((discountRes as { object?: unknown, catalogObject?: unknown }).object ?? (discountRes as { catalogObject?: unknown }).catalogObject)
        const discountType = typeof discountObject?.type === 'string' ? discountObject.type : null
        const discountDeleted = discountObject?.isDeleted === true || discountObject?.is_deleted === true
        if (discountType !== 'DISCOUNT' || discountDeleted) {
          throw createError({
            statusCode: 409,
            statusMessage: 'Promo discount is no longer valid in Square. Re-save the promo and retry checkout.'
          })
        }
      } catch (error) {
        if ((error as { statusCode?: unknown })?.statusCode === 409) throw error
        throw createError({
          statusCode: 409,
          statusMessage: `Promo discount is not available in Square: ${readSquareErrorMessage(error)}`
        })
      }
      requiredPhaseDiscountIds.push(promoSquareDiscountId)
    }

    if (cadenceDiscountId) requiredPhaseDiscountIds.push(cadenceDiscountId)

    if (requiredPhaseDiscountIds.length) {
      const normalizedRequiredDiscountIds = Array.from(new Set(requiredPhaseDiscountIds))
      let attachedToRelativePhase = false

      subscriptionPhases = (subscriptionPhases ?? []).map((phase) => {
        const p = phase as Record<string, unknown>
        const pricing = asRecord(p.pricing)
        const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
        if (pricingType !== 'RELATIVE') return p

        const currentDiscountIds = readPricingDiscountIds(pricing)
        const mergedDiscountIds = Array.from(new Set([
          ...currentDiscountIds,
          ...normalizedRequiredDiscountIds
        ]))
        attachedToRelativePhase = true

        return {
          ...p,
          pricing: {
            ...(pricing ?? {}),
            type: 'RELATIVE',
            discountIds: mergedDiscountIds
          }
        }
      })

      if (!attachedToRelativePhase) {
        try {
          const orderTemplateId = await createOrderTemplateIdForPlanVariation(square, planVariationId, locationId, session.cadence)
          const cadenceMap: Record<Cadence, string> = {
            daily: 'DAILY',
            weekly: 'WEEKLY',
            monthly: 'MONTHLY',
            quarterly: 'QUARTERLY',
            annual: 'ANNUAL'
          }

          if (Array.isArray(subscriptionPhases) && subscriptionPhases.length > 0) {
            subscriptionPhases = subscriptionPhases.map((phase) => {
              const p = asRecord(phase) ?? {}
              return {
                ...p,
                orderTemplateId,
                pricing: {
                  type: 'RELATIVE',
                  discountIds: normalizedRequiredDiscountIds
                }
              }
            })
          } else {
            subscriptionPhases = [{
              ordinal: 0n,
              cadence: cadenceMap[session.cadence],
              orderTemplateId,
              pricing: {
                type: 'RELATIVE',
                discountIds: normalizedRequiredDiscountIds
              }
            }]
          }

          console.info(logPrefix, 'relative-phase-fallback-applied', {
            sessionId: session.id,
            planVariationId,
            orderTemplateId,
            phaseCount: subscriptionPhases.length,
            discountCount: normalizedRequiredDiscountIds.length
          })
        } catch (error) {
          throw createError({
            statusCode: 409,
            statusMessage: `Discounts could not be applied to this plan: ${readSquareErrorMessage(error)}`
          })
        }
      }
    }

    const relativePhases = Array.isArray(subscriptionPhases)
      ? subscriptionPhases
          .map(phase => asRecord(phase))
          .filter((phase): phase is Record<string, unknown> => Boolean(phase))
          .filter((phase) => {
            const pricing = asRecord(phase.pricing)
            const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
            return pricingType === 'RELATIVE'
          })
      : []
    const cadenceQuantity = cadenceQuantityForSubscription(session.cadence)

    if (relativePhases.length) {
      const existingRelativeOrderTemplateIds = Array.from(new Set(
        relativePhases
          .map(phase => readString(phase, 'orderTemplateId', 'order_template_id'))
          .filter((value): value is string => Boolean(value))
      ))

      let requiresTemplateInjection = existingRelativeOrderTemplateIds.length === 0
      if (!requiresTemplateInjection && cadenceQuantity > 1) {
        const quantityChecks = await Promise.all(
          existingRelativeOrderTemplateIds.map(orderTemplateId =>
            orderTemplateHasExpectedQuantity(square, orderTemplateId, cadenceQuantity))
        )
        requiresTemplateInjection = quantityChecks.some(result => !result)
      }

      if (requiresTemplateInjection) {
        const orderTemplateId = await createOrderTemplateIdForPlanVariation(square, planVariationId, locationId, session.cadence)
        subscriptionPhases = (subscriptionPhases ?? []).map((phase) => {
          const p = phase as Record<string, unknown>
          const pricing = (p.pricing ?? null) as Record<string, unknown> | null
          const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
          if (pricingType !== 'RELATIVE') return p
          return {
            ...p,
            orderTemplateId
          }
        })
        console.info(logPrefix, 'phase-order-template-normalized', {
          sessionId: session.id,
          planVariationId,
          orderTemplateId,
          cadence: session.cadence,
          expectedQuantity: cadenceQuantity
        })
      }
    }

    if (expectedCadenceDiscount && !cadenceDiscountId) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This cadence is missing its Square discount configuration. Re-save the cadence discount and retry checkout.'
      })
    }

    if (expectedCadenceDiscount && cadenceDiscountId && relativePhases.length) {
      const hasCadenceDiscountOnPhase = relativePhases.some((phase) => {
        const pricing = asRecord(phase.pricing)
        const discountIds = readPricingDiscountIds(pricing)
        return discountIds.includes(cadenceDiscountId)
      })

      if (!hasCadenceDiscountOnPhase) {
        throw createError({
          statusCode: 409,
          statusMessage: 'This cadence is missing its Square discount configuration. Re-save the cadence discount and retry checkout.'
        })
      }
    }

    if (Array.isArray(subscriptionPhases) && subscriptionPhases.some((phase) => {
      const p = phase as Record<string, unknown>
      const pricing = asRecord(p.pricing)
      const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
      const orderTemplateId = typeof p.orderTemplateId === 'string' && p.orderTemplateId.trim()
        ? p.orderTemplateId.trim()
        : null
      return pricingType === 'RELATIVE' && !orderTemplateId
    })) {
      try {
        const orderTemplateId = await createOrderTemplateIdForPlanVariation(square, planVariationId, locationId, session.cadence)
        subscriptionPhases = (subscriptionPhases ?? []).map((phase) => {
          const p = phase as Record<string, unknown>
          const pricing = (p.pricing ?? null) as Record<string, unknown> | null
          const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
          const existingOrderTemplateId = typeof p.orderTemplateId === 'string' && p.orderTemplateId.trim()
            ? p.orderTemplateId.trim()
            : null
          if (pricingType === 'RELATIVE' && !existingOrderTemplateId) {
            return {
              ...p,
              orderTemplateId
            }
          }
          return p
        })
        console.info(logPrefix, 'phase-order-template-injected', {
          sessionId: session.id,
          planVariationId,
          orderTemplateId
        })
      } catch (error) {
        throw createError({
          statusCode: 409,
          statusMessage: `Square plan variation ${planVariationId} has RELATIVE phase pricing but no order template. Could not auto-create template: ${readSquareErrorMessage(error)}`
        })
      }
    }

    console.info(logPrefix, 'subscription-phase-resolution', {
      sessionId: session.id,
      planVariationId,
      startDate,
      phaseCount: Array.isArray(subscriptionPhases) ? subscriptionPhases.length : 0,
      phases: Array.isArray(subscriptionPhases)
        ? subscriptionPhases.map((phase) => {
            const p = phase as Record<string, unknown>
            const pricing = (p.pricing ?? null) as Record<string, unknown> | null
            return {
              ordinal: p.ordinal,
              cadence: p.cadence,
              orderTemplateId: p.orderTemplateId ?? null,
              pricingType: pricing?.type ?? null,
              discountIds: Array.isArray(pricing?.discountIds) ? pricing?.discountIds : []
            }
          })
        : []
    })
    const buildCreatePayload = (phases: unknown) => {
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
      if (Array.isArray(phases) && phases.length) createPayload.phases = phases
      return createPayload
    }

    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        if (attempt > 1) {
          await sleep(600 * attempt)
          const orderTemplateId = await createOrderTemplateIdForPlanVariation(square, planVariationId, locationId, session.cadence)
          subscriptionPhases = (subscriptionPhases ?? []).map((phase) => {
            const p = phase as Record<string, unknown>
            const pricing = (p.pricing ?? null) as Record<string, unknown> | null
            const pricingType = typeof pricing?.type === 'string' ? pricing.type.toUpperCase() : null
            if (pricingType === 'RELATIVE') {
              return {
                ...p,
                orderTemplateId
              }
            }
            return p
          })
          console.info(logPrefix, 'subscription-retry-order-template-injected', {
            sessionId: session.id,
            attempt,
            planVariationId,
            orderTemplateId
          })
        }

        const createPayload = buildCreatePayload(subscriptionPhases)

        console.info(logPrefix, 'subscription-create-request', {
          sessionId: session.id,
          attempt,
          customerId: squareCustomerId,
          planVariationId,
          cardIdSuffix: selectedCardId.slice(-6),
          startDate,
          timezone: 'America/Los_Angeles',
          hasPhases: Boolean(subscriptionPhases?.length)
        })

        const subRes = await square.subscriptions.create(createPayload as never)
        const subscription = (subRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
        subscriptionId = readString(subscription, 'id')
        if (!subscriptionId) throw new Error('Square did not return a subscription id')
        console.info(logPrefix, 'subscription-created', {
          sessionId: session.id,
          attempt,
          subscriptionId
        })
        lastError = null
        break
      } catch (error) {
        lastError = error
        console.error(logPrefix, 'subscription-create-failed', {
          sessionId: session.id,
          attempt,
          planVariationId,
          message: readSquareErrorMessage(error)
        })
        if (!isSquareInternalApiError(error) || attempt === 3) break
      }
    }

    if (!subscriptionId) {
      throw createError({ statusCode: 502, statusMessage: `Failed to create subscription: ${readSquareErrorMessage(lastError)}` })
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
      metadata: metadata as unknown as never
    })
    .eq('id', session.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  console.info(logPrefix, 'session-updated', {
    sessionId: session.id,
    subscriptionId,
    paymentId
  })

  return {
    ok: true,
    token: session.token,
    squareSubscriptionId: subscriptionId
  }
})
