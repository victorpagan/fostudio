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
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed)
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

export async function buildSubscriptionCreatePhasesFromPlanVariation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  square: any,
  planVariationId: string
) {
  try {
    const res = await square.catalog.object.get({
      objectId: planVariationId,
      includeRelatedObjects: false
    } as never)

    const catalogObject = extractCatalogObject(res)
    const variationData = asRecord(
      catalogObject?.subscriptionPlanVariationData
      ?? catalogObject?.subscription_plan_variation_data
    )
    const phasesSource = Array.isArray(variationData?.phases) ? variationData.phases : []
    if (!phasesSource.length) return null

    const phases = phasesSource
      .map((entry) => {
        const phase = asRecord(entry)
        if (!phase) return null

        const ordinal = readPositiveInt(phase.ordinal)
        const cadence = readString(phase, 'cadence')
        const orderTemplateId = readString(
          phase,
          'orderTemplateId',
          'order_template_id',
          // Dashboard-created plan variations often expose only `uid`,
          // which maps to the required order template identifier.
          'uid'
        )
        const pricingSource = asRecord(phase.pricing ?? phase.pricing_data)
        const pricingType = readString(pricingSource, 'type')?.toUpperCase()
        if (ordinal === null || !cadence || !pricingSource || !pricingType) return null

        const pricing: Record<string, unknown> = { type: pricingType }
        const discountIds = toStringArray(pricingSource.discountIds ?? pricingSource.discount_ids)
        if (discountIds.length) pricing.discountIds = discountIds

        const priceMoney = normalizeMoney(pricingSource.priceMoney ?? pricingSource.price_money)
        if (priceMoney) pricing.priceMoney = priceMoney

        const phasePayload: Record<string, unknown> = {
          ordinal,
          cadence,
          pricing
        }

        const periods = readPositiveInt(phase.periods)
        if (periods !== null) phasePayload.periods = periods
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

    // RELATIVE pricing phases must include order template ids.
    const hasMissingRelativeOrderTemplate = phases.some((phase) => {
      const pricing = asRecord(phase.pricing)
      const isRelative = readString(pricing, 'type')?.toUpperCase() === 'RELATIVE'
      const orderTemplateId = readString(phase, 'orderTemplateId', 'order_template_id')
      return isRelative && !orderTemplateId
    })
    if (hasMissingRelativeOrderTemplate) return null

    return phases
  } catch {
    return null
  }
}
