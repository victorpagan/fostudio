/**
 * membership-required.ts
 * Requires active membership where the route demands it, otherwise permits
 * authenticated accounts with credits. Admins bypass member guards.
 */
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) return // let auth middleware handle redirect

  const normalizeRole = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toLowerCase()
    return normalized || null
  }

  // Admins always pass through
  const role = normalizeRole(user.value.app_metadata?.user_role)
    ?? normalizeRole(user.value.app_metadata?.role)
    ?? null
  if (role === 'admin' || role === 'service') return

  const supabase = useSupabaseClient()

  const { data, error } = await supabase
    .from('memberships')
    .select('status, tier, cadence, current_period_end, canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  if (error) {
    // Fail closed without presenting an unknown account as a guest.
    console.error('[membership-required] DB error:', error.message)
    return navigateTo(`/dashboard/membership?returnTo=${encodeURIComponent(to.fullPath)}&reason=error`)
  }

  const membershipState = resolveMembershipUiState(data)
  if (membershipState === 'active') return

  // Workshop booking is an active-membership benefit. Guest credits do not
  // grant access even though they can unlock other member-dashboard routes.
  if (to.path === '/dashboard/workshops') {
    return navigateTo(`/dashboard/membership?returnTo=${encodeURIComponent(to.fullPath)}&reason=workshop`)
  }

  const { data: balanceRow, error: balanceErr } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  if (balanceErr) {
    console.error('[membership-required] credit_balance error:', balanceErr.message)
    return navigateTo(`/dashboard/membership?returnTo=${encodeURIComponent(to.fullPath)}&reason=error`)
  }

  const remainingCredits = Number(balanceRow?.balance ?? 0)
  if (remainingCredits <= 0) {
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}`)
  }
})
