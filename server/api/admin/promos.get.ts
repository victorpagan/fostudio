import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const { data, error } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { promos: data ?? [] }
})
