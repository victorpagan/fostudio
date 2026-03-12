function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readPositiveInt(value: unknown) {
  if (typeof value === 'bigint') {
    if (value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value)
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
  }
  return null
}

function readNonNegativeInt(value: unknown) {
  if (typeof value === 'bigint') {
    if (value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value)
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed)
  }
  return null
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return value
    .map(entry => String(entry ?? '').trim())
    .filter(Boolean)
}

function normalizeMoney(value: unknown) {
  const money = asRecord(value)
  if (!money) return null

  const currency = readString(money, 'currency')
  const amountRaw = money.amount

  let amount: bigint | null = null
  if (typeof amountRaw === 'bigint') amount = amountRaw
  else if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) amount = BigInt(Math.round(amountRaw))
  else if (typeof amountRaw === 'string' && amountRaw.trim()) {
    const parsed = Number(amountRaw)
    if (Number.isFinite(parsed)) amount = BigInt(Math.round(parsed))
  }

  if (!currency || amount === null) return null
  return { amount, currency }
}

function extractCatalogObject(response: unknown) {
  const payload = asRecord(response)
  if (!payload) return null
  return asRecord(payload.catalogObject ?? payload.catalog_object ?? payload.object)
}

function extractRelatedObjects(response: unknown) {
  const payload = asRecord(response)
  if (!payload) return [] as Record<string, unknown>[]
  const source = payload.relatedObjects ?? payload.related_objects
  if (!Array.isArray(source)) return [] as Record<string, unknown>[]
  return source
    .map(entry => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function extractVariationData(object: Record<string, unknown> | null) {
  return asRecord(
    object?.subscriptionPlanVariationData
    ?? object?.subscription_plan_variation_data
  )
}

function extractPhasesFromVariationData(variationData: Record<string, unknown> | null) {
  return Array.isArray(variationData?.phases) ? variationData.phases : []
}

async function fetchCatalogObjectWithRelated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  objectId: string
) {
  const res = await square.catalog.object.get({
    objectId,
    includeRelatedObjects: true
  } as never)
  return {
    catalogObject: extractCatalogObject(res),
    relatedObjects: extractRelatedObjects(res)
  }
}

export async function buildSubscriptionCreatePhasesFromPlanVariation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  planVariationId: string
) {
  const logPrefix = '[checkout/phases]'
  try {
    const {
      catalogObject: variationObject,
      relatedObjects: variationRelatedObjects
    } = await fetchCatalogObjectWithRelated(square, planVariationId)

    let variationData = extractVariationData(variationObject)
    let phasesSource = extractPhasesFromVariationData(variationData)

    let relatedOrderTemplateIds = variationRelatedObjects
      .filter((object) => readString(object, 'type')?.toUpperCase() === 'ORDER_TEMPLATE')
      .map(object => readString(object, 'id'))
      .filter((id): id is string => Boolean(id))

    const subscriptionPlanId = readString(variationData, 'subscriptionPlanId', 'subscription_plan_id')
    if ((!phasesSource.length || !relatedOrderTemplateIds.length) && subscriptionPlanId) {
      const {
        catalogObject: planObject,
        relatedObjects: planRelatedObjects
      } = await fetchCatalogObjectWithRelated(square, subscriptionPlanId)

      if (!phasesSource.length) {
        const fromRelatedVariation = planRelatedObjects.find((object) => readString(object, 'id') === planVariationId) ?? null
        const variationFromPlan = extractVariationData(fromRelatedVariation) ?? variationData
        phasesSource = extractPhasesFromVariationData(variationFromPlan)
        variationData = variationFromPlan
      }

      if (!relatedOrderTemplateIds.length) {
        relatedOrderTemplateIds = planRelatedObjects
          .filter((object) => readString(object, 'type')?.toUpperCase() === 'ORDER_TEMPLATE')
          .map(object => readString(object, 'id'))
          .filter((id): id is string => Boolean(id))
      }

      if (!phasesSource.length) {
        // Fallback: some payloads embed variations under the plan object.
        const planData = asRecord(planObject?.subscriptionPlanData ?? planObject?.subscription_plan_data)
        const embeddedVariations = Array.isArray(planData?.subscriptionPlanVariations ?? planData?.subscription_plan_variations)
          ? (planData?.subscriptionPlanVariations ?? planData?.subscription_plan_variations) as unknown[]
          : []
        const matchingEmbedded = embeddedVariations
          .map(entry => asRecord(entry))
          .find((object) => readString(object, 'id') === planVariationId) ?? null
        phasesSource = extractPhasesFromVariationData(extractVariationData(matchingEmbedded))
      }
    }

    if (!phasesSource.length) return null

    const phases = phasesSource
      .map((entry, index) => {
        const phase = asRecord(entry)
        if (!phase) return null

        const ordinal = readNonNegativeInt(phase.ordinal)
        const cadence = readString(phase, 'cadence')
        const phaseUid = readString(phase, 'uid')
        const planPhaseUid = readString(phase, 'planPhaseUid', 'plan_phase_uid') ?? phaseUid
        const orderTemplateFromRelated = relatedOrderTemplateIds[ordinal ?? index] ?? relatedOrderTemplateIds[index] ?? null
        const orderTemplateId = readString(
          phase,
          'orderTemplateId',
          'order_template_id'
        ) ?? orderTemplateFromRelated ?? planPhaseUid ?? phaseUid
        const pricingSource = asRecord(phase.pricing ?? phase.pricing_data)
        const pricingType = readString(pricingSource, 'type')?.toUpperCase()
        if (ordinal === null || !cadence || !pricingSource || !pricingType) return null

        const pricing: Record<string, unknown> = { type: pricingType }
        const discountIds = toStringArray(pricingSource.discountIds ?? pricingSource.discount_ids)
        if (discountIds.length) pricing.discountIds = discountIds

        const priceMoney = normalizeMoney(pricingSource.priceMoney ?? pricingSource.price_money)
        if (priceMoney) pricing.priceMoney = priceMoney

        const phasePayload: Record<string, unknown> = {
          ordinal: BigInt(ordinal),
          cadence,
          pricing
        }

        const periods = readPositiveInt(phase.periods)
        if (periods !== null) phasePayload.periods = BigInt(periods)
        if (orderTemplateId) phasePayload.orderTemplateId = orderTemplateId

        return phasePayload
      })
      .filter((phase): phase is Record<string, unknown> => Boolean(phase))

    if (!phases.length) return null

    const hasRelativePhase = phases.some((phase) => {
      const pricing = asRecord(phase.pricing)
      return readString(pricing, 'type')?.toUpperCase() === 'RELATIVE'
    })

    // Current Square API requires explicit phases when plan variation pricing is RELATIVE.
    if (!hasRelativePhase) return null

    const hasMissingRelativeOrderTemplate = phases.some((phase) => {
      const pricing = asRecord(phase.pricing)
      const isRelative = readString(pricing, 'type')?.toUpperCase() === 'RELATIVE'
      const orderTemplateId = readString(phase, 'orderTemplateId', 'order_template_id')
      return isRelative && !orderTemplateId
    })
    if (hasMissingRelativeOrderTemplate) {
      console.warn(logPrefix, 'relative-phase-missing-order-template', {
        planVariationId,
        phaseCount: phases.length,
        phases: phases.map((phase) => ({
          ordinal: phase.ordinal ?? null,
          cadence: phase.cadence ?? null,
          planPhaseUid: phase.planPhaseUid ?? null,
          orderTemplateId: phase.orderTemplateId ?? null
        }))
      })
    }

    return phases
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn(logPrefix, 'phase-resolution-failed', { planVariationId, message })
    return null
  }
}
