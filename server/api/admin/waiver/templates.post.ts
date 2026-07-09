import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { sanitizeRichHtml } from '~~/app/utils/sanitizeHtml'
import type { Json } from '~~/app/types/database.types'

const bodySchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))
  const sanitizedBody = sanitizeRichHtml(body.body).trim()
  if (!sanitizedBody.replace(/<[^>]*>/g, '').trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Waiver body must contain readable text.' })
  }
  const metadata = JSON.parse(JSON.stringify(body.metadata ?? {})) as Json

  const { data, error } = await supabase
    .from('waiver_templates')
    .insert({
      title: body.title,
      body: sanitizedBody,
      metadata,
      is_active: false,
      created_by: user.sub
    })
    .select('id,version,title,body,metadata,is_active,published_at,created_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: `Failed to create waiver draft: ${error.message}` })

  return { template: data }
})
