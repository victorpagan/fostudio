import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  membershipId: z.string().uuid().optional()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse((await readBody(event).catch(() => ({}))) ?? {})

  const { data: backfilled, error: backfillErr } = await supabase.rpc('backfill_membership_credit_grants', {
    p_membership_id: body.membershipId ?? null
  })

  if (backfillErr) {
    throw createError({ statusCode: 500, statusMessage: backfillErr.message })
  }

  const { data: processed, error: processErr } = await supabase.rpc('process_due_membership_credit_grants', {
    p_limit: 200
  })

  if (processErr) {
    throw createError({ statusCode: 500, statusMessage: processErr.message })
  }

  return {
    backfilled: backfilled ?? 0,
    processed: Array.isArray(processed) ? (processed[0] ?? null) : null
  }
})
