import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().max(200).optional().nullable(),
  active: z.boolean().optional().default(true)
})

export default defineEventHandler(async (event) => {
  const { supabase, user } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  if (new Date(body.endTime).getTime() <= new Date(body.startTime).getTime()) {
    throw createError({ statusCode: 400, statusMessage: 'End time must be after start time' })
  }

  const payload = {
    start_time: body.startTime,
    end_time: body.endTime,
    reason: body.reason?.trim() || null,
    active: body.active
  }

  if (body.id) {
    const { data, error } = await supabase
      .from('calendar_blocks')
      .update(payload)
      .eq('id', body.id)
      .select('id,start_time,end_time,reason,active')
      .single()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return { block: data }
  }

  const { data, error } = await supabase
    .from('calendar_blocks')
    .insert({
      ...payload,
      created_by: user.sub
    })
    .select('id,start_time,end_time,reason,active')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { block: data }
})
