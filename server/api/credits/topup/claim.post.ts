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
  metadata?: Record<string, unknown> | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

async function readBalance(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()

  if (!error) return asNumber(data?.balance) ?? 0

  // Fallback for environments where the view is out of sync.
  const { data: ledgerRows, error: ledgerErr } = await supabase
    .from('credits_ledger')
    .select('delta,expires_at')
    .eq('user_id', userId)

  if (ledgerErr) throw createError({ statusCode: 500, statusMessage: ledgerErr.message })

  const nowMs = Date.now()
  let sum = 0
  for (const row of ledgerRows ?? []) {
    const expiresAt = row?.expires_at ? Date.parse(String(row.expires_at)) : null
    if (expiresAt !== null && !Number.isNaN(expiresAt) && expiresAt <= nowMs) continue
    sum += asNumber(row?.delta) ?? 0
  }
  return sum
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event))
  const supabase = serverSupabaseServiceRole(event)
  const db = supabase as any

  const { data, error } = await db
    .from('credit_topup_sessions')
    .select('*')
    .eq('token', body.token)
    .eq('user_id', user.sub)
    .maybeSingle()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Top-up session not found' })

  const topup = data as TopupSessionRow
  if (topup.status === 'processed') {
    const newBalance = await readBalance(supabase, user.sub)
    return {
      ok: true,
      status: 'processed' as const,
      creditsAdded: asNumber(topup.credits) ?? null,
      newBalance
    }
  }
  if (topup.status === 'failed' || topup.status === 'expired') {
    return {
      ok: false,
      status: 'failed' as const,
      message: 'This top-up session is no longer valid. Please start a new purchase.'
    }
  }

  let orderId = topup.order_template_id
  const square = await useSquareClient(event)

  if (!orderId && topup.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: topup.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    orderId = readString(paymentLink, 'orderId', 'order_id')
  }

  if (!orderId) {
    return {
      ok: false,
      status: 'pending' as const,
      message: 'Payment details are still syncing. Please retry in a moment.'
    }
  }

  const orderRes = await square.orders.get({ orderId } as never)
  const order = (orderRes as { order?: Record<string, unknown> | null }).order ?? null
  const orderState = readString(order, 'state')?.toUpperCase()
  if (orderState !== 'COMPLETED') {
    return {
      ok: false,
      status: 'pending' as const,
      message: 'Top-up payment is not completed yet.',
      orderState: orderState ?? null
    }
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
    const optionLabel = readString(topup.metadata, 'option_label', 'optionLabel')
    const optionKey = readString(topup.metadata, 'option_key', 'optionKey')
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
          amount_cents: topup.amount_cents,
          option_label: optionLabel,
          option_key: optionKey
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
  const { error: updateErr } = await db
    .from('credit_topup_sessions')
    .update({
      status: 'processed',
      ledger_entry_id: ledgerEntryId,
      order_template_id: orderId,
      paid_at: nowIso
    })
    .eq('id', topup.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const newBalance = await readBalance(supabase, user.sub)

  return {
    ok: true,
    status: 'processed' as const,
    creditsAdded: asNumber(topup.credits) ?? null,
    newBalance
  }
})
