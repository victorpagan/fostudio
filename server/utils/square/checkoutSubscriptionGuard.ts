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
  // Include retired and introductory variants, not just the public catalog.
  const { data, error } = await supabase.rpc('get_studio_square_variation_ids' as never)
  const rows = data as unknown as { provider_plan_variation_id: string }[] | null
  if (error || !rows?.length) {
    throw createError({ statusCode: 503, statusMessage: 'Could not verify existing studio subscriptions. Please retry later.' })
  }
  const ids = rows.map(row => row.provider_plan_variation_id).filter(Boolean)
  await assertNoLiveStudioSubscription(await useSquareClient(event), customerId, ids, allowedSubscriptionId)
}
