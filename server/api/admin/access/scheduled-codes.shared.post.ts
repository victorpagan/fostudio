import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  id: z.string().uuid(),
  shared: z.boolean()
})

export default defineEventHandler(async (event) => {
  const { user, supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const body = bodySchema.parse(await readBody(event))
  const nowIso = new Date().toISOString()

  const { data: existing, error: readError } = await db
    .from('booking_external_access')
    .select('id,booking_id,delivery_status')
    .eq('id', body.id)
    .maybeSingle()

  if (readError) throw createError({ statusCode: 500, statusMessage: readError.message })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Scheduled access record not found.' })

  if (body.shared) {
    const { data: code, error: codeError } = await db
      .from('booking_access_codes')
      .select('pin_code,status')
      .eq('booking_id', existing.booking_id)
      .eq('code_type', 'guest')
      .maybeSingle()
    if (codeError) throw createError({ statusCode: 500, statusMessage: codeError.message })
    if (!code?.pin_code || !['scheduled', 'active'].includes(String(code.status).toLowerCase())) {
      throw createError({ statusCode: 409, statusMessage: 'Generate an active or scheduled PIN before marking it shared.' })
    }
  }

  const { error: updateError } = await db
    .from('booking_external_access')
    .update({
      delivery_status: body.shared ? 'shared' : 'pending',
      shared_at: body.shared ? nowIso : null,
      shared_by: body.shared ? user.sub : null,
      updated_by: user.sub,
      updated_at: nowIso
    })
    .eq('id', body.id)

  if (updateError) throw createError({ statusCode: 500, statusMessage: updateError.message })

  return { ok: true }
})
