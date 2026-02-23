// File: server/api/waitlist.post.ts
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  tier: z.enum(['creator', 'pro', 'studio_plus'])
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid waitlist payload' })
  }

  // TODO: store in DB (Supabase) or send notification
  // await supabase.from('waitlist').insert({ ...parsed.data })

  return { ok: true }
})
