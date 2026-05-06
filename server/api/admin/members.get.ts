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
  membership_source: string | null
  billing_provider: string | null
  billing_subscription_id: string | null
  manual_grants_enabled: boolean | null
  manual_assigned_by: string | null
  manual_assigned_at: string | null
  manual_reason: string | null
  manual_expires_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  last_paid_at: string | null
  created_at: string
}

type MemberRow = {
  membership_id: string
  membership_record_id: string | null
  user_id: string
  tier: string | null
  cadence: string | null
  status: string | null
  effective_status: string
  account_kind: 'guest' | 'subscriber_current' | 'subscriber_past'
  membership_source: 'square' | 'manual' | 'unknown'
  membership_source_label: 'Paid' | 'Manual' | 'Guest' | 'Past subscriber'
  manual_grants_enabled: boolean
  manual_assigned_by: string | null
  manual_assigned_at: string | null
  manual_reason: string | null
  manual_expires_at: string | null
  account_source: 'studio_signup' | 'studio_checkout_signup' | 'studio_membership' | 'lab_shared_auth' | 'unknown'
  has_membership_history: boolean
  has_current_membership: boolean
  studio_registered_at: string | null
  studio_last_seen_at: string | null
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

const CUSTOMER_BASE_COLUMNS = 'user_id,email,phone,first_name,last_name,lab_notes,door_code,workshop_booking_enabled,created_at,updated_at'
const CUSTOMER_PROVENANCE_COLUMNS = `${CUSTOMER_BASE_COLUMNS},studio_account_origin,studio_registered_at,studio_last_seen_at`

function isMissingCustomerProvenanceColumn(message?: string | null) {
  const normalized = String(message ?? '').toLowerCase()
  return normalized.includes('studio_account_origin')
    || normalized.includes('studio_registered_at')
    || normalized.includes('studio_last_seen_at')
}

function membershipSortValue(membership: MembershipSourceRow) {
  const candidates = [membership.current_period_end, membership.last_paid_at, membership.created_at]
  for (const value of candidates) {
    const parsed = Date.parse(String(value ?? ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function chooseMembership(left: MembershipSourceRow | undefined, right: MembershipSourceRow, now: Date) {
  if (!left) return right

  const leftStatus = deriveEffectiveStatus(left.status, left.current_period_end, now)
  const rightStatus = deriveEffectiveStatus(right.status, right.current_period_end, now)
  const rank = (status: string) => {
    if (status === 'active') return 4
    if (status === 'past_due') return 3
    if (status === 'pending_checkout') return 2
    return 1
  }
  const leftRank = rank(leftStatus)
  const rightRank = rank(rightStatus)
  if (rightRank !== leftRank) return rightRank > leftRank ? right : left

  return membershipSortValue(right) > membershipSortValue(left) ? right : left
}

function deriveAccountKind(membership: MembershipSourceRow | undefined, effectiveStatus: string): MemberRow['account_kind'] {
  if (!membership) return 'guest'
  if (['active', 'past_due', 'pending_checkout'].includes(effectiveStatus)) return 'subscriber_current'
  return 'subscriber_past'
}

function deriveMembershipSource(membership: MembershipSourceRow | undefined): MemberRow['membership_source'] {
  if (!membership) return 'unknown'
  const source = String(membership.membership_source ?? membership.billing_provider ?? '').trim().toLowerCase()
  if (source === 'manual') return 'manual'
  if (source === 'square') return 'square'
  return 'unknown'
}

function deriveMembershipSourceLabel(
  membership: MembershipSourceRow | undefined,
  accountKind: MemberRow['account_kind']
): MemberRow['membership_source_label'] {
  if (!membership || accountKind === 'guest') return 'Guest'
  if (accountKind === 'subscriber_past') return 'Past subscriber'
  return deriveMembershipSource(membership) === 'manual' ? 'Manual' : 'Paid'
}

function deriveAccountSource(customer: { studio_account_origin?: string | null } | undefined, membership: MembershipSourceRow | undefined): MemberRow['account_source'] {
  const origin = String(customer?.studio_account_origin ?? '').trim()
  if (
    origin === 'studio_signup'
    || origin === 'studio_checkout_signup'
    || origin === 'studio_membership'
    || origin === 'lab_shared_auth'
  ) {
    return origin
  }
  return membership ? 'studio_membership' : 'unknown'
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

  type CustomerRow = {
    user_id: string
    email: string | null
    phone: string | null
    first_name: string | null
    last_name: string | null
    lab_notes: string | null
    door_code: string | null
    workshop_booking_enabled: boolean | null
    created_at: string | null
    updated_at: string | null
    studio_account_origin?: 'studio_signup' | 'studio_checkout_signup' | 'studio_membership' | 'lab_shared_auth' | null
    studio_registered_at?: string | null
    studio_last_seen_at?: string | null
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

  const membershipsRes = await db
    .from<MembershipSourceRow>('memberships')
    .select('id,user_id,tier,cadence,status,membership_source,billing_provider,billing_subscription_id,manual_grants_enabled,manual_assigned_by,manual_assigned_at,manual_reason,manual_expires_at,current_period_start,current_period_end,last_paid_at,created_at')
    .order('created_at', { ascending: false })
    .limit(1000)

  let customersResAll = await db
    .from<CustomerRow>('customers')
    .select(CUSTOMER_PROVENANCE_COLUMNS)
    .order('updated_at', { ascending: false })
    .limit(1000)
  let studioCustomersResAll = await db
    .from<CustomerRow>('customers')
    .select(CUSTOMER_PROVENANCE_COLUMNS)
    .order('studio_registered_at', { ascending: false, nullsFirst: false })
    .limit(1000)

  if (customersResAll.error && isMissingCustomerProvenanceColumn(customersResAll.error.message)) {
    customersResAll = await db
      .from<CustomerRow>('customers')
      .select(CUSTOMER_BASE_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(1000)
    studioCustomersResAll = {
      data: [],
      error: null
    }
  }

  if (membershipsRes.error) throw createError({ statusCode: 500, statusMessage: membershipsRes.error.message })
  if (customersResAll.error) throw createError({ statusCode: 500, statusMessage: customersResAll.error.message })
  if (studioCustomersResAll.error) throw createError({ statusCode: 500, statusMessage: studioCustomersResAll.error.message })

  const memberships = membershipsRes.data ?? []
  const customersAllByUserId = new Map<string, CustomerRow>()
  for (const customer of [...(customersResAll.data ?? []), ...(studioCustomersResAll.data ?? [])]) {
    if (!customer.user_id) continue
    customersAllByUserId.set(customer.user_id, customer)
  }
  const customersAll = [...customersAllByUserId.values()]
  const latestMembershipByUserId = new Map<string, MembershipSourceRow>()
  for (const membership of memberships) {
    if (!membership.user_id) continue
    latestMembershipByUserId.set(
      membership.user_id,
      chooseMembership(latestMembershipByUserId.get(membership.user_id), membership, now)
    )
  }

  const userIds = [...new Set([
    ...memberships.map(row => row.user_id).filter(Boolean),
    ...customersAll.map(row => row.user_id).filter(Boolean)
  ])]
  let customers: CustomerRow[] = []
  let balances: BalanceRow[] = []
  let doorCodeRequests: DoorCodeRequestRow[] = []
  let waiverSignatures: WaiverSignatureRow[] = []
  let bookings: BookingRow[] = []
  let incidents: CountRow[] = []
  let expenses: CountRow[] = []

  if (userIds.length) {
    let customersRes = await db
      .from<CustomerRow>('customers')
      .select(CUSTOMER_PROVENANCE_COLUMNS)
      .in('user_id', userIds)

    if (customersRes.error && isMissingCustomerProvenanceColumn(customersRes.error.message)) {
      customersRes = await db
        .from<CustomerRow>('customers')
        .select(CUSTOMER_BASE_COLUMNS)
        .in('user_id', userIds)
    }

    const [balancesRes, doorCodeRequestsRes, waiverSignaturesRes, bookingsRes, incidentsRes, expensesRes] = await Promise.all([
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

  const members: MemberRow[] = userIds.map((userId) => {
    const membership = latestMembershipByUserId.get(userId)
    const customer = customersByUserId.get(userId)
    const latestDoorCodeRequest = latestDoorCodeRequestByUserId.get(userId)
    const latestWaiverSignature = latestWaiverSignatureByUserId.get(userId)
    const bookingStats = bookingStatsByUserId.get(userId)
    const creditBalance = balancesByUserId.get(userId) ?? null
    const effectiveStatus = membership
      ? deriveEffectiveStatus(membership.status, membership.current_period_end, now)
      : 'guest'
    const accountKind = deriveAccountKind(membership, effectiveStatus)
    const membershipSource = deriveMembershipSource(membership)
    const membershipSourceLabel = deriveMembershipSourceLabel(membership, accountKind)
    const accountSource = deriveAccountSource(customer, membership)
    const waiverStatus = computeWaiverStatus({
      activeTemplate: activeWaiverTemplate as { id: string } | null,
      signature: latestWaiverSignature ?? null,
      now
    })
    const openIncidents = openIncidentCountByUserId.get(userId) ?? 0
    const openExpenses = openExpenseCountByUserId.get(userId) ?? 0
    const healthFlags: string[] = []

    pushIf(healthFlags, effectiveStatus === 'expired', 'Membership expired')
    pushIf(healthFlags, effectiveStatus === 'past_due', 'Past due')
    pushIf(healthFlags, waiverStatus !== 'current', 'Waiver needs attention')
    pushIf(healthFlags, latestDoorCodeRequest?.status === 'pending', 'Door code request pending')
    pushIf(healthFlags, Number(creditBalance ?? 0) <= 0, 'No credits available')
    pushIf(healthFlags, openIncidents > 0, `${openIncidents} open incident${openIncidents === 1 ? '' : 's'}`)
    pushIf(healthFlags, openExpenses > 0, `${openExpenses} open expense${openExpenses === 1 ? '' : 's'}`)

    return {
      membership_id: membership?.id ?? `guest:${userId}`,
      membership_record_id: membership?.id ?? null,
      user_id: userId,
      tier: membership?.tier ?? null,
      cadence: membership?.cadence ?? null,
      status: membership?.status ?? null,
      effective_status: effectiveStatus,
      account_kind: accountKind,
      membership_source: membershipSource,
      membership_source_label: membershipSourceLabel,
      manual_grants_enabled: Boolean(membership?.manual_grants_enabled),
      manual_assigned_by: membership?.manual_assigned_by ?? null,
      manual_assigned_at: membership?.manual_assigned_at ?? null,
      manual_reason: membership?.manual_reason ?? null,
      manual_expires_at: membership?.manual_expires_at ?? null,
      account_source: accountSource,
      has_membership_history: Boolean(membership),
      has_current_membership: accountKind === 'subscriber_current',
      studio_registered_at: customer?.studio_registered_at ?? null,
      studio_last_seen_at: customer?.studio_last_seen_at ?? null,
      current_period_start: membership?.current_period_start ?? null,
      current_period_end: membership?.current_period_end ?? null,
      last_paid_at: membership?.last_paid_at ?? null,
      created_at: membership?.created_at ?? customer?.studio_registered_at ?? customer?.studio_last_seen_at ?? customer?.updated_at ?? customer?.created_at ?? nowIso,
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
  }).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))

  const summary = {
    totalMembers: members.length,
    guestAccounts: members.filter(member => member.account_kind === 'guest').length,
    studioSignupAccounts: members.filter(member => member.account_source === 'studio_signup' || member.account_source === 'studio_checkout_signup').length,
    labSharedAccounts: members.filter(member => member.account_source === 'lab_shared_auth').length,
    currentSubscriberAccounts: members.filter(member => member.account_kind === 'subscriber_current').length,
    manualMembershipAccounts: members.filter(member => member.account_kind === 'subscriber_current' && member.membership_source === 'manual').length,
    pastSubscriberAccounts: members.filter(member => member.account_kind === 'subscriber_past').length,
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
