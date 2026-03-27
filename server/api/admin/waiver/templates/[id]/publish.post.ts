import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const paramsSchema = z.object({
  id: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const { id } = paramsSchema.parse(event.context.params)

  const { data: target, error: targetErr } = await supabase
    .from('waiver_templates')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (targetErr) throw createError({ statusCode: 500, statusMessage: `Failed to load waiver template: ${targetErr.message}` })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'Waiver template not found.' })

  const nowIso = new Date().toISOString()

  const { error: deactivateErr } = await supabase
    .from('waiver_templates')
    .update({ is_active: false })
    .eq('is_active', true)
    .neq('id', id)

  if (deactivateErr) {
    throw createError({ statusCode: 500, statusMessage: `Failed to deactivate active waiver template: ${deactivateErr.message}` })
  }

  const { data, error } = await supabase
    .from('waiver_templates')
    .update({
      is_active: true,
      published_at: nowIso,
      published_by: user.sub
    })
    .eq('id', id)
    .select('id,version,title,body,metadata,is_active,published_at,created_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: `Failed to publish waiver template: ${error.message}` })

  return { template: data }
})
