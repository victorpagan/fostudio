import { requireServerAdmin } from '~~/server/utils/auth'
import { DateTime } from 'luxon'

type RevenueBucket = 'day' | 'week' | 'month'

type RevenuePoint = {
  key: string
  label: string
  membershipCents: number
  creditTopupCents: number
  holdTopupCents: number
  totalCents: number
  orders: number
}

type TopMemberPoint = {
  userId: string
  name: string | null
  email: string | null
  bookings: number
  creditsBurned: number
  revenueCents: number
  lastBookingAt: string | null
}

const MAX_RANGE_DAYS = 740

function clampRange(start: DateTime, end: DateTime) {
  if (end < start) return { start: end, end: start }
  const days = end.diff(start, 'days').days
  if (days <= MAX_RANGE_DAYS) return { start, end }
  return {
    start: end.minus({ days: MAX_RANGE_DAYS }).startOf('day'),
    end
  }
}

function parseBucket(value: unknown): RevenueBucket {
  if (value === 'week') return 'week'
  if (value === 'month') return 'month'
  return 'day'
}

function parseDateInput(value: unknown, fallback: DateTime) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const parsed = DateTime.fromISO(value, { zone: 'utc' })
  if (!parsed.isValid) return fallback
  return parsed
}

function alignBucketStart(date: DateTime, bucket: RevenueBucket) {
  if (bucket === 'week') return date.startOf('week')
  if (bucket === 'month') return date.startOf('month')
  return date.startOf('day')
}

function bucketStep(bucket: RevenueBucket) {
  if (bucket === 'week') return { weeks: 1 }
  if (bucket === 'month') return { months: 1 }
  return { days: 1 }
}

function bucketKeyFromDate(date: DateTime, bucket: RevenueBucket) {
  if (bucket === 'week') return date.startOf('week').toISODate() ?? ''
  if (bucket === 'month') return date.startOf('month').toFormat('yyyy-MM')
  return date.startOf('day').toISODate() ?? ''
}

