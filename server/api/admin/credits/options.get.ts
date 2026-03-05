import { requireServerAdmin } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as any

  const { data, error } = await db
    .from('credit_pricing_options')
    .select(`
      id,
      key,
      label,
      description,
      credits,
      base_price_cents,
      sale_price_cents,
      sale_starts_at,
      sale_ends_at,
      active,
      sort_order,
      square_item_id,
      square_variation_id,
      metadata,
      created_at,
      updated_at
    `)
    .order('sort_order', { ascending: true })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { options: data ?? [] }
})
