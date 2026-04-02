import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

type SyncResult = {
  tierId: string
  tierDisplayName: string
  cadence: string
  status: 'synced' | 'skipped' | 'failed'
  message?: string
}

async function syncVariationToSquare(
  square: Awaited<ReturnType<typeof useSquareClient>>,
  tierDisplayName: string,
  cadence: string,
  providerPlanId: string,
  providerPlanVariationId: string,
  monthlyPriceCents: number,
  discountLabel: string | null,
  currency: string
) {
  const cadenceToSquare = (cadence: string) => {
    if (cadence === 'daily') return 'DAILY'
    if (cadence === 'weekly') return 'WEEKLY'
    if (cadence === 'quarterly') return 'QUARTERLY'
    if (cadence === 'annual') return 'ANNUAL'
    return 'MONTHLY'
  }

  const cadenceLabel = (cadence: string) => {
    if (cadence === 'daily') return 'Daily'
    if (cadence === 'weekly') return 'Weekly'
    if (cadence === 'quarterly') return 'Quarterly'
    if (cadence === 'annual') return 'Annual'
    return 'Monthly'
  }

  // Use RELATIVE pricing (same as variation-sync-square.post.ts)
  // The order template and discount will be injected during checkout
  const phase: Record<string, unknown> = {
    cadence: cadenceToSquare(cadence),
    pricing: {
      type: 'RELATIVE' as const
    }
  }

  // Set periods as a number (not BigInt) to match cadence multiplier
  // Square expects: quarterly=3, annual=12, daily/weekly/monthly=1
  const months = cadence === 'quarterly' ? 3 : cadence === 'annual' ? 12 : 1
  if (months > 1) {
    phase.periods = months
  }

  const payload = {
    idempotencyKey: `sync-all:${providerPlanVariationId}:${cadence}:${Date.now()}`,
    object: {
      id: providerPlanVariationId,
      type: 'SUBSCRIPTION_PLAN_VARIATION' as const,
      presentAtAllLocations: true,
      subscriptionPlanVariationData: {
        name: `${tierDisplayName} ${cadenceLabel(cadence)}`,
        subscriptionPlanId: providerPlanId,
        phases: [phase]
      }
    }
  }

  await square.catalog.object.upsert(payload as never)
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const logPrefix = '[admin/variations-sync-all]'

  console.info(logPrefix, 'start')

  try {
    // Get all active tiers
    const { data: tiers, error: tiersErr } = await supabase
      .from('membership_tiers')
      .select('id,display_name,active')
      .eq('active', true)

    if (tiersErr) throw new Error(`Failed to fetch tiers: ${tiersErr.message}`)
    if (!tiers?.length) {
      return {
        ok: true,
        total: 0,
        results: []
      }
    }

    // Get all active variations with provider IDs
    const { data: variations, error: varErr } = await supabase
      .from('membership_plan_variations')
      .select('tier_id,cadence,provider_plan_id,provider_plan_variation_id,price_cents,discount_label,currency,active')
      .eq('provider', 'square')
      .eq('active', true)
      .not('provider_plan_id', 'is', null)
      .not('provider_plan_variation_id', 'is', null)

    if (varErr) throw new Error(`Failed to fetch variations: ${varErr.message}`)

    const square = await useSquareClient(event)
    const results: SyncResult[] = []
    const tierMap = new Map(tiers.map(t => [t.id, t.display_name]))

    // Group variations by tier so we can fetch monthly base price
    const variationsByTier = new Map<string, typeof variations>()
    for (const variation of variations ?? []) {
      if (!variationsByTier.has(variation.tier_id)) {
        variationsByTier.set(variation.tier_id, [])
      }
      variationsByTier.get(variation.tier_id)!.push(variation)
    }

    // Sync each tier's variations
    for (const [tierId, tierVariations] of variationsByTier) {
      const tierDisplayName = tierMap.get(tierId) || tierId

      // Find monthly variation to get base price
      const monthlyVar = tierVariations.find(v => v.cadence === 'monthly')
      const monthlyPriceCents = monthlyVar?.price_cents ?? 0

      for (const variation of tierVariations) {
        try {
          // Skip if missing provider IDs
          if (!variation.provider_plan_id || !variation.provider_plan_variation_id) {
            results.push({
              tierId,
              tierDisplayName,
              cadence: variation.cadence,
              status: 'skipped',
              message: 'Missing provider plan IDs'
            })
            continue
          }

          await syncVariationToSquare(
            square,
            tierDisplayName,
            variation.cadence,
            variation.provider_plan_id,
            variation.provider_plan_variation_id,
            monthlyPriceCents,
            variation.discount_label,
            variation.currency || 'USD'
          )

          results.push({
            tierId,
            tierDisplayName,
            cadence: variation.cadence,
            status: 'synced'
          })

          console.info(logPrefix, 'synced', {
            tierId,
            cadence: variation.cadence
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          results.push({
            tierId,
            tierDisplayName,
            cadence: variation.cadence,
            status: 'failed',
            message
          })

          console.error(logPrefix, 'sync-failed', {
            tierId,
            cadence: variation.cadence,
            message
          })
        }
      }
    }

    const synced = results.filter(r => r.status === 'synced').length
    const failed = results.filter(r => r.status === 'failed').length

    console.info(logPrefix, 'complete', {
      total: results.length,
      synced,
      failed
    })

    return {
      ok: true,
      total: results.length,
      synced,
      failed,
      results
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(logPrefix, 'fatal-error', { message })
    throw createError({
      statusCode: 500,
      statusMessage: `Sync failed: ${message}`
    })
  }
})
