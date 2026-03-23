import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

type PendingSessionRow = {
  token: string
  return_to: string | null
  claimed_by_user_id: string | null
  claimed_membership_id: string | null
  paid_at: string | null
  square_subscription_id: string | null
  created_at: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { pending: null }

  const supabase = serverSupabaseServiceRole(event)

  const { data: membershipRow, error: membershipErr } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.sub)
    .in('status', ['active', 'past_due'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (membershipRow?.status) {
    return { pending: null }
  }

  const { data: rowsRaw, error } = await supabase
    .from('membership_checkout_sessions')
    .select('token,return_to,claimed_by_user_id,claimed_membership_id,paid_at,square_subscription_id,created_at')
    .ilike('guest_email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rows = (rowsRaw ?? []) as PendingSessionRow[]
  const candidates = rows.filter((row) => {
    const claimOwnerMatch = !row.claimed_by_user_id || row.claimed_by_user_id === user.sub
    const notClaimed = !row.claimed_membership_id
    return claimOwnerMatch && notClaimed
  })
  if (!candidates.length) return { pending: null }

  const match = [...candidates].sort((left, right) => {
    const leftPaid = Boolean(left.paid_at || left.square_subscription_id)
    const rightPaid = Boolean(right.paid_at || right.square_subscription_id)
    if (leftPaid !== rightPaid) return rightPaid ? 1 : -1

    const leftTs = left.created_at ? Date.parse(left.created_at) : Number.NaN
    const rightTs = right.created_at ? Date.parse(right.created_at) : Number.NaN
    const leftMs = Number.isNaN(leftTs) ? 0 : leftTs
    const rightMs = Number.isNaN(rightTs) ? 0 : rightTs
    return rightMs - leftMs
  })[0]

  if (!match) return { pending: null }

  const returnTo = typeof match.return_to === 'string' && match.return_to.startsWith('/')
    ? match.return_to
    : '/dashboard/membership'

  return {
    pending: {
      token: match.token,
      returnTo
    }
  }
})
