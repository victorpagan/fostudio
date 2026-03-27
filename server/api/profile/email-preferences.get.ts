import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type MailUserPreferencesRow = {
  critical_enabled: boolean
  non_critical_enabled: boolean
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const supabase = await serverSupabaseClient(event)
  const db = supabase as any

  const { data, error } = await db
    .from('mail_user_preferences')
    .select('critical_enabled,non_critical_enabled')
    .eq('user_id', user.sub)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const row = (data ?? null) as MailUserPreferencesRow | null
  return {
    preferences: {
      criticalEnabled: row?.critical_enabled ?? true,
      nonCriticalEnabled: row?.non_critical_enabled ?? false
    }
  }
})
