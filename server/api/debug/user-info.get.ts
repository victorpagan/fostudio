// File: server/api/debug/user-info.get.ts
// Debug endpoint to check current user info and role
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch((err) => {
    console.error('Failed to get user:', err.message)
    return null
  })

  if (!user) {
    return { authenticated: false, user: null }
  }

  const role = (user as any)?.user_metadata?.role ?? (user as any)?.app_metadata?.role as string | undefined
  const isAdmin = role === 'admin' || role === 'service'

  return {
    authenticated: true,
    user_id: user.sub,
    email: user.email,
    role,
    isAdmin,
    fullUser: user
  }
})
