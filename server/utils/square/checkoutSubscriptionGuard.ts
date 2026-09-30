import type { H3Event } from 'h3'
import { createError } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { assertNoLiveStudioSubscription, isLiveSquareSubscription } from './subscriptionSafety'

export async function guardLinkedSubscription(event: H3Event, subscriptionId: string | null | undefined) {
  if (!subscriptionId) return
  const square = await useSquareClient(event)
  const { subscription } = await square.subscriptions.get({ subscriptionId })
  if (!subscription || isLiveSquareSubscription(subscription.status)) {
    throw createError({ statusCode: 409, statusMessage: 'Your studio subscription still exists in Square. Update its payment method or contact the studio instead of starting a second subscription.' })
  }
}

export async function guardCustomerSubscriptions(event: H3Event, customerId: string, allowedSubscriptionId?: string | null) {
  const supabase = serverSupabaseServiceRole(event)
  // Include retired variations: their existing subscriptions can still renew.
  const { data, error } = await supabase.from('membership_plan_variations')
    .select('provider_plan_variation_id').eq('provider', 'square')
  if (error || !data?.length) {
    throw createError({ statusCode: 503, statusMessage: 'Could not verify existing studio subscriptions. Please retry later.' })
  }
  const ids = data.map(row => row.provider_plan_variation_id).filter((id): id is string => Boolean(id))
  await assertNoLiveStudioSubscription(await useSquareClient(event), customerId, ids, allowedSubscriptionId)
}
