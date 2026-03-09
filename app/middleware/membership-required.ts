/**
 * membership-required.ts
 * Ensures the user has an active membership before accessing protected pages.
 * Admins bypass this check so they can access all dashboard pages.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) return // let auth middleware handle redirect

  const normalizeRole = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toLowerCase()
    return normalized || null
  }

  // Admins always pass through
  const role = normalizeRole(user.value.user_metadata?.role)
    ?? normalizeRole(user.value.app_metadata?.role)
    ?? null
  if (role === 'admin' || role === 'service') return

  const supabase = useSupabaseClient()

  const { data, error } = await supabase
    .from('memberships')
    .select('status, tier, cadence')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  if (error) {
    // Fail closed on DB errors — send to memberships with context
    console.error('[membership-required] DB error:', error.message)
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}&reason=error`)
  }

  const status = (data?.status ?? '').toLowerCase()

  if (status === 'active') return

  const { data: balanceRow, error: balanceErr } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  if (balanceErr) {
    console.error('[membership-required] credit_balance error:', balanceErr.message)
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}&reason=error`)
  }

  const remainingCredits = Number(balanceRow?.balance ?? 0)
  if (remainingCredits <= 0) {
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}`)
  }
})
