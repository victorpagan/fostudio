import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const bodySchema = z.object({
  userId: z.string().uuid(),
  membershipId: z.string().uuid().optional().nullable(),
  delta: z.number().refine(value => value !== 0, 'Delta must be non-zero'),
  reason: z.string().min(2).max(80).default('admin_adjustment'),
  note: z.string().max(240).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
})

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event))

  const { data: entry, error: ledgerErr } = await supabase
    .from('credits_ledger')
    .insert({
      user_id: body.userId,
      membership_id: body.membershipId ?? null,
      delta: body.delta,
      reason: body.reason,
      external_ref: null,
      expires_at: body.expiresAt ?? null,
      metadata: body.note
        ? {
            source: 'admin_adjustment',
            note: body.note
          }
        : {
            source: 'admin_adjustment'
          }
    })
    .select('id,delta,created_at')
    .single()

  if (ledgerErr || !entry) {
    throw createError({ statusCode: 500, statusMessage: ledgerErr?.message ?? 'Failed to add credit adjustment' })
  }

  const { data: balanceRow, error: balanceErr } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', body.userId)
    .maybeSingle()

  if (balanceErr) throw createError({ statusCode: 500, statusMessage: balanceErr.message })

  return {
    ok: true,
    entry,
    balance: balanceRow?.balance ?? null
  }
})
