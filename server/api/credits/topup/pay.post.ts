import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import { useSquareClient } from '~~/server/utils/square'
import { getServerConfig } from '~~/server/utils/config/secret'
import { ensureSquareCustomerForUser } from '~~/server/utils/square/customer'
import { buildExpiryIsoFromDays, resolveTopoffCreditExpiryDays } from '~~/server/utils/credits/buckets'

const bodySchema = z.object({
  token: z.string().uuid(),
  sourceId: z.string().min(10).optional(),
  cardId: z.string().min(5).optional()
}).refine(value => Boolean(value.sourceId) || Boolean(value.cardId), {
  message: 'sourceId or cardId is required'
})

type TopupSessionRow = {
  id: string
  user_id: string
  membership_id: string | null
  credits: number
  amount_cents: number
  status: string
  ledger_entry_id: string | null
  metadata?: Record<string, unknown> | null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readSquareErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (!error || typeof error !== 'object') return 'Square request failed'
  const details = (error as { errors?: unknown }).errors
  if (!Array.isArray(details) || details.length === 0) return 'Square request failed'
  const first = details[0]
  if (!first || typeof first !== 'object') return 'Square request failed'
  const detail = (first as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  const code = (first as { code?: unknown }).code
  if (typeof code === 'string' && code.trim()) return code.trim()
  return 'Square request failed'
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

  const { data: rawSession, error: sessionErr } = await supabase
    .from('credit_topup_sessions')
    .select('*')
    .eq('token', body.token)
    .eq('user_id', user.sub)
    .maybeSingle()

  if (sessionErr) throw createError({ statusCode: 500, statusMessage: sessionErr.message })
  if (!rawSession) throw createError({ statusCode: 404, statusMessage: 'Top-up session not found' })

  const topup = rawSession as TopupSessionRow
  const status = (topup.status ?? '').toLowerCase()
  if (status === 'processed') {
    return {
      ok: true,
      status: 'processed',
      creditsAdded: asNumber(topup.credits) ?? 0,
      newBalance: await readBalance(supabase, user.sub)
    }
  }
  if (status !== 'pending' && status !== 'expired') {
    throw createError({ statusCode: 409, statusMessage: 'This top-up session is no longer valid.' })
  }

  const { data: membership, error: membershipErr } = await supabase
    .from('memberships')
    .select('id,status')
    .eq('user_id', user.sub)
    .maybeSingle()
  if (membershipErr) throw createError({ statusCode: 500, statusMessage: membershipErr.message })
  if (!membership || (membership.status ?? '').toLowerCase() !== 'active') {
    throw createError({
      statusCode: 403,
      statusMessage: 'An active membership is required before purchasing additional credits.'
    })
  }

  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: user.sub,
    email: user.email ?? null
  })
  if (!squareCustomerId) throw createError({ statusCode: 503, statusMessage: 'Could not initialize Square customer.' })

  const square = await useSquareClient(event)
  const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
  const idempotencyBase = `ctu:${topup.id}`

  let paymentSourceId = body.cardId?.trim() || null
  if (paymentSourceId) {
    const listRes = await square.cards.list({ customerId: squareCustomerId, includeDisabled: false } as never)
    const cards = Array.isArray((listRes as { cards?: unknown }).cards)
      ? ((listRes as { cards?: Array<Record<string, unknown>> }).cards ?? [])
      : []
    const ownsCard = cards.some(card => readString(card, 'id') === paymentSourceId)
    if (!ownsCard) throw createError({ statusCode: 400, statusMessage: 'Selected card is not available.' })
  } else {
    paymentSourceId = body.sourceId?.trim() || null
  }

  if (!paymentSourceId) throw createError({ statusCode: 400, statusMessage: 'Card token is required.' })

  let paymentId: string | null = null
  try {
    const payRes = await square.payments.create({
      idempotencyKey: `${idempotencyBase}:p`,
      sourceId: paymentSourceId,
      customerId: body.cardId ? squareCustomerId : undefined,
      autocomplete: true,
      locationId,
      amountMoney: {
        amount: BigInt(Math.round(Number(topup.amount_cents))),
        currency: 'USD'
      },
      note: `FO Studio credit top-up (${topup.credits} credits)`,
      referenceId: topup.id
    } as never)
    const payment = (payRes as { payment?: Record<string, unknown> | null }).payment ?? null
    const paymentStatus = readString(payment, 'status')?.toUpperCase() ?? null
    if (paymentStatus !== 'COMPLETED') {
      throw createError({ statusCode: 402, statusMessage: 'Payment not completed.' })
    }
    paymentId = readString(payment, 'id')
    if (!paymentId) throw new Error('Square did not return a payment id')
  } catch (error) {
    throw createError({ statusCode: 402, statusMessage: `Card charge failed: ${readSquareErrorMessage(error)}` })
  }

  let ledgerEntryId = topup.ledger_entry_id
  if (!ledgerEntryId) {
    const topoffExpiryDays = await resolveTopoffCreditExpiryDays(supabase, user.sub, topup.membership_id)
    const optionLabel = readString(topup.metadata, 'option_label', 'optionLabel')
    const optionKey = readString(topup.metadata, 'option_key', 'optionKey')
    const { data: insertedLedger, error: ledgerErr } = await supabase
      .from('credits_ledger')
      .insert({
        user_id: user.sub,
        membership_id: topup.membership_id,
        delta: topup.credits,
        reason: 'topoff',
        external_ref: paymentId,
        expires_at: buildExpiryIsoFromDays(topoffExpiryDays),
        metadata: {
          source: 'dashboard_topup',
          topup_session_id: topup.id,
          amount_cents: topup.amount_cents,
          option_label: optionLabel,
          option_key: optionKey,
          topoff_credit_expiry_days: topoffExpiryDays,
          payment_id: paymentId
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
      order_template_id: paymentId,
      paid_at: nowIso,
      metadata: {
        ...(topup.metadata ?? {}),
        payment_method: 'square_web_payments',
        payment_id: paymentId
      }
    })
    .eq('id', topup.id)

  if (updateErr) throw createError({ statusCode: 500, statusMessage: updateErr.message })

  return {
    ok: true,
    status: 'processed',
    creditsAdded: asNumber(topup.credits) ?? 0,
    newBalance: await readBalance(supabase, user.sub)
  }
})
