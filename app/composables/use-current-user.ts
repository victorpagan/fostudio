/**
 * useCurrentUser — shared composable for auth user + role awareness.
 *
 * Role is read from Supabase's app_metadata (set server-side via Admin API
 * or via DB trigger/RLS). Current roles:
 *   - 'admin'   — full admin access, bypasses membership guards
 *   - 'service' — service account, typically API-only
 *   - (none)    — standard member
 *
 * Usage:
 *   const { user, role, isAdmin, isService, isMember } = useCurrentUser()
 */
export const useCurrentUser = createSharedComposable(() => {
  const user = useSupabaseUser()

  const role = computed<string | null>(() => {
    if (!user.value) return null
    // app_metadata is set by Supabase Admin API / triggers, not by the client
    return (user.value.app_metadata?.role as string | undefined) ?? null
  })

  const isAdmin = computed(() => role.value === 'admin')
  const isService = computed(() => role.value === 'service')
  // Members are authenticated non-service, non-admin users
  const isMember = computed(() => !!user.value && !isAdmin.value && !isService.value)

  const displayName = computed(() => {
    if (!user.value) return null
    const meta = user.value.user_metadata as Record<string, string> | undefined
    if (meta?.first_name) return `${meta.first_name} ${meta.last_name ?? ''}`.trim()
    return user.value.email ?? null
  })

  return {
    user,
    role,
    isAdmin,
    isService,
    isMember,
    displayName
  }
})
