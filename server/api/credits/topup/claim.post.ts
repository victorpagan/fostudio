import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'

const bodySchema = z.object({
  token: z.string().uuid()
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
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from('credit_topup_sessions')
    .select('*')
    .eq('token', body.token)
    .eq('user_id', user.sub)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Top-up session not found' })

  const topup = data as TopupSessionRow
  if (topup.status === 'processed') {
    return { ok: true, status: 'processed' as const }
  }

  let orderId = topup.order_template_id
  const square = await useSquareClient(event)

  if (!orderId && topup.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: topup.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    orderId = readString(paymentLink, 'orderId', 'order_id')
  }

  if (!orderId) {
    throw createError({ statusCode: 409, statusMessage: 'Payment details are still syncing. Please retry in a moment.' })
  }

  const orderRes = await square.orders.get({ orderId } as never)
  const order = (orderRes as { order?: Record<string, unknown> | null }).order ?? null
  const orderState = readString(order, 'state')?.toUpperCase()
  if (orderState !== 'COMPLETED') {
    throw createError({ statusCode: 409, statusMessage: 'Top-up payment is not completed yet.' })
  }

  const { data: existingLedger } = topup.ledger_entry_id
    ? await supabase
        .from('credits_ledger')
        .select('id')
        .eq('id', topup.ledger_entry_id)
        .maybeSingle()
    : { data: null as { id: string } | null }

  let ledgerEntryId = existingLedger?.id ?? null
  if (!ledgerEntryId) {
    const { data: insertedLedger, error: ledgerErr } = await supabase
      .from('credits_ledger')
      .insert({
        user_id: user.sub,
        membership_id: topup.membership_id,
        delta: topup.credits,
        reason: 'topoff',
        external_ref: orderId,
        metadata: {
          source: 'dashboard_topup',
          topup_session_id: topup.id,
          amount_cents: topup.amount_cents
        }
      })
      .select('id')
      .single()

    if (ledgerErr || !insertedLedger) {
      throw createError({ statusCode: 500, statusMessage: ledgerErr?.message ?? 'Failed to mint credits' })
    }
    ledgerEntryId = insertedLedger.id
  }

  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('credit_topup_sessions')
    .update({
      status: 'processed',
      ledger_entry_id: ledgerEntryId,
      order_template_id: orderId,
      paid_at: nowIso
    })
    .eq('id', topup.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const { data: balanceRow } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.sub)
    .maybeSingle()

  return {
    ok: true,
    status: 'processed' as const,
    creditsAdded: topup.credits,
    newBalance: balanceRow?.balance ?? null
  }
})
