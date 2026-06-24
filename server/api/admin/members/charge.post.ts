import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'
import { getServerConfig } from '~~/server/utils/config/secret'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { useSquareClient } from '~~/server/utils/square'
import { extractSquareCards } from '~~/server/utils/square/cards'
import { ensureSquareCustomerForUser, getPrimaryCustomerRowForUser } from '~~/server/utils/square/customer'
import { sanitizeForJSON } from '~~/server/utils/sanitize'

const MEMBER_CHARGE_EVENT_TYPE = 'billing.memberChargeReceipt'

const bodySchema = z.object({
  userId: z.string().uuid(),
  cardId: z.string().trim().min(5),
  amountCents: z.number().int().positive().max(500_000),
  category: z.enum(['repair', 'damage', 'replacement', 'cleaning', 'other']).default('repair'),
  reason: z.string().trim().min(3).max(240),
  internalNote: z.string().trim().max(1000).optional().nullable(),
  bookingId: z.string().uuid().optional().nullable(),
  incidentId: z.string().uuid().optional().nullable()
})

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string | null
  active: boolean | null
}

type QueryResult<T = Record<string, unknown>> = {
  data?: T | null
  error?: { message: string } | null
}

type QueryBuilder<T = Record<string, unknown>> = {
  select: (columns?: string) => QueryBuilder<T>
  eq: (column: string, value: unknown) => QueryBuilder<T>
  maybeSingle: () => PromiseLike<QueryResult<T>>
  insert: (values: Record<string, unknown>) => QueryBuilder<T>
  update: (values: Record<string, unknown>) => QueryBuilder<T>
  single: () => PromiseLike<QueryResult<T>>
}

type UntypedSupabaseClient = {
  from: <T = Record<string, unknown>>(table: string) => QueryBuilder<T>
}

type MemberChargeAuditRow = Record<string, unknown> & {
  id: string
}

function readString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return null
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
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

function categoryLabel(value: string) {
  if (value === 'repair') return 'Repair'
  if (value === 'damage') return 'Damage'
  if (value === 'replacement') return 'Replacement'
  if (value === 'cleaning') return 'Cleaning'
  return 'Studio charge'
}

function amountDollars(cents: number) {
  return (Number(cents) / 100).toFixed(2)
}

function customerName(customer: { first_name?: string | null, last_name?: string | null, email?: string | null } | null | undefined) {
  const first = String(customer?.first_name ?? '').trim()
  const last = String(customer?.last_name ?? '').trim()
  return [first, last].filter(Boolean).join(' ').trim() || first || 'there'
}

async function resolveTemplateId(supabase: UntypedSupabaseClient) {
  const { data, error } = await supabase
    .from('mail_template_registry')
    .select('event_type,sendgrid_template_id,active')
    .eq('event_type', MEMBER_CHARGE_EVENT_TYPE)
    .maybeSingle()

  if (error) return { templateId: null, inactive: false, error: error.message }
  const row = (data ?? null) as MailTemplateRegistryRow | null
  if (row?.active === false) return { templateId: null, inactive: true, error: null }
  return {
    templateId: String(row?.sendgrid_template_id ?? '').trim() || null,
    inactive: false,
    error: null
  }
}

