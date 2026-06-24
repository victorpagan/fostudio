import { z } from 'zod'
import { requireServerAdmin } from '~~/server/utils/auth'

const querySchema = z.object({
  userId: z.string().uuid()
})

type WaiverStatus = 'current' | 'expired' | 'missing' | 'stale_version'

function computeWaiverStatus(input: {
  activeTemplate: { id: string } | null
  signature: { template_id: string, expires_at: string } | null
  now: Date
}): WaiverStatus {
  if (!input.activeTemplate || !input.signature) return 'missing'
  if (input.signature.template_id !== input.activeTemplate.id) return 'stale_version'

  const expiresAtTs = Date.parse(input.signature.expires_at)
  return Number.isNaN(expiresAtTs) || expiresAtTs <= input.now.getTime() ? 'expired' : 'current'
}

function asNumber(value: unknown) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function isOptionalMemberChargeHistoryError(error: { code?: string | null, message?: string | null } | null | undefined) {
  const message = String(error?.message ?? '')
  return error?.code === 'PGRST205'
    || (message.includes('admin_member_charges') && message.includes('schema cache'))
    || message.includes('Could not find the table \'public.admin_member_charges\'')
}

type SupabaseQueryResult<T = Record<string, unknown>> = {
  data?: T[] | null
  error?: { code?: string | null, message: string } | null
}

type SupabaseSingleResult<T = Record<string, unknown>> = {
  data?: T | null
  error?: { code?: string | null, message: string } | null
}

type SupabaseQueryBuilder<T = Record<string, unknown>> = PromiseLike<SupabaseQueryResult<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  limit: (count: number) => SupabaseQueryBuilder<T>
  maybeSingle: () => PromiseLike<SupabaseSingleResult<T>>
  or: (filters: string) => SupabaseQueryBuilder<T>
  order: (column: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
}

type UntypedSupabaseClient = {
  from: <T = Record<string, unknown>>(table: string) => SupabaseQueryBuilder<T>
}

type DetailBookingRow = {
  id: string
  start_time: string
  end_time: string
  status: string | null
  notes: string | null
  credits_burned: number | null
  guest_name: string | null
  guest_email: string | null
  created_at: string
  updated_at: string | null
  booking_kind: string | null
  workshop_title: string | null
  workshop_link: string | null
  booking_holds?: Array<Record<string, unknown>> | null
}

type CreditLedgerRow = {
  id: string
  delta: number
  reason: string | null
  external_ref: string | null
  expires_at: string | null
  metadata: unknown
  created_at: string
  membership_id: string | null
}

type ReferralRow = {
  id: string
  checkout_session_id: string | null
  referral_code: string
  referrer_user_id: string | null
  referred_user_id: string | null
  status: string
  rejection_reason: string | null
  referrer_credits_awarded: number | null
  referred_credits_awarded: number | null
  awarded_at: string | null
  created_at: string
}

