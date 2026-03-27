import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

const bodySchema = z.object({
  criticalEnabled: z.coerce.boolean().default(true),
  nonCriticalEnabled: z.coerce.boolean().default(false)
})

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const supabase = await serverSupabaseClient(event)
  const db = supabase as any

  const { error } = await db
    .from('mail_user_preferences')
    .upsert([{
      user_id: user.sub,
      critical_enabled: body.criticalEnabled,
      non_critical_enabled: body.nonCriticalEnabled
    }], { onConflict: 'user_id' })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
