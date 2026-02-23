import type { Database } from '~/types/supabase' // adjust path

export default defineNuxtRouteMiddleware(async (to) => {
  const user = useSupabaseUser()
  if (!user.value) {
    // let auth middleware handle it (or send to login here)
    return
  }

  const supabase = useSupabaseClient<Database>()

  // Check membership status
  const { data, error } = await supabase
    .from('memberships')
    .select('status,tier,cadence')
    .eq('user_id', user.value.id)
    .maybeSingle()

  if (error) {
    // Fail closed: require membership if membership lookup fails
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}`)
  }

  const status = (data?.status || '').toLowerCase()

  // Treat only "active" as bookable
  if (status !== 'active') {
    return navigateTo(`/memberships?returnTo=${encodeURIComponent(to.fullPath)}`)
  }
})
