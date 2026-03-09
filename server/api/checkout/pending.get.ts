import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

type PendingSessionRow = {
  token: string
  return_to: string | null
  claimed_by_user_id: string | null
  claimed_membership_id: string | null
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { pending: null }

  const supabase = serverSupabaseServiceRole(event)
  const { data: rowsRaw, error } = await supabase
    .from('membership_checkout_sessions')
    .select('token,return_to,claimed_by_user_id,claimed_membership_id')
    .ilike('guest_email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const rows = (rowsRaw ?? []) as PendingSessionRow[]
  const match = rows.find(row => !row.claimed_by_user_id || row.claimed_by_user_id === user.sub)
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

