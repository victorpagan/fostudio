import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const { data, error } = await db
    .from('lock_permanent_codes')
    .select('id,label,slot_number,code,active,last_synced_at,last_sync_status,last_sync_error,created_at,updated_at')
    .order('active', { ascending: false })
    .order('slot_number', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return {
    codes: data ?? []
  }
})
