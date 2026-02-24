// Runs once per session to ensure the customer record and Square link exist.
// Uses useState so it only fires on the first navigation, not every page change.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineNuxtRouteMiddleware(async () => {
  // Skip during SSR — the session cookie is not reliably available server-side
  // for this middleware path. The login/signup pages call bootstrap directly
  // after auth so the cookie is guaranteed to be set by then.
  if (import.meta.server) return

  const user = useSupabaseUser()

  // Guard: user must be fully loaded with a valid UUID before hitting the server.
  // Prevents the "invalid input syntax for type uuid: undefined" error that occurs
  // when the middleware fires before the Supabase session has fully hydrated.
  if (!user.value?.id || !UUID_RE.test(user.value.id)) return

  const bootstrapped = useState<boolean>('customer:bootstrapped', () => false)
  if (bootstrapped.value) return

  try {
    await $fetch('/api/account/bootstrap', {
      method: 'POST',
      body: { email: user.value.email ?? undefined }
    })
    bootstrapped.value = true
  } catch {
    // Non-blocking: dashboard still renders; missing profile fields handled gracefully.
    // Do NOT set bootstrapped = true on failure so it retries next navigation.
  }
})
