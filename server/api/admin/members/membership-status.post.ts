import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  membershipId: z.string().uuid(),
  status: z.enum(['pending_checkout', 'active', 'past_due', 'canceled'])
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { data: currentMembership, error: currentErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('id', body.membershipId)
    .maybeSingle()

  if (currentErr) throw createError({ statusCode: 500, statusMessage: currentErr.message })
  if (!currentMembership) throw createError({ statusCode: 404, statusMessage: 'Membership not found' })

  const nextCanceledAt = body.status === 'canceled'
    ? new Date().toISOString()
    : null

  const { data, error } = await supabase
    .from('memberships')
    .update({
      status: body.status,
      canceled_at: nextCanceledAt
    })
    .eq('id', body.membershipId)
    .select('id,status,canceled_at')
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { membership: data }
})
