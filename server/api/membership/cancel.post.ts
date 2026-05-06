import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { findPendingCancelAction, toRecordArray } from '~~/server/utils/square/subscriptionActions'

type MembershipRow = {
  id: string
  membership_source: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRaw, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,membership_source,billing_provider,billing_subscription_id')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membershipRaw) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  const membership = membershipRaw as unknown as MembershipRow
  if ((membership.membership_source ?? membership.billing_provider ?? '').toLowerCase() === 'manual') {
    throw createError({ statusCode: 409, statusMessage: 'This is an admin-assigned membership. Contact FO Studio to change or end it.' })
  }
  if ((membership.billing_provider ?? '').toLowerCase() !== 'square' || !membership.billing_subscription_id) {
    throw createError({ statusCode: 409, statusMessage: 'This membership is not linked to a managed Square subscription.' })
  }

  const square = await useSquareClient(event)
  await square.subscriptions.cancel({
    subscriptionId: membership.billing_subscription_id
  } as never)

  const refreshedRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
    include: 'actions'
  } as never)
  const refreshed = (refreshedRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  const pendingCancel = findPendingCancelAction(toRecordArray(refreshed?.actions))

  return {
    ok: true,
    effectiveDate: pendingCancel?.effectiveDate ?? null,
    message: 'Cancellation scheduled. Your membership remains active until the end of the current billing cycle.'
  }
})
