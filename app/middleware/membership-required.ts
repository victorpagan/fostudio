/**
 * membership-required.ts
 * Ensures the user has an active membership before accessing protected pages.
 * Admins bypass this check so they can access all dashboard pages.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) return // let auth middleware handle redirect

  // Admins always pass through
  const role = (user.value.user_metadata?.role as string | undefined)
    ?? (user.value.app_metadata?.role as string | undefined)
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

  if (status !== 'active') {
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}`)
  }
})
