export default defineNuxtRouteMiddleware(() => {
  const { user, isAdmin } = useCurrentUser()

  if (!user.value) return navigateTo('/login')
  if (!isAdmin.value) return navigateTo('/dashboard')
})
