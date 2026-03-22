import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { resolveOrderPaymentState } from '~~/server/utils/square/orderPayment'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'

const bodySchema = z.object({
  token: z.string().uuid().optional(),
  orderId: z.string().min(1).optional()
})

type TopupSessionRow = {
  id: string
  user_id: string
  membership_id: string | null
  holds: number
  amount_cents: number
  status: string
  payment_link_id: string | null
  order_template_id: string | null
  ledger_entry_id: string | null
  created_at?: string | null
  metadata?: Record<string, unknown> | null
}

function normalizeSessionStatus(status: string | null | undefined) {
  return (status ?? '').toLowerCase().trim()
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

async function sendHoldTopupPurchasedMail(params: {
  event: Parameters<typeof sendViaFomailer>[0]
  to: string | null
  userId: string
  membershipId: string | null
  holdsAdded: number | null
  newHoldBalance: number
  amountCents: number | null
  label: string | null
  paymentId: string | null
  customerName: string | null
  customerEmail: string | null
}) {
  const to = typeof params.to === 'string' ? params.to.trim().toLowerCase() : ''
  if (!to) return

  try {
    await sendViaFomailer(params.event, {
      type: 'holds.topupPurchased',
      payload: {
        to,
        userId: params.userId,
        eventType: 'holds.topupPurchased',
        membershipId: params.membershipId,
        holdsAdded: params.holdsAdded,
        newHoldBalance: params.newHoldBalance,
        amountCents: params.amountCents,
        label: params.label,
        paymentId: params.paymentId,
        customerName: params.customerName,
        customerEmail: params.customerEmail
      }
    })
  } catch (error) {
    console.warn('[holds/topup/claim] top-up mail send failed (non-blocking)', {
      userId: params.userId,
      paymentId: params.paymentId,
      message: error instanceof Error ? error.message : String(error)
    })
  }
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  if (!user?.sub) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })

  const body = bodySchema.parse(await readBody(event).catch(() => ({})))
  const supabase = serverSupabaseServiceRole(event)
  const square = await useSquareClient(event)

  const readHoldBalance = async (userId: string) => {
    const { data, error } = await supabase
      .from('hold_balance')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle()

    if (!error) return asNumber(data?.balance) ?? 0

    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from('hold_ledger')
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

  const processSession = async (topup: TopupSessionRow, hintedOrderId?: string | null) => {
    const sessionStatus = normalizeSessionStatus(topup.status)
    if (sessionStatus === 'processed') {
    return {
      ok: true,
      status: 'processed' as const,
      holdsAdded: asNumber(topup.holds) ?? null,
      newHoldBalance: await readHoldBalance(user.sub),
      sessionId: topup.id
    }
  }

  if (sessionStatus === 'failed') {
    return {
      ok: false,
      status: 'failed' as const,
      message: 'This hold purchase is no longer valid. Please start a new purchase.',
      sessionId: topup.id
    }
  }

  let orderId = topup.order_template_id ?? hintedOrderId ?? null
  if (!orderId && topup.payment_link_id) {
    const linkRes = await square.checkout.paymentLinks.get({ id: topup.payment_link_id } as never)
    const paymentLink = (linkRes as { paymentLink?: Record<string, unknown> | null }).paymentLink ?? null
    orderId = readString(paymentLink, 'orderId', 'order_id')
  }

  if (!orderId) {
    return {
      ok: false,
      status: 'pending' as const,
      message: 'Payment details are still syncing. Please retry in a moment.',
      sessionId: topup.id
    }
  }

  const paymentState = await resolveOrderPaymentState({
    square,
    orderId,
    beginTime: topup.created_at ?? null
  })

  if (!paymentState.completed) {
    const nextStatus = sessionStatus === 'expired' ? 'expired' : 'pending'
    await supabase
      .from('hold_topup_sessions')
      .update({
        status: nextStatus,
        metadata: {
          ...(topup.metadata ?? {}),
          last_claim_status: 'pending_order_not_completed',
          last_claim_order_state: paymentState.orderState,
          last_claim_payment_status: paymentState.paymentStatus,
          last_claim_order_id: orderId,
          last_claim_at: new Date().toISOString()
        }
      })
      .eq('id', topup.id)

    return {
      ok: false,
      status: 'pending' as const,
      message: 'Hold payment is not completed yet.',
      sessionId: topup.id
    }
  }

  const { data: existingLedger } = topup.ledger_entry_id
    ? await supabase
        .from('hold_ledger')
        .select('id')
        .eq('id', topup.ledger_entry_id)
        .maybeSingle()
    : { data: null as { id: string } | null }

  let ledgerEntryId = existingLedger?.id ?? null
  if (!ledgerEntryId) {
    const { data: insertedLedger, error: ledgerErr } = await supabase
      .from('hold_ledger')
      .insert({
        user_id: user.sub,
        delta: topup.holds,
        reason: 'topoff',
        external_ref: orderId,
        metadata: {
          source: 'dashboard_hold_topup',
          topup_session_id: topup.id,
          amount_cents: topup.amount_cents,
          label: readString(topup.metadata, 'label')
        }
      })
      .select('id')
      .single()

    if (ledgerErr || !insertedLedger) {
      await supabase
        .from('hold_topup_sessions')
        .update({
          metadata: {
            ...(topup.metadata ?? {}),
            last_claim_status: 'failed_ledger_insert',
            last_claim_error: ledgerErr?.message ?? 'failed_to_mint_holds',
            last_claim_order_id: orderId,
            last_claim_at: new Date().toISOString()
          }
        })
        .eq('id', topup.id)
      throw createError({ statusCode: 500, statusMessage: ledgerErr?.message ?? 'Failed to add holds' })
    }
    ledgerEntryId = insertedLedger.id
  }

  const nowIso = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from('hold_topup_sessions')
    .update({
      status: 'processed',
      ledger_entry_id: ledgerEntryId,
      order_template_id: orderId,
      paid_at: nowIso
    })
    .eq('id', topup.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  const newHoldBalance = await readHoldBalance(user.sub)
  await sendHoldTopupPurchasedMail({
    event,
    to: user.email ?? null,
    userId: user.sub,
    membershipId: topup.membership_id,
    holdsAdded: asNumber(topup.holds) ?? null,
    newHoldBalance,
    amountCents: asNumber(topup.amount_cents),
    label: readString(topup.metadata, 'label'),
    paymentId: orderId,
    customerName: [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(' ').trim() || null,
    customerEmail: user.email ?? null
  })

  return {
      ok: true,
      status: 'processed' as const,
      holdsAdded: asNumber(topup.holds) ?? null,
      newHoldBalance,
      sessionId: topup.id
    }
  }

  if (body.token) {
    const { data, error } = await supabase
      .from('hold_topup_sessions')
      .select('*')
      .eq('token', body.token)
      .eq('user_id', user.sub)
      .maybeSingle()

    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Hold purchase session not found' })
    return processSession(data as TopupSessionRow, body.orderId ?? null)
  }

  const { data: pendingRows, error: pendingErr } = await supabase
    .from('hold_topup_sessions')
    .select('*')
    .eq('user_id', user.sub)
    .in('status', ['pending', 'expired'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (pendingErr) throw createError({ statusCode: 500, statusMessage: pendingErr.message })

  if (!pendingRows?.length) {
    return {
      ok: true,
      status: 'processed' as const,
      holdsAdded: 0,
      newHoldBalance: await readHoldBalance(user.sub),
      message: 'No pending hold purchases found.'
    }
  }

  let firstPendingResult: Record<string, unknown> | null = null
  for (const row of pendingRows as TopupSessionRow[]) {
    const result = await processSession(row, body.orderId ?? null)
    if (result.status === 'processed') return result
    if (!firstPendingResult && result.status === 'pending') firstPendingResult = result as unknown as Record<string, unknown>
  }

  if (firstPendingResult) return firstPendingResult

  return {
    ok: false,
    status: 'pending' as const,
    message: 'Pending hold purchase found, but payment has not settled yet.'
  }
})