function bucketLabelFromKey(key: string, bucket: RevenueBucket) {
  if (bucket === 'month') {
    const parsed = DateTime.fromFormat(key, 'yyyy-MM', { zone: 'utc' })
    return parsed.isValid ? parsed.toFormat('LLL yyyy') : key
  }

  const parsed = DateTime.fromISO(key, { zone: 'utc' })
  if (!parsed.isValid) return key
  if (bucket === 'week') {
    const end = parsed.plus({ days: 6 })
    return `${parsed.toFormat('LLL d')} - ${end.toFormat('LLL d')}`
  }
  return parsed.toFormat('LLL d')
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return fallback
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const nowUtc = DateTime.utc()
  const requestedBucket = parseBucket(query.bucket)
  const defaultStart = nowUtc.minus({ days: 29 }).startOf('day')
  const defaultEnd = nowUtc.endOf('day')
  const parsedStart = parseDateInput(query.start, defaultStart)
  const parsedEnd = parseDateInput(query.end, defaultEnd)
  const { start: rangeStart, end: rangeEnd } = clampRange(parsedStart, parsedEnd)

  const effectiveBucket: RevenueBucket = requestedBucket === 'day' && rangeEnd.diff(rangeStart, 'days').days > 120
    ? 'week'
    : requestedBucket

  const rangeStartIso = rangeStart.toUTC().toISO() ?? defaultStart.toUTC().toISO()!
  const rangeEndIso = rangeEnd.toUTC().toISO() ?? defaultEnd.toUTC().toISO()!

  const { supabase } = await requireServerAdmin(event)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const now = new Date().toISOString()

  const [
    dueGrantCountRes,
    scheduledGrantCountRes,
    dueGrantsRes,
    upcomingGrantsRes,
    membershipsAttentionRes,
    recentGuestBookingsRes,
    activeDemandBookingsRes,
    activeExtendedMembershipsRes,
    futureGrantMembershipsRes,
    pendingLockJobsRes,
    deadLockJobsRes,
    openLockIncidentsRes,
    recentLockIncidentsRes,
    membershipSessionsRes,
    variationsRes,
    creditTopupsRes,
    holdTopupsRes,
    memberBookingsRes,
    customersRes,
    permanentCodesRes,
    accessConfigRes
  ] = await Promise.all([
    supabase
      .from('membership_credit_grants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .lte('due_at', now),
    supabase
      .from('membership_credit_grants')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled'),
    supabase
      .from('membership_credit_grants')
      .select('id, membership_id, user_id, invoice_id, due_at, credits, processed_credits, status, last_error, created_at')
      .eq('status', 'scheduled')
      .lte('due_at', now)
      .order('due_at', { ascending: true })
      .limit(10),
    supabase
      .from('membership_credit_grants')
      .select('id, membership_id, user_id, invoice_id, due_at, credits, processed_credits, status, last_error, created_at')
      .eq('status', 'scheduled')
      .gt('due_at', now)
      .order('due_at', { ascending: true })
      .limit(10),
    supabase
      .from('memberships')
      .select('id, user_id, tier, cadence, status, current_period_start, current_period_end, last_invoice_id, last_paid_at')
      .in('status', ['pending_checkout', 'past_due', 'canceled'])
      .order('last_paid_at', { ascending: true, nullsFirst: true })
      .limit(12),
    supabase
      .from('bookings')
      .select('id, start_time, end_time, status, guest_name, guest_email, notes, created_at, square_order_id')
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'canceled')
      .gte('start_time', rangeStartIso)
      .lte('start_time', rangeEndIso),
    supabase
      .from('memberships')
      .select('id, user_id, tier, cadence, status, current_period_start, current_period_end, last_invoice_id, last_paid_at')
      .eq('status', 'active')
      .in('cadence', ['quarterly', 'annual'])
      .not('current_period_start', 'is', null)
      .not('current_period_end', 'is', null)
      .limit(100),
    supabase
      .from('membership_credit_grants')
      .select('membership_id')
      .eq('status', 'scheduled')
      .gt('due_at', now),
    db
      .from('lock_access_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    db
      .from('lock_access_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'dead'),
    db
      .from('lock_access_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open'),
    db
      .from('lock_access_incidents')
      .select('id,incident_type,severity,status,title,message,booking_id,user_id,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('membership_checkout_sessions')
      .select('id,paid_at,plan_variation_id,tier,cadence,claimed_by_user_id,guest_email,status')
      .not('paid_at', 'is', null)
      .gte('paid_at', rangeStartIso)
      .lte('paid_at', rangeEndIso),
    supabase
      .from('membership_plan_variations')
      .select('id,tier_id,cadence,price_cents,sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('credit_topup_sessions')
      .select('id,user_id,paid_at,amount_cents,status')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .gte('paid_at', rangeStartIso)
      .lte('paid_at', rangeEndIso),
    supabase
      .from('hold_topup_sessions')
      .select('id,user_id,paid_at,amount_cents,status')
      .eq('status', 'processed')
      .not('paid_at', 'is', null)
      .gte('paid_at', rangeStartIso)
      .lte('paid_at', rangeEndIso),
    supabase
      .from('bookings')
      .select('user_id,start_time,credits_burned,status')
      .not('user_id', 'is', null)
      .neq('status', 'canceled')
      .gte('start_time', rangeStartIso)
      .lte('start_time', rangeEndIso),
    supabase
      .from('customers')
      .select('user_id,first_name,last_name,email')
      .not('user_id', 'is', null),
    db
      .from('lock_permanent_codes')
      .select('id,active,last_sync_status'),
    supabase
      .from('system_config')
      .select('key,value')
      .eq('key', 'PERMANENT_CODES_DISARM_ABODE_OUTSIDE_LAB_HOURS')
      .maybeSingle()
  ])

  const errors = [
    dueGrantCountRes.error,
    scheduledGrantCountRes.error,
    dueGrantsRes.error,
    upcomingGrantsRes.error,
    membershipsAttentionRes.error,
    recentGuestBookingsRes.error,
    activeDemandBookingsRes.error,
    activeExtendedMembershipsRes.error,
    futureGrantMembershipsRes.error,
    pendingLockJobsRes.error,
    deadLockJobsRes.error,
    openLockIncidentsRes.error,
    recentLockIncidentsRes.error,
    membershipSessionsRes.error,
    variationsRes.error,
    creditTopupsRes.error,
    holdTopupsRes.error,
    memberBookingsRes.error,
    customersRes.error,
    permanentCodesRes.error,
    accessConfigRes.error
  ].filter(Boolean)

  if (errors.length) {
    throw createError({ statusCode: 500, statusMessage: errors[0]?.message ?? 'Failed to load admin ops data' })
  }

  const futureGrantMembershipIds = new Set(
    (futureGrantMembershipsRes.data ?? []).map(row => row.membership_id)
  )

  const membershipsMissingFutureSchedule = (activeExtendedMembershipsRes.data ?? []).filter(
    membership => !futureGrantMembershipIds.has(membership.id)
  )

  const variationById = new Map<string, { priceCents: number, tierId: string | null, cadence: string | null }>()
  const variationByTierCadence = new Map<string, { priceCents: number }>()
  for (const row of (variationsRes.data ?? [])) {
    const priceCents = Math.max(0, Number(row.price_cents ?? 0))
    variationById.set(row.id, {
      priceCents,
      tierId: row.tier_id ?? null,
      cadence: row.cadence ?? null
    })
    const pairKey = `${String(row.tier_id ?? '')}:${String(row.cadence ?? '')}`
    if (!variationByTierCadence.has(pairKey)) {
      variationByTierCadence.set(pairKey, { priceCents })
    }
  }

  const bucketMap = new Map<string, RevenuePoint>()
  let bucketCursor = alignBucketStart(rangeStart, effectiveBucket)
  const alignedEnd = rangeEnd.endOf('day')
  let guard = 0
  while (bucketCursor <= alignedEnd && guard < 1000) {
    const key = bucketKeyFromDate(bucketCursor, effectiveBucket)
    bucketMap.set(key, {
      key,
      label: bucketLabelFromKey(key, effectiveBucket),
      membershipCents: 0,
      creditTopupCents: 0,
      holdTopupCents: 0,
      totalCents: 0,
      orders: 0
    })
    bucketCursor = bucketCursor.plus(bucketStep(effectiveBucket))
    guard += 1
  }

  const memberSpendMap = new Map<string, number>()

  function addRevenuePoint(iso: string | null, category: 'membershipCents' | 'creditTopupCents' | 'holdTopupCents', amountCents: number, userId?: string | null) {
    if (!iso || !Number.isFinite(amountCents) || amountCents <= 0) return
    const parsed = DateTime.fromISO(iso, { zone: 'utc' })
    if (!parsed.isValid) return
    if (parsed < rangeStart || parsed > rangeEnd.plus({ days: 1 })) return
    const key = bucketKeyFromDate(parsed, effectiveBucket)
    const target = bucketMap.get(key)
    if (!target) return
    target[category] += amountCents
    target.totalCents += amountCents
    target.orders += 1
    if (userId && userId.trim()) {
      memberSpendMap.set(userId, (memberSpendMap.get(userId) ?? 0) + amountCents)
    }
  }

  for (const session of (membershipSessionsRes.data ?? [])) {
    const byVariationId = session.plan_variation_id ? variationById.get(session.plan_variation_id) : null
    const byPair = variationByTierCadence.get(`${String(session.tier ?? '')}:${String(session.cadence ?? '')}`)
    const priceCents = byVariationId?.priceCents ?? byPair?.priceCents ?? 0
    addRevenuePoint(session.paid_at, 'membershipCents', priceCents, session.claimed_by_user_id)
  }

  for (const row of (creditTopupsRes.data ?? [])) {
    addRevenuePoint(row.paid_at, 'creditTopupCents', Math.max(0, Number(row.amount_cents ?? 0)), row.user_id)
  }

  for (const row of (holdTopupsRes.data ?? [])) {
    addRevenuePoint(row.paid_at, 'holdTopupCents', Math.max(0, Number(row.amount_cents ?? 0)), row.user_id)
  }

  const revenueSeries = [...bucketMap.values()]
  const totalRevenueCents = revenueSeries.reduce((sum, item) => sum + item.totalCents, 0)
  const membershipRevenueCents = revenueSeries.reduce((sum, item) => sum + item.membershipCents, 0)
  const creditTopupRevenueCents = revenueSeries.reduce((sum, item) => sum + item.creditTopupCents, 0)
  const holdTopupRevenueCents = revenueSeries.reduce((sum, item) => sum + item.holdTopupCents, 0)
  const totalOrders = revenueSeries.reduce((sum, item) => sum + item.orders, 0)

  const topMembersByUser = new Map<string, TopMemberPoint>()
  for (const booking of (memberBookingsRes.data ?? [])) {
    const userId = String(booking.user_id ?? '').trim()
    if (!userId) continue

    const existing = topMembersByUser.get(userId) ?? {
      userId,
      name: null,
      email: null,
      bookings: 0,
      creditsBurned: 0,
      revenueCents: 0,
      lastBookingAt: null
    }

    existing.bookings += 1
    existing.creditsBurned += Math.max(0, Number(booking.credits_burned ?? 0))
    existing.revenueCents = memberSpendMap.get(userId) ?? existing.revenueCents
    if (!existing.lastBookingAt || (booking.start_time && booking.start_time > existing.lastBookingAt)) {
      existing.lastBookingAt = booking.start_time
    }
    topMembersByUser.set(userId, existing)
  }

  for (const [userId, spent] of memberSpendMap.entries()) {
    if (topMembersByUser.has(userId)) {
      const existing = topMembersByUser.get(userId)!
      existing.revenueCents = spent
      continue
    }

    topMembersByUser.set(userId, {
      userId,
      name: null,
      email: null,
      bookings: 0,
      creditsBurned: 0,
      revenueCents: spent,
      lastBookingAt: null
    })
  }

  const customerByUser = new Map<string, { name: string | null, email: string | null }>()
  for (const customer of (customersRes.data ?? [])) {
    const userId = String(customer.user_id ?? '').trim()
    if (!userId) continue
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
    customerByUser.set(userId, {
      name: fullName || null,
      email: customer.email ?? null
    })
  }

  const topMembers = [...topMembersByUser.values()]
    .map((member) => {
      const customer = customerByUser.get(member.userId)
      return {
        ...member,
        name: customer?.name ?? member.name ?? null,
        email: customer?.email ?? member.email ?? null
      }
    })
    .sort((a, b) => {
      if (b.revenueCents !== a.revenueCents) return b.revenueCents - a.revenueCents
      if (b.bookings !== a.bookings) return b.bookings - a.bookings
      return b.creditsBurned - a.creditsBurned
    })
    .slice(0, 8)

  const permanentCodes = permanentCodesRes.data ?? []
  const accessStatus = {
    pendingJobs: pendingLockJobsRes.count ?? 0,
    deadJobs: deadLockJobsRes.count ?? 0,
    openIncidents: openLockIncidentsRes.count ?? 0,
    permanentCodesActive: permanentCodes.filter((row: { active?: boolean }) => Boolean(row.active)).length,
    permanentCodesSyncErrors: permanentCodes.filter((row: { last_sync_status?: string | null }) => row.last_sync_status === 'error').length,
    permanentCodesDisarmAbodeOutsideLabHours: toBoolean(accessConfigRes.data?.value, false)
  }

  const criticalIssues = [
    {
      id: 'due-grants',
      title: 'Credit grants due',
      severity: (dueGrantCountRes.count ?? 0) > 0 ? 'warning' : 'neutral',
      count: dueGrantCountRes.count ?? 0,
      to: '/dashboard/admin/tools',
      description: 'Scheduled grants waiting to process.'
    },
    {
      id: 'missing-schedules',
      title: 'Memberships missing future grant schedule',
      severity: membershipsMissingFutureSchedule.length > 0 ? 'error' : 'neutral',
      count: membershipsMissingFutureSchedule.length,
      to: '/dashboard/admin/tools',
      description: 'Active annual/quarterly memberships with no future grant row.'
    },
    {
      id: 'lock-incidents',
      title: 'Open lock incidents',
      severity: (openLockIncidentsRes.count ?? 0) > 0 ? 'error' : 'neutral',
      count: openLockIncidentsRes.count ?? 0,
      to: '/dashboard/admin/tools',
      description: 'Access flow incidents requiring review.'
    },
    {
      id: 'dead-lock-jobs',
      title: 'Dead lock jobs',
      severity: (deadLockJobsRes.count ?? 0) > 0 ? 'error' : 'neutral',
      count: deadLockJobsRes.count ?? 0,
      to: '/dashboard/admin/tools',
      description: 'Failed access automation tasks.'
    }
  ]

  const campaignReminders = [
    {
      id: 'campaign-performance-placeholder',
      title: 'Campaign analytics',
      status: 'placeholder',
      dueLabel: 'Build pending',
      description: 'Performance tracking and reminders will surface here once campaign analytics is wired.',
      to: '/dashboard/admin/email-campaigns'
    },
    {
      id: 'campaign-send-window-placeholder',
      title: 'Send window planning',
      status: 'placeholder',
      dueLabel: 'Build pending',
      description: 'Upcoming campaign send windows and reminders will be shown here.',
      to: '/dashboard/admin/email-campaigns'
    }
  ]

  return {
    summary: {
      dueGrantCount: dueGrantCountRes.count ?? 0,
      scheduledGrantCount: scheduledGrantCountRes.count ?? 0,
      membershipsNeedingAttention: membershipsAttentionRes.data?.length ?? 0,
      guestBookings: recentGuestBookingsRes.data?.length ?? 0,
      activeBookingsInRange: activeDemandBookingsRes.count ?? 0,
      membershipsMissingFutureSchedule: membershipsMissingFutureSchedule.length,
      pendingLockJobs: pendingLockJobsRes.count ?? 0,
      deadLockJobs: deadLockJobsRes.count ?? 0,
      openLockIncidents: openLockIncidentsRes.count ?? 0,
      totalRevenueCents,
      membershipRevenueCents,
      creditTopupRevenueCents,
      holdTopupRevenueCents,
      totalOrders
    },
    range: {
      start: rangeStartIso,
      end: rangeEndIso,
      bucket: effectiveBucket
    },
    revenueSeries,
    topMembers,
    criticalIssues,
    campaignReminders,
    accessStatus,
    dueGrants: dueGrantsRes.data ?? [],
    upcomingGrants: upcomingGrantsRes.data ?? [],
    membershipsNeedingAttention: membershipsAttentionRes.data ?? [],
    membershipsMissingFutureSchedule,
    recentGuestBookings: recentGuestBookingsRes.data ?? [],
    recentLockIncidents: recentLockIncidentsRes.data ?? []
  }
})
