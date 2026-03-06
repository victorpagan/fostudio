import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { findPendingCancelAction, normalizeSquareActionType, toRecordArray } from '~~/server/utils/square/subscriptionActions'

type MembershipRow = {
  id: string
  billing_provider: string | null
  billing_subscription_id: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRaw, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,billing_provider,billing_subscription_id')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membershipRaw) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  const membership = membershipRaw as MembershipRow
  if ((membership.billing_provider ?? '').toLowerCase() !== 'square' || !membership.billing_subscription_id) {
    throw createError({ statusCode: 409, statusMessage: 'This membership is not linked to a managed Square subscription.' })
  }

  const square = await useSquareClient(event)
  const currentRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
    include: 'actions'
  } as never)
  const current = (currentRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  const actions = toRecordArray(current?.actions)

  let undoCount = 0
  for (const action of actions) {
    if (normalizeSquareActionType(action.type) !== 'CANCEL') continue
    const actionId = typeof action.id === 'string' ? action.id : null
    if (!actionId) continue
    await square.subscriptions.deleteAction({
      subscriptionId: membership.billing_subscription_id,
      actionId
    } as never)
    undoCount += 1
  }

  if (undoCount === 0) {
    throw createError({ statusCode: 409, statusMessage: 'No scheduled cancellation was found.' })
  }

  const refreshedRes = await square.subscriptions.get({
    subscriptionId: membership.billing_subscription_id,
    include: 'actions'
  } as never)
  const refreshed = (refreshedRes as { subscription?: Record<string, unknown> | null }).subscription ?? null
  const pendingCancel = findPendingCancelAction(toRecordArray(refreshed?.actions))

  return {
    ok: true,
    pendingCancel: Boolean(pendingCancel),
    message: 'Scheduled cancellation removed.'
  }
})
