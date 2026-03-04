import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { createError } from 'h3'
import type { H3Event } from 'h3'

export type RoleCarrier = {
  sub?: string | null
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}

function normalizeRole(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'service'
}

export function readUserRole(user: RoleCarrier | null | undefined): string | null {
  if (!user) return null

  const userRole = normalizeRole(user.user_metadata?.role)
  if (userRole) return userRole

  const appRole = normalizeRole(user.app_metadata?.role)
  if (appRole) return appRole

  return null
}

export async function resolveServerUserRole(event: H3Event, fallbackUser: RoleCarrier | null | undefined) {
  if (!fallbackUser?.sub) {
    const role = readUserRole(fallbackUser)
    return {
      role,
      isAdmin: isAdminRole(role)
    }
  }

  try {
    const supabase = serverSupabaseServiceRole(event)
    const { data, error } = await supabase.auth.admin.getUserById(fallbackUser.sub)

    if (!error && data.user) {
      const role = readUserRole(data.user as RoleCarrier)
      return {
        role,
        isAdmin: isAdminRole(role)
      }
    }
  } catch {
    // Fall back to the current token claims if the live lookup fails.
  }

  const role = readUserRole(fallbackUser)
  return {
    role,
    isAdmin: isAdminRole(role)
  }
}

export async function requireServerAdmin(event: H3Event) {
  const user = await serverSupabaseUser(event).catch(() => null)

  if (!user?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const { isAdmin, role } = await resolveServerUserRole(event, user)

  if (!isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  return {
    user,
    role,
    supabase: serverSupabaseServiceRole(event)
  }
}