export default defineEventHandler(async (event) => {
  const { user: adminUser, supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as UntypedSupabaseClient
  const body = bodySchema.parse(await readBody(event))

  const customer = await getPrimaryCustomerRowForUser(event, body.userId)
  if (!customer) throw createError({ statusCode: 404, statusMessage: 'Customer account not found.' })

  const squareCustomerId = await ensureSquareCustomerForUser(event, {
    userId: body.userId,
    email: customer.email,
    firstName: customer.first_name,
    lastName: customer.last_name,
    phone: customer.phone
  })
  if (!squareCustomerId) throw createError({ statusCode: 503, statusMessage: 'Could not initialize Square customer.' })

  const square = await useSquareClient(event)
  const listRes = await square.cards.list({
    customerId: squareCustomerId,
    includeDisabled: false,
    sortOrder: 'ASC'
  } as never)
  const cards = extractSquareCards(listRes)
  const selectedCard = cards.find(card => readString(card, 'id') === body.cardId) ?? null
  if (!selectedCard) throw createError({ statusCode: 400, statusMessage: 'Selected card is not available.' })

  const cardBrand = readString(selectedCard, 'cardBrand', 'card_brand')
  const cardLast4 = readString(selectedCard, 'last4')
  const nowIso = new Date().toISOString()

  const { data: insertedCharge, error: insertErr } = await db
    .from('admin_member_charges')
    .insert({
      member_user_id: body.userId,
      customer_id: customer.id,
      category: body.category,
      status: 'pending',
      amount_cents: body.amountCents,
      currency: 'USD',
      reason: body.reason,
      internal_note: body.internalNote || null,
      booking_id: body.bookingId ?? null,
      incident_id: body.incidentId ?? null,
      square_customer_id: squareCustomerId,
      square_card_id: body.cardId,
      card_brand: cardBrand,
      card_last4: cardLast4,
      charged_by: adminUser.sub,
      metadata: {
        source: 'admin_member_charge',
        created_from: 'admin_members'
      }
    })
    .select('*')
    .single()

  if (insertErr || !insertedCharge) {
    throw createError({ statusCode: 500, statusMessage: insertErr?.message ?? 'Failed to create charge audit row.' })
  }
  const charge = insertedCharge as MemberChargeAuditRow

  let paymentId: string | null = null
  let paymentStatus: string | null = null

  try {
    const locationId = await getServerConfig(event, 'SQUARE_STUDIO_LOCATION_ID')
    const payRes = await square.payments.create({
      idempotencyKey: `amc:${charge.id}:p`,
      sourceId: body.cardId,
      customerId: squareCustomerId,
      autocomplete: true,
      locationId,
      amountMoney: {
        amount: BigInt(body.amountCents),
        currency: 'USD'
      },
      note: `FO Studio ${categoryLabel(body.category).toLowerCase()} charge: ${body.reason}`.slice(0, 500),
      referenceId: charge.id
    } as never)

    const payment = (payRes as { payment?: Record<string, unknown> | null }).payment ?? null
    paymentId = readString(payment, 'id')
    paymentStatus = readString(payment, 'status')?.toUpperCase() ?? null
    if (paymentStatus !== 'COMPLETED' || !paymentId) {
      throw createError({ statusCode: 402, statusMessage: 'Payment not completed.' })
    }
  } catch (error) {
    const message = readSquareErrorMessage(error)
    await db
      .from('admin_member_charges')
      .update({
        status: 'failed',
        payment_status: paymentStatus,
        square_payment_id: paymentId,
        charge_error: message
      })
      .eq('id', charge.id)

    throw createError({ statusCode: 402, statusMessage: `Card charge failed: ${message}` })
  }

  const { data: paidCharge, error: paidErr } = await db
    .from('admin_member_charges')
    .update({
      status: 'paid',
      payment_status: paymentStatus,
      square_payment_id: paymentId,
      charged_at: nowIso,
      charge_error: null
    })
    .eq('id', charge.id)
    .select('*')
    .single()

  if (paidErr || !paidCharge) {
    throw createError({ statusCode: 500, statusMessage: paidErr?.message ?? 'Charge processed but audit update failed.' })
  }
  const paid = paidCharge as MemberChargeAuditRow

  const template = await resolveTemplateId(db)
  if (template.inactive) {
    await db
      .from('admin_member_charges')
      .update({ receipt_error: 'template_inactive' })
      .eq('id', paid.id)
    return { ok: true, charge: paid, receiptSent: false, receiptReason: 'template_inactive' }
  }

  const recipient = String(customer.email ?? '').trim().toLowerCase()
  if (!recipient) {
    await db
      .from('admin_member_charges')
      .update({ receipt_error: 'recipient_missing' })
      .eq('id', paid.id)
    return { ok: true, charge: paid, receiptSent: false, receiptReason: 'recipient_missing' }
  }

  try {
    const sendResult = await sendViaFomailer(event, {
      type: MEMBER_CHARGE_EVENT_TYPE,
      payload: {
        to: recipient,
        eventType: MEMBER_CHARGE_EVENT_TYPE,
        templateId: template.templateId,
        userId: body.userId,
        customerName: customerName(customer),
        customerEmail: recipient,
        chargeId: paid.id,
        chargeCategory: body.category,
        chargeCategoryLabel: categoryLabel(body.category),
        chargeReason: body.reason,
        amountCents: body.amountCents,
        amountDollars: amountDollars(body.amountCents),
        currency: 'USD',
        paymentId,
        chargedAt: nowIso,
        cardBrand: cardBrand ?? 'Card',
        cardLast4: cardLast4 ?? '----',
        bookingId: body.bookingId ?? null,
        incidentId: body.incidentId ?? null
      }
    })

    if (!sendResult.ok) {
      const reason = sendResult.reason ?? 'send_failed'
      await db
        .from('admin_member_charges')
        .update({ receipt_error: reason })
        .eq('id', paid.id)
      return { ok: true, charge: paid, receiptSent: false, receiptReason: reason }
    }

    const { data: finalCharge } = await db
      .from('admin_member_charges')
      .update({
        receipt_sent_at: new Date().toISOString(),
        receipt_error: null,
        fomailer_response: sanitizeForJSON(sendResult.data) ?? null
      })
      .eq('id', paid.id)
      .select('*')
      .single()

    return { ok: true, charge: finalCharge ?? paid, receiptSent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt send failed'
    await db
      .from('admin_member_charges')
      .update({ receipt_error: message })
      .eq('id', paid.id)
    return { ok: true, charge: paid, receiptSent: false, receiptReason: message }
  }
})
