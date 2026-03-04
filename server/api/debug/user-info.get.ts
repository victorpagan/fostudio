// File: server/api/debug/user-info.get.ts
// Debug endpoint to check current user info and role
import { serverSupabaseUser } from '#supabase/server'
import { isAdminRole, readUserRole } from '~~/server/utils/auth'
import type { RoleCarrier } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch((err) => {
    console.error('Failed to get user:', err.message)
    return null
  })

  if (!user) {
    return { authenticated: false, user: null }
  }
  const role = readUserRole(user as RoleCarrier)
  const isAdmin = isAdminRole(role)

  return {
    authenticated: true,
    user_id: user.sub,
    email: user.email,
    role,
    isAdmin,
    fullUser: user
  }
})
