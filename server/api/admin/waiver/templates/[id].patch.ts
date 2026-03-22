import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import type { Json } from '~~/app/types/database.types'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().min(50).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const { id } = paramsSchema.parse(event.context.params)
  const body = bodySchema.parse(await readBody(event))

  if (!body.title && !body.body && body.metadata === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'No changes provided.' })
  }

  const { data: existing, error: existingErr } = await supabase
    .from('waiver_templates')
    .select('id,is_active')
    .eq('id', id)
    .maybeSingle()

  if (existingErr) throw createError({ statusCode: 500, statusMessage: `Failed to load waiver template: ${existingErr.message}` })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Waiver template not found.' })
  if (existing.is_active) {
    throw createError({ statusCode: 409, statusMessage: 'Active template is immutable. Create a new draft to make changes.' })
  }

  const patch: Record<string, unknown> = {}
  if (body.title) patch.title = body.title
  if (body.body) patch.body = body.body
  if (body.metadata !== undefined) patch.metadata = JSON.parse(JSON.stringify(body.metadata)) as Json

  const { data, error } = await supabase
    .from('waiver_templates')
    .update(patch)
    .eq('id', id)
    .select('id,version,title,body,metadata,is_active,published_at,created_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: `Failed to update waiver draft: ${error.message}` })

  return { template: data }
})
