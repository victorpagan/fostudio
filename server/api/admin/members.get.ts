import { requireServerAdmin } from '~~/server/utils/auth'

type WaiverStatus = 'current' | 'expired' | 'missing' | 'stale_version'

type SupabaseQueryResult<T = Record<string, unknown>> = {
  data?: T[] | null
  error?: { message: string } | null
}

type SupabaseSingleResult<T = Record<string, unknown>> = {
  data?: T | null
  error?: { message: string } | null
}

type SupabaseQueryBuilder<T = Record<string, unknown>> = PromiseLike<SupabaseQueryResult<T>> & {
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder<T>
  limit: (count: number) => SupabaseQueryBuilder<T>
  maybeSingle: () => PromiseLike<SupabaseSingleResult<T>>
  neq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  order: (column: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
}

type UntypedSupabaseClient = {
  from: <T = Record<string, unknown>>(table: string) => SupabaseQueryBuilder<T>
}

type MembershipSourceRow = {
  id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  created_at: string
}

type MemberRow = {
  membership_id: string
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  effective_status: string
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  created_at: string
  customer_email: string | null
  customer_phone: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  customer_lab_notes: string | null
  door_code: string | null
  workshop_booking_enabled: boolean
  door_code_request_status: string | null
  door_code_last_request_at: string | null
  credit_balance: number | null
  waiver_status: WaiverStatus
  waiver_signed_at: string | null
  waiver_expires_at: string | null
  waiver_signer_name: string | null
  waiver_version: number | null
  booking_count: number
  upcoming_booking_count: number
  last_booking_at: string | null
  next_booking_at: string | null
  open_incidents_count: number
  open_expenses_count: number
  health_flags: string[]
}

function deriveEffectiveStatus(status: string | null, currentPeriodEnd: string | null, now = new Date()): string {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return 'unknown'

  if (normalized !== 'active' && normalized !== 'past_due') {
    return normalized
  }

  if (!currentPeriodEnd) return normalized
  const endAt = new Date(currentPeriodEnd)
  if (Number.isNaN(endAt.getTime())) return normalized

  return endAt.getTime() <= now.getTime() ? 'expired' : normalized
}

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

function pushIf(flags: string[], condition: boolean, value: string) {
  if (condition) flags.push(value)
}

export default defineEventHandler(async (event) => {
  const { supabase } = await requireServerAdmin(event)
  const db = supabase as unknown as UntypedSupabaseClient
  const now = new Date()
  const nowIso = now.toISOString()

  const { data: activeWaiverTemplate, error: activeWaiverTemplateErr } = await db
    .from<{ id: string, version: number }>('waiver_templates')
    .select('id,version')
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeWaiverTemplateErr) {
    throw createError({ statusCode: 500, statusMessage: activeWaiverTemplateErr.message })
  }

  const { data: memberships, error: membershipsErr } = await db
    .from<MembershipSourceRow>('memberships')
    .select('id,user_id,tier,cadence,status,current_period_start,current_period_end,last_paid_at,created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (membershipsErr) throw createError({ statusCode: 500, statusMessage: membershipsErr.message })

  type CustomerRow = {
    user_id: string
    email: string | null
    phone: string | null
    first_name: string | null
    last_name: string | null
    lab_notes: string | null
    door_code: string | null
    workshop_booking_enabled: boolean | null
  }
  type DoorCodeRequestRow = {
    user_id: string
    status: string | null
    requested_at: string
  }
  type BalanceRow = {
    user_id: string
    balance: number
  }
  type WaiverSignatureRow = {
    user_id: string
    template_id: string
    template_version: number
    signer_name: string
    signed_at: string
    expires_at: string
  }
  type BookingRow = {
    user_id: string | null
    start_time: string
    end_time: string
    status: string | null
  }
  type CountRow = {
    member_user_id: string | null
    status: string | null
  }

  const userIds = [...new Set((memberships ?? []).map(row => row.user_id).filter(Boolean))]
  let customers: CustomerRow[] = []
  let balances: BalanceRow[] = []
  let doorCodeRequests: DoorCodeRequestRow[] = []
  let waiverSignatures: WaiverSignatureRow[] = []
  let bookings: BookingRow[] = []
  let incidents: CountRow[] = []
  let expenses: CountRow[] = []

  if (userIds.length) {
    const [customersRes, balancesRes, doorCodeRequestsRes, waiverSignaturesRes, bookingsRes, incidentsRes, expensesRes] = await Promise.all([
      db
        .from<CustomerRow>('customers')
        .select('user_id,email,phone,first_name,last_name,lab_notes,door_code,workshop_booking_enabled')
        .in('user_id', userIds),
      db
        .from<BalanceRow>('credit_balance')
        .select('user_id,balance')
        .in('user_id', userIds),
      db
        .from<DoorCodeRequestRow>('door_code_change_requests')
        .select('user_id,status,requested_at')
        .in('user_id', userIds)
        .order('requested_at', { ascending: false }),
      db
        .from<WaiverSignatureRow>('member_waiver_signatures')
        .select('user_id,template_id,template_version,signer_name,signed_at,expires_at')
        .in('user_id', userIds)
        .order('signed_at', { ascending: false }),
      db
        .from<BookingRow>('bookings')
        .select('user_id,start_time,end_time,status')
        .in('user_id', userIds)
        .neq('status', 'canceled')
        .order('start_time', { ascending: false })
        .limit(2000),
      db
        .from<CountRow>('admin_incident_reports')
        .select('member_user_id,status')
        .in('member_user_id', userIds)
        .in('status', ['open', 'investigating']),
      db
        .from<CountRow>('admin_expense_reports')
        .select('member_user_id,status')
        .in('member_user_id', userIds)
        .in('status', ['draft', 'submitted', 'approved'])
    ])

    if (customersRes.error) throw createError({ statusCode: 500, statusMessage: customersRes.error.message })
    if (balancesRes.error) throw createError({ statusCode: 500, statusMessage: balancesRes.error.message })
    if (doorCodeRequestsRes.error) throw createError({ statusCode: 500, statusMessage: doorCodeRequestsRes.error.message })
    if (waiverSignaturesRes.error) throw createError({ statusCode: 500, statusMessage: waiverSignaturesRes.error.message })
    if (bookingsRes.error) throw createError({ statusCode: 500, statusMessage: bookingsRes.error.message })
    if (incidentsRes.error) throw createError({ statusCode: 500, statusMessage: incidentsRes.error.message })
    if (expensesRes.error) throw createError({ statusCode: 500, statusMessage: expensesRes.error.message })

    customers = (customersRes.data ?? []) as CustomerRow[]
    balances = (balancesRes.data ?? []) as BalanceRow[]
    doorCodeRequests = (doorCodeRequestsRes.data ?? []) as DoorCodeRequestRow[]
    waiverSignatures = (waiverSignaturesRes.data ?? []) as WaiverSignatureRow[]
    bookings = (bookingsRes.data ?? []) as BookingRow[]
    incidents = (incidentsRes.data ?? []) as CountRow[]
    expenses = (expensesRes.data ?? []) as CountRow[]
  }

  const customersByUserId = new Map<string, CustomerRow>()
  for (const customer of customers) customersByUserId.set(customer.user_id, customer)

  const balancesByUserId = new Map<string, number>()
  for (const balance of balances) balancesByUserId.set(balance.user_id, Number(balance.balance ?? 0))

  const latestDoorCodeRequestByUserId = new Map<string, DoorCodeRequestRow>()
  for (const request of doorCodeRequests) {
    if (!latestDoorCodeRequestByUserId.has(request.user_id)) latestDoorCodeRequestByUserId.set(request.user_id, request)
  }

  const latestWaiverSignatureByUserId = new Map<string, WaiverSignatureRow>()
  for (const signature of waiverSignatures) {
    if (!latestWaiverSignatureByUserId.has(signature.user_id)) latestWaiverSignatureByUserId.set(signature.user_id, signature)
  }

  const bookingStatsByUserId = new Map<string, {
    bookingCount: number
    upcomingBookingCount: number
    lastBookingAt: string | null
    nextBookingAt: string | null
  }>()
  for (const booking of bookings) {
    if (!booking.user_id) continue
    const stats = bookingStatsByUserId.get(booking.user_id) ?? {
      bookingCount: 0,
      upcomingBookingCount: 0,
      lastBookingAt: null,
      nextBookingAt: null
    }
    stats.bookingCount += 1
    const startMs = Date.parse(booking.start_time)
    const endMs = Date.parse(booking.end_time)
    if (Number.isFinite(endMs) && endMs >= now.getTime()) {
      stats.upcomingBookingCount += 1
      if (!stats.nextBookingAt || Date.parse(booking.start_time) < Date.parse(stats.nextBookingAt)) {
        stats.nextBookingAt = booking.start_time
      }
    }
    if (Number.isFinite(startMs) && startMs < now.getTime()) {
      if (!stats.lastBookingAt || startMs > Date.parse(stats.lastBookingAt)) {
        stats.lastBookingAt = booking.start_time
      }
    }
    bookingStatsByUserId.set(booking.user_id, stats)
  }

  const openIncidentCountByUserId = new Map<string, number>()
  for (const row of incidents) {
    if (!row.member_user_id) continue
    openIncidentCountByUserId.set(row.member_user_id, (openIncidentCountByUserId.get(row.member_user_id) ?? 0) + 1)
  }

  const openExpenseCountByUserId = new Map<string, number>()
  for (const row of expenses) {
    if (!row.member_user_id) continue
    openExpenseCountByUserId.set(row.member_user_id, (openExpenseCountByUserId.get(row.member_user_id) ?? 0) + 1)
  }

  const members: MemberRow[] = (memberships ?? []).map((membership) => {
    const customer = customersByUserId.get(membership.user_id)
    const latestDoorCodeRequest = latestDoorCodeRequestByUserId.get(membership.user_id)
    const latestWaiverSignature = latestWaiverSignatureByUserId.get(membership.user_id)
    const bookingStats = bookingStatsByUserId.get(membership.user_id)
    const creditBalance = balancesByUserId.get(membership.user_id) ?? null
    const effectiveStatus = deriveEffectiveStatus(membership.status, membership.current_period_end, now)
    const waiverStatus = computeWaiverStatus({
      activeTemplate: activeWaiverTemplate as { id: string } | null,
      signature: latestWaiverSignature ?? null,
      now
    })
    const openIncidents = openIncidentCountByUserId.get(membership.user_id) ?? 0
    const openExpenses = openExpenseCountByUserId.get(membership.user_id) ?? 0
    const healthFlags: string[] = []

    pushIf(healthFlags, effectiveStatus === 'expired', 'Membership expired')
    pushIf(healthFlags, effectiveStatus === 'past_due', 'Past due')
    pushIf(healthFlags, waiverStatus !== 'current', 'Waiver needs attention')
    pushIf(healthFlags, latestDoorCodeRequest?.status === 'pending', 'Door code request pending')
    pushIf(healthFlags, Number(creditBalance ?? 0) <= 0, 'No credits available')
    pushIf(healthFlags, openIncidents > 0, `${openIncidents} open incident${openIncidents === 1 ? '' : 's'}`)
    pushIf(healthFlags, openExpenses > 0, `${openExpenses} open expense${openExpenses === 1 ? '' : 's'}`)

    return {
      membership_id: membership.id,
      user_id: membership.user_id,
      tier: membership.tier,
      cadence: membership.cadence,
      status: membership.status,
      effective_status: effectiveStatus,
      current_period_start: membership.current_period_start,
      current_period_end: membership.current_period_end,
      last_paid_at: membership.last_paid_at,
      created_at: membership.created_at,
      customer_email: customer?.email ?? null,
      customer_phone: customer?.phone ?? null,
      customer_first_name: customer?.first_name ?? null,
      customer_last_name: customer?.last_name ?? null,
      customer_lab_notes: customer?.lab_notes ?? null,
      door_code: customer?.door_code ?? null,
      workshop_booking_enabled: Boolean(customer?.workshop_booking_enabled),
      door_code_request_status: latestDoorCodeRequest?.status ?? null,
      door_code_last_request_at: latestDoorCodeRequest?.requested_at ?? null,
      credit_balance: creditBalance,
      waiver_status: waiverStatus,
      waiver_signed_at: latestWaiverSignature?.signed_at ?? null,
      waiver_expires_at: latestWaiverSignature?.expires_at ?? null,
      waiver_signer_name: latestWaiverSignature?.signer_name ?? null,
      waiver_version: latestWaiverSignature ? Number(latestWaiverSignature.template_version ?? 0) : null,
      booking_count: bookingStats?.bookingCount ?? 0,
      upcoming_booking_count: bookingStats?.upcomingBookingCount ?? 0,
      last_booking_at: bookingStats?.lastBookingAt ?? null,
      next_booking_at: bookingStats?.nextBookingAt ?? null,
      open_incidents_count: openIncidents,
      open_expenses_count: openExpenses,
      health_flags: healthFlags
    }
  })

  const summary = {
    totalMembers: members.length,
    activeMembers: members.filter(member => member.effective_status === 'active').length,
    pastDueMembers: members.filter(member => member.effective_status === 'past_due').length,
    pendingCheckoutMembers: members.filter(member => member.effective_status === 'pending_checkout').length,
    expiredMembers: members.filter(member => member.effective_status === 'expired').length,
    waiverAttentionMembers: members.filter(member => member.waiver_status !== 'current').length,
    pendingDoorCodeRequests: members.filter(member => member.door_code_request_status === 'pending').length,
    workshopEnabledMembers: members.filter(member => member.workshop_booking_enabled).length,
    zeroCreditMembers: members.filter(member => Number(member.credit_balance ?? 0) <= 0).length,
    upcomingBookings: members.reduce((total, member) => total + member.upcoming_booking_count, 0),
    openIncidents: members.reduce((total, member) => total + member.open_incidents_count, 0),
    openExpenses: members.reduce((total, member) => total + member.open_expenses_count, 0),
    generatedAt: nowIso
  }

  return { members, summary }
})
