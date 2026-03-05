import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  userId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional().default(100)
})

type TopupSessionRow = {
  id: string
  user_id: string
  membership_id: string | null
  credits: number
  amount_cents: number
  status: string
  payment_link_id: string | null
  order_template_id: string | null
  ledger_entry_id: string | null
  metadata?: Record<string, unknown> | null
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const body = bodySchema.parse(await readBody(event).catch(() => ({})))
  const square = await useSquareClient(event)

  let query = supabase
    .from('credit_topup_sessions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(body.limit)

  if (body.userId) query = query.eq('user_id', body.userId)

  const { data: pendingRows, error: pendingErr } = await query
  if (pendingErr) throw createError({ statusCode: 500, statusMessage: pendingErr.message })

  let processed = 0
  let stillPending = 0
  let failed = 0

  for (const row of (pendingRows ?? []) as TopupSessionRow[]) {
    try {
      let orderId = row.order_template_id
      if (!orderId && row.payment_link_id) {
        const linkRes = await square.checkout.paymentLinks.get({ id: row.payment_link_id } as never)
        const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
        orderId = readString(paymentLink, 'orderId', 'order_id')
      }

      if (!orderId) {
        stillPending += 1
        continue
      }

      const orderRes = await square.orders.get({ orderId } as never)
      const order = (orderRes as { order?: Record<string, unknown> | null }).order ?? null
      const orderState = readString(order, 'state')?.toUpperCase()
      if (orderState !== 'COMPLETED') {
        stillPending += 1
        continue
      }

      const { data: existingLedger } = row.ledger_entry_id
        ? await supabase
            .from('credits_ledger')
            .select('id')
            .eq('id', row.ledger_entry_id)
            .maybeSingle()
        : { data: null as { id: string } | null }

      let ledgerEntryId = existingLedger?.id ?? null
      if (!ledgerEntryId) {
        const optionLabel = readString(row.metadata, 'option_label', 'optionLabel')
        const optionKey = readString(row.metadata, 'option_key', 'optionKey')
        const { data: insertedLedger, error: ledgerErr } = await supabase
          .from('credits_ledger')
          .insert({
            user_id: row.user_id,
            membership_id: row.membership_id,
            delta: row.credits,
            reason: 'topoff',
            external_ref: orderId,
            metadata: {
              source: 'admin_reconcile_topup',
              topup_session_id: row.id,
              amount_cents: row.amount_cents,
              option_label: optionLabel,
              option_key: optionKey
            }
          })
          .select('id')
          .single()

        if (ledgerErr || !insertedLedger) {
          failed += 1
          continue
        }
        ledgerEntryId = insertedLedger.id
      }

      const { error: updateErr } = await supabase
        .from('credit_topup_sessions')
        .update({
          status: 'processed',
          ledger_entry_id: ledgerEntryId,
          order_template_id: orderId,
          paid_at: new Date().toISOString()
        })
        .eq('id', row.id)

      if (updateErr) {
        failed += 1
        continue
      }

      processed += 1
    } catch {
      failed += 1
    }
  }

  return {
    ok: true,
    scanned: pendingRows?.length ?? 0,
    processed,
    stillPending,
    failed
  }
})
