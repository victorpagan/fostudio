// Runs once per session to ensure the customer record and Square link exist.
// Uses useState so it only fires on the first navigation, not every page change.
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return

  const bootstrapped = useState<boolean>('customer:bootstrapped', () => false)
  if (bootstrapped.value) return

  try {
    await $fetch('/api/account/bootstrap', { method: 'POST', body: {} })
    bootstrapped.value = true
  } catch {
    // Non-blocking: dashboard still renders; missing profile fields handled gracefully.
    // Do NOT set bootstrapped = true on failure so it retries next navigation.
  }
})