type IncidentRow = {
  id: string
  title: string
  category: string
  severity: string
  status: string
  occurred_at: string | null
  resolved_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

type ExpenseRow = {
  id: string
  title: string
  category: string
  status: string
  amount_cents: number
  currency: string
  incurred_on: string | null
  vendor_name: string | null
  incident_id: string | null
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

type ManualMembershipEventRow = {
  id: string
  membership_id: string | null
  user_id: string
  admin_user_id: string | null
  action: string
  tier: string | null
  cadence: string | null
  manual_grants_enabled: boolean | null
  manual_expires_at: string | null
  reason: string | null
  payload: unknown
  created_at: string
}

type MemberChargeRow = {
  id: string
  member_user_id: string
  customer_id: string | null
  category: string
  status: string
  amount_cents: number
  currency: string
  reason: string
  internal_note: string | null
  booking_id: string | null
  incident_id: string | null
  square_payment_id: string | null
  payment_status: string | null
  charge_error: string | null
  card_brand: string | null
  card_last4: string | null
  charged_by: string | null
  charged_at: string | null
  receipt_sent_at: string | null
  receipt_error: string | null
  created_at: string
  updated_at: string
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as UntypedSupabaseClient
  const query = querySchema.parse(getQuery(event))
  const now = new Date()

  const [membershipRes, customerRes, balanceRes, activeWaiverTemplateRes, waiverRes, doorCodeRes] = await Promise.all([
    db
      .from('memberships')
      .select('id,user_id,tier,cadence,status,membership_source,billing_provider,billing_subscription_id,square_subscription_id,manual_grants_enabled,manual_assigned_by,manual_assigned_at,manual_reason,manual_expires_at,current_period_start,current_period_end,last_paid_at,created_at,updated_at,activated_at,canceled_at')
      .eq('user_id', query.userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('customers')
      .select('id,user_id,email,phone,first_name,last_name,lab_notes,door_code,door_code_updated_at,workshop_booking_enabled,square_customer_id,created_at,updated_at')
      .eq('user_id', query.userId)
      .maybeSingle(),
    db
      .from<{ user_id: string, balance: number }>('credit_balance')
      .select('user_id,balance')
      .eq('user_id', query.userId)
      .maybeSingle(),
    db
      .from<{ id: string, version: number }>('waiver_templates')
      .select('id,version')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from<{ template_id: string, expires_at: string }>('member_waiver_signatures')
      .select('id,user_id,template_id,template_version,signer_name,signed_at,expires_at')
      .eq('user_id', query.userId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('door_code_change_requests')
      .select('id,user_id,status,requested_at,resolved_at,resolved_by,request_note,resolution_note')
      .eq('user_id', query.userId)
      .order('requested_at', { ascending: false })
      .limit(5)
  ])

  for (const result of [membershipRes, customerRes, balanceRes, activeWaiverTemplateRes, waiverRes, doorCodeRes]) {
    if (result.error) throw createError({ statusCode: 500, statusMessage: result.error.message })
  }

  const [bookingsRes, creditsRes, referralsRes, incidentsRes, expensesRes, manualEventsRes, memberChargesRes] = await Promise.all([
    db
      .from<DetailBookingRow>('bookings')
      .select('id,start_time,end_time,status,notes,credits_burned,guest_name,guest_email,created_at,updated_at,booking_kind,workshop_title,workshop_link,booking_holds(id,hold_start,hold_end,hold_type)')
      .eq('user_id', query.userId)
      .order('start_time', { ascending: false })
      .limit(24),
    db
      .from<CreditLedgerRow>('credits_ledger')
      .select('id,delta,reason,external_ref,expires_at,metadata,created_at,membership_id')
      .eq('user_id', query.userId)
      .order('created_at', { ascending: false })
      .limit(30),
    db
      .from<ReferralRow>('membership_referrals')
      .select('id,checkout_session_id,referral_code,referrer_user_id,referred_user_id,status,rejection_reason,referrer_credits_awarded,referred_credits_awarded,awarded_at,created_at')
      .or(`referrer_user_id.eq.${query.userId},referred_user_id.eq.${query.userId}`)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from<IncidentRow>('admin_incident_reports')
      .select('id,title,category,severity,status,occurred_at,resolved_at,closed_at,created_at,updated_at')
      .eq('member_user_id', query.userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    db
      .from<ExpenseRow>('admin_expense_reports')
      .select('id,title,category,status,amount_cents,currency,incurred_on,vendor_name,incident_id,submitted_at,approved_at,paid_at,created_at,updated_at')
      .eq('member_user_id', query.userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    db
      .from<ManualMembershipEventRow>('admin_manual_membership_events')
      .select('id,membership_id,user_id,admin_user_id,action,tier,cadence,manual_grants_enabled,manual_expires_at,reason,payload,created_at')
      .eq('user_id', query.userId)
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from<MemberChargeRow>('admin_member_charges')
      .select('id,member_user_id,customer_id,category,status,amount_cents,currency,reason,internal_note,booking_id,incident_id,square_payment_id,payment_status,charge_error,card_brand,card_last4,charged_by,charged_at,receipt_sent_at,receipt_error,created_at,updated_at')
      .eq('member_user_id', query.userId)
      .order('created_at', { ascending: false })
      .limit(20)
  ])

  for (const result of [bookingsRes, creditsRes, referralsRes, incidentsRes, expensesRes, manualEventsRes]) {
    if (result.error) throw createError({ statusCode: 500, statusMessage: result.error.message })
  }
  if (memberChargesRes.error && !isOptionalMemberChargeHistoryError(memberChargesRes.error)) {
    throw createError({ statusCode: 500, statusMessage: memberChargesRes.error.message })
  }

  const bookings = bookingsRes.data ?? []
  const credits = creditsRes.data ?? []
  const referrals = referralsRes.data ?? []
  const incidents = incidentsRes.data ?? []
  const expenses = expensesRes.data ?? []
  const manualMembershipEvents = manualEventsRes.data ?? []
  const memberChargeHistoryAvailable = !memberChargesRes.error
  const memberCharges = memberChargeHistoryAvailable ? memberChargesRes.data ?? [] : []
  const upcomingBookings = bookings.filter((booking) => {
    const endMs = Date.parse(String(booking.end_time ?? ''))
    return Number.isFinite(endMs) && endMs >= now.getTime() && booking.status !== 'canceled'
  })
  const pastBookings = bookings.filter((booking) => {
    const endMs = Date.parse(String(booking.end_time ?? ''))
    return booking.status === 'canceled' || (Number.isFinite(endMs) && endMs < now.getTime())
  })
  const openIncidents = incidents.filter(incident => ['open', 'investigating'].includes(String(incident.status ?? '').toLowerCase()))
  const openExpenses = expenses.filter(expense => ['draft', 'submitted', 'approved'].includes(String(expense.status ?? '').toLowerCase()))

  return {
    userId: query.userId,
    membership: membershipRes.data ?? null,
    customer: customerRes.data ?? null,
    creditBalance: asNumber(balanceRes.data?.balance),
    waiver: {
      status: computeWaiverStatus({
        activeTemplate: activeWaiverTemplateRes.data as { id: string } | null,
        signature: waiverRes.data as { template_id: string, expires_at: string } | null,
        now
      }),
      activeTemplate: activeWaiverTemplateRes.data ?? null,
      latestSignature: waiverRes.data ?? null
    },
    doorCodeRequests: doorCodeRes.data ?? [],
    bookings,
    credits,
    referrals,
    incidents,
    expenses,
    manualMembershipEvents,
    memberCharges,
    memberChargeHistoryAvailable,
    summary: {
      upcomingBookings: upcomingBookings.length,
      pastBookings: pastBookings.length,
      totalCreditsAdded: credits.reduce((total, row) => total + Math.max(0, asNumber(row.delta)), 0),
      totalCreditsUsed: Math.abs(credits.reduce((total, row) => total + Math.min(0, asNumber(row.delta)), 0)),
      referralsAwarded: referrals.filter(row => row.status === 'awarded').length,
      openIncidents: openIncidents.length,
      openExpenses: openExpenses.length,
      paidMemberChargeCents: memberCharges
        .filter(row => String(row.status ?? '').toLowerCase() === 'paid')
        .reduce((total, row) => total + asNumber(row.amount_cents), 0)
    }
  }
})
