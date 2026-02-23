export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) return

  try {
    await $fetch('/api/account/bootstrap', { method: 'POST', body: {} })
  } catch {
    // non-blocking; dashboard can still render, but may have missing profile fields
  }
})
