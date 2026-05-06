import { DateTime } from 'luxon'
import { getRequestURL, type H3Event } from 'h3'
import { serverSupabaseServiceRole } from '#supabase/server'
import { STUDIO_TZ } from '~~/server/utils/booking/peak'
import { sendViaFomailer } from '~~/server/utils/mail/fomailer'
import { getRegisteredMailEvents, type MailTemplateCategory } from '~~/server/utils/mail/templateVariables'

type SupabaseLike = {
  from: <T = Record<string, unknown>>(table: string) => SupabaseQueryBuilder<T>
}

type SupabaseQueryResult<T = Record<string, unknown>> = {
  count?: number | null
  data?: T[] | null
  error?: { message: string } | null
}

type SupabaseSingleResult<T = Record<string, unknown>> = {
  data?: T | null
  error?: { message: string } | null
}

type SupabaseQueryBuilder<T = Record<string, unknown>> = PromiseLike<SupabaseQueryResult<T>> & {
  delete: () => SupabaseQueryBuilder<T>
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  gt: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  gte: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder<T>
  insert: (values: Record<string, unknown> | Array<Record<string, unknown>>) => SupabaseQueryBuilder<T>
  limit: (count: number) => SupabaseQueryBuilder<T>
  lt: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  lte: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  maybeSingle: () => Promise<SupabaseSingleResult<T>>
  neq: (column: string, value: unknown) => SupabaseQueryBuilder<T>
  not: (column: string, operator: string, value: unknown) => SupabaseQueryBuilder<T>
  order: (column: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  or: (filter: string) => SupabaseQueryBuilder<T>
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
  update: (values: Record<string, unknown>) => SupabaseQueryBuilder<T>
  upsert: (values: Record<string, unknown> | Array<Record<string, unknown>>, options?: Record<string, unknown>) => SupabaseQueryBuilder<T>
}

export type ReminderRuleRow = {
  event_type: string
  category: MailTemplateCategory
  enabled: boolean
  offsets_minutes: number[] | null
  cooldown_hours: number | string | null
  description: string | null
  admin_notes: string | null
}

type MailTemplateRegistryRow = {
  event_type: string
  sendgrid_template_id: string | null
  category: MailTemplateCategory | null
  active: boolean | null
}

type MailUserPreferenceRow = {
  user_id: string
  critical_enabled: boolean | null
  non_critical_enabled: boolean | null
}

type CustomerRow = {
  id: string
  user_id: string | null
  email: string | null
  phone: string | null
  first_name: string | null
  last_name: string | null
  created_at: string | null
}

type BookingRow = {
  id: string
  user_id: string | null
  customer_id: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  notes: string | null
  credits_burned: number | string | null
  booking_kind?: string | null
  booking_rate_kind?: string | null
  workshop_title?: string | null
}

type MembershipRow = {
  id: string
  user_id: string | null
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  canceled_at: string | null
  activated_at?: string | null
  created_at: string | null
  updated_at: string | null
}

type TierRow = {
  id: string
  display_name: string | null
}

type CreditLedgerRow = {
  id: string
  user_id: string
  delta: number | string | null
  reason: string | null
  external_ref: string | null
  expires_at: string | null
  created_at: string | null
}

type WaiverSignatureRow = {
  id: string
  user_id: string
  customer_id: string | null
  signer_name: string | null
  signed_at: string | null
  expires_at: string | null
}

type ReminderCandidate = {
  eventType: string
  category: MailTemplateCategory
  userId: string
  entityType: string
  entityId: string
  reminderKey: string
  to: string
  payload: Record<string, unknown>
}

type ReminderProcessResult = {
  eventType: string
  userId: string
  entityType: string
  entityId: string
  reminderKey: string
  status: 'candidate' | 'sent' | 'skipped' | 'error'
  reason?: string
  to?: string
}

export type ReminderProcessOptions = {
  limit?: number
  dryRun?: boolean
  eventType?: string | null
}

export type ReminderProcessSummary = {
  ok: boolean
  dryRun: boolean
  generatedAt: string
  candidates: number
  sent: number
  skipped: number
  errors: number
  results: ReminderProcessResult[]
}

const USER_ACTIVITY_LOOKBACK_DAYS = 365
const DEFAULT_LIMIT = 100

function getDb(event: H3Event): SupabaseLike {
  return serverSupabaseServiceRole(event) as unknown as SupabaseLike
}

function nowIso() {
  return DateTime.utc().toISO() ?? new Date().toISOString()
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map(value => value.trim()))]
}

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = DateTime.fromISO(value, { setZone: true })
  return parsed.isValid ? parsed.toUTC() : null
}

function formatDateTime(value: string | null | undefined) {
  const parsed = parseDate(value)
  return parsed ? parsed.setZone(STUDIO_TZ).toFormat('ccc, LLL d, yyyy h:mm a') : ''
}

function formatDateOnly(value: string | null | undefined) {
  const parsed = parseDate(value)
  return parsed ? parsed.setZone(STUDIO_TZ).toFormat('LLL d, yyyy') : ''
}

function humanOffset(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

function formatCadenceLabel(cadence: string | null | undefined) {
  const value = String(cadence ?? '').trim().toLowerCase()
  if (value === 'quarterly') return 'Quarterly'
  if (value === 'annual' || value === 'yearly') return 'Annual'
  if (value === 'weekly') return 'Weekly'
  if (value === 'daily') return 'Daily'
  return 'Monthly'
}

function reminderKeyForOffset(prefix: string, minutes: number) {
  return `${prefix}_${humanOffset(minutes)}`.replace(/[^A-Za-z0-9_-]/g, '_')
}

function fullName(customer: CustomerRow | null | undefined) {
  const parts = [customer?.first_name, customer?.last_name]
    .map(part => part?.trim())
    .filter(Boolean)
  return parts.join(' ') || customer?.email?.trim() || 'FO Studio customer'
}

function customerPayload(customer: CustomerRow | null | undefined) {
  return {
    customerName: fullName(customer),
    customerEmail: customer?.email ?? '',
    firstName: customer?.first_name ?? '',
    lastName: customer?.last_name ?? '',
    phone: customer?.phone ?? ''
  }
}

function makeUrls(event: H3Event) {
  const origin = getRequestURL(event).origin
  const bookingsUrl = `${origin}/dashboard/bookings`
  return {
    origin,
    dashboardUrl: `${origin}/dashboard`,
    bookUrl: `${origin}/dashboard/book`,
    bookingsUrl,
    manageUrl: bookingsUrl,
    creditsUrl: `${origin}/dashboard/credits`,
    membershipUrl: `${origin}/dashboard/membership`,
    waiverUrl: `${origin}/dashboard/waiver`,
    calendarUrl: `${origin}/calendar`,
    studioAddress: '3131 N. San Fernando Rd., Los Angeles, CA 90065'
  }
}

function resolveOffsets(rule: ReminderRuleRow) {
  const offsets = Array.isArray(rule.offsets_minutes) ? rule.offsets_minutes : []
  return offsets
    .map(value => Math.floor(Number(value)))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
}

function isDueBeforeTarget(now: DateTime, target: DateTime, offsetMinutes: number) {
  const minutesUntil = target.diff(now, 'minutes').minutes
  return minutesUntil > 0 && minutesUntil <= offsetMinutes
}

function isDueAfterAnchor(now: DateTime, anchor: DateTime, offsetMinutes: number) {
  const minutesSince = now.diff(anchor, 'minutes').minutes
  return minutesSince >= offsetMinutes
}

function daysBetween(from: DateTime, to: DateTime) {
  return Math.max(0, Math.ceil(to.diff(from, 'days').days))
}

async function throwIfError<T>(promise: PromiseLike<SupabaseQueryResult<T>>, context: string) {
  const result = await promise
  if (result.error) throw new Error(`${context}: ${result.error.message}`)
  return result.data ?? []
}

async function loadCustomersByUserIds(db: SupabaseLike, userIds: Array<string | null | undefined>) {
  const uniqueIds = uniqueStrings(userIds)
  if (!uniqueIds.length) return new Map<string, CustomerRow>()

  const rows = await throwIfError<CustomerRow>(
    db
      .from<CustomerRow>('customers')
      .select('id,user_id,email,phone,first_name,last_name,created_at')
      .in('user_id', uniqueIds),
    'load customers'
  )

  return new Map(rows.filter(row => row.user_id).map(row => [row.user_id!, row] as const))
}

async function loadTiers(db: SupabaseLike, tierIds: Array<string | null | undefined>) {
  const uniqueIds = uniqueStrings(tierIds)
  if (!uniqueIds.length) return new Map<string, TierRow>()

  const rows = await throwIfError<TierRow>(
    db
      .from<TierRow>('membership_tiers')
      .select('id,display_name')
      .in('id', uniqueIds),
    'load tiers'
  )

  return new Map(rows.map(row => [row.id, row] as const))
}

async function loadExistingUserIds(db: SupabaseLike, table: string, userIds: string[], filters: Array<(query: SupabaseQueryBuilder<Record<string, unknown>>) => SupabaseQueryBuilder<Record<string, unknown>>> = []) {
  const uniqueIds = uniqueStrings(userIds)
  if (!uniqueIds.length) return new Set<string>()

  let query = db
    .from<Record<string, unknown>>(table)
    .select('user_id')
    .in('user_id', uniqueIds)

  for (const filter of filters) query = filter(query)

  const rows = await throwIfError<{ user_id: string | null }>(query as unknown as SupabaseQueryBuilder<{ user_id: string | null }>, `load ${table}`)
  return new Set(rows.map(row => row.user_id).filter((value): value is string => Boolean(value)))
}

function withBasePayload(event: H3Event, customer: CustomerRow | null | undefined, extra: Record<string, unknown>) {
  const urls = makeUrls(event)
  return {
    ...customerPayload(customer),
    ...urls,
    ...extra
  }
}

async function buildBookingUpcomingCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const rows = await throwIfError<BookingRow>(
    db
      .from<BookingRow>('bookings')
      .select('id,user_id,customer_id,start_time,end_time,status,notes,credits_burned,booking_kind,booking_rate_kind,workshop_title')
      .in('status', ['confirmed', 'requested'])
      .not('user_id', 'is', null)
      .gt('start_time', now.toISO())
      .lte('start_time', now.plus({ minutes: maxOffset }).toISO())
      .order('start_time', { ascending: true })
      .limit(500),
    'load upcoming bookings'
  )

  const customers = await loadCustomersByUserIds(db, rows.map(row => row.user_id))
  const candidates: ReminderCandidate[] = []

  for (const booking of rows) {
    if (!booking.user_id) continue
    const start = parseDate(booking.start_time)
    if (!start) continue
    const customer = customers.get(booking.user_id)
    if (!customer?.email) continue

    for (const offset of offsets) {
      if (!isDueBeforeTarget(now, start, offset)) continue
      candidates.push({
        eventType: rule.event_type,
        category: rule.category,
        userId: booking.user_id,
        entityType: 'booking',
        entityId: booking.id,
        reminderKey: reminderKeyForOffset('before', offset),
        to: customer.email,
        payload: withBasePayload(event, customer, {
          userId: booking.user_id,
          bookingId: booking.id,
          bookingStart: booking.start_time,
          bookingEnd: booking.end_time,
          bookingStartHuman: formatDateTime(booking.start_time),
          bookingEndHuman: formatDateTime(booking.end_time),
          bookingStatus: booking.status ?? '',
          bookingNotes: booking.notes ?? '',
          bookingKind: booking.booking_kind ?? 'standard',
          bookingRateKind: booking.booking_rate_kind ?? 'standard',
          workshopTitle: booking.workshop_title ?? '',
          creditsBurned: booking.credits_burned ?? '',
          reminderLabel: `${humanOffset(offset)} before`,
          hoursUntilBooking: Math.max(0, Math.round(start.diff(now, 'hours').hours))
        })
      })
    }
  }

  return candidates
}

type CreditLot = {
  expiresAt: string | null
  remaining: number
  createdAt: string | null
}

function reduceCreditLots(rows: CreditLedgerRow[]) {
  const lots: CreditLot[] = []
  for (const row of rows.slice().sort((a, b) => {
    const aMs = parseDate(a.created_at)?.toMillis() ?? 0
    const bMs = parseDate(b.created_at)?.toMillis() ?? 0
    return aMs - bMs
  })) {
    const delta = readNumber(row.delta, 0)
    if (delta > 0) {
      lots.push({ expiresAt: row.expires_at, remaining: delta, createdAt: row.created_at })
      continue
    }

    let remainingDebit = Math.abs(delta)
    const debitLots = lots
      .filter(lot => lot.remaining > 0)
      .sort((a, b) => {
        const aMs = parseDate(a.expiresAt)?.toMillis() ?? Number.MAX_SAFE_INTEGER
        const bMs = parseDate(b.expiresAt)?.toMillis() ?? Number.MAX_SAFE_INTEGER
        if (aMs !== bMs) return aMs - bMs
        return (parseDate(a.createdAt)?.toMillis() ?? 0) - (parseDate(b.createdAt)?.toMillis() ?? 0)
      })

    for (const lot of debitLots) {
      if (remainingDebit <= 0) break
      const consume = Math.min(lot.remaining, remainingDebit)
      lot.remaining -= consume
      remainingDebit -= consume
    }
  }
  return lots.filter(lot => lot.remaining > 0)
}

async function buildCreditsExpiringCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const markerRows = await throwIfError<CreditLedgerRow>(
    db
      .from<CreditLedgerRow>('credits_ledger')
      .select('id,user_id,delta,reason,external_ref,expires_at,created_at')
      .gt('delta', 0)
      .not('expires_at', 'is', null)
      .gt('expires_at', now.toISO())
      .lte('expires_at', now.plus({ minutes: maxOffset }).toISO())
      .limit(1000),
    'load expiring credit markers'
  )

  const userIds = uniqueStrings(markerRows.map(row => row.user_id))
  if (!userIds.length) return []

  const [ledgerRows, customers] = await Promise.all([
    throwIfError<CreditLedgerRow>(
      db
        .from<CreditLedgerRow>('credits_ledger')
        .select('id,user_id,delta,reason,external_ref,expires_at,created_at')
        .in('user_id', userIds)
        .or(`expires_at.is.null,expires_at.gt.${now.toISO()}`)
        .limit(5000),
      'load active credit ledger'
    ),
    loadCustomersByUserIds(db, userIds)
  ])

  const rowsByUser = new Map<string, CreditLedgerRow[]>()
  for (const row of ledgerRows) {
    const rows = rowsByUser.get(row.user_id) ?? []
    rows.push(row)
    rowsByUser.set(row.user_id, rows)
  }

  const candidates: ReminderCandidate[] = []
  for (const [userId, rows] of rowsByUser.entries()) {
    const customer = customers.get(userId)
    if (!customer?.email) continue
    const lots = reduceCreditLots(rows)
    const lotsByExpiry = new Map<string, number>()
    for (const lot of lots) {
      if (!lot.expiresAt) continue
      const expiry = parseDate(lot.expiresAt)
      if (!expiry || expiry <= now) continue
      lotsByExpiry.set(lot.expiresAt, (lotsByExpiry.get(lot.expiresAt) ?? 0) + lot.remaining)
    }

    for (const [expiresAt, credits] of lotsByExpiry.entries()) {
      const expiry = parseDate(expiresAt)
      if (!expiry) continue
      for (const offset of offsets) {
        if (!isDueBeforeTarget(now, expiry, offset)) continue
        candidates.push({
          eventType: rule.event_type,
          category: rule.category,
          userId,
          entityType: 'credit_lot',
          entityId: expiresAt,
          reminderKey: reminderKeyForOffset('before', offset),
          to: customer.email,
          payload: withBasePayload(event, customer, {
            userId,
            creditsExpiring: Number(credits.toFixed(2)),
            creditsExpireAt: expiresAt,
            creditsExpireAtHuman: formatDateOnly(expiresAt),
            daysUntilExpiry: daysBetween(now, expiry),
            reminderLabel: `${humanOffset(offset)} before`
          })
        })
      }
    }
  }

  return candidates
}

async function buildMembershipCancellationCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const memberships = await throwIfError<MembershipRow>(
    db
      .from<MembershipRow>('memberships')
      .select('id,user_id,tier,cadence,status,current_period_start,current_period_end,canceled_at,activated_at,created_at,updated_at')
      .eq('status', 'active')
      .not('canceled_at', 'is', null)
      .gt('current_period_end', now.toISO())
      .lte('current_period_end', now.plus({ minutes: maxOffset }).toISO())
      .limit(500),
    'load canceled active memberships'
  )

  return buildMembershipWindowCandidates(event, db, rule, now, memberships, 'membership', 'current_period_end', 'before')
}

async function buildMembershipPastDueCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const memberships = await throwIfError<MembershipRow>(
    db
      .from<MembershipRow>('memberships')
      .select('id,user_id,tier,cadence,status,current_period_start,current_period_end,canceled_at,activated_at,created_at,updated_at')
      .eq('status', 'past_due')
      .limit(500),
    'load past due memberships'
  )

  return buildMembershipWindowCandidates(event, db, rule, now, memberships, 'membership', 'updated_at', 'after')
}

async function buildMembershipWindowCandidates(
  event: H3Event,
  db: SupabaseLike,
  rule: ReminderRuleRow,
  now: DateTime,
  memberships: MembershipRow[],
  entityType: string,
  anchorField: 'current_period_end' | 'updated_at',
  direction: 'before' | 'after'
) {
  const offsets = resolveOffsets(rule)
  const [customers, tiers] = await Promise.all([
    loadCustomersByUserIds(db, memberships.map(row => row.user_id)),
    loadTiers(db, memberships.map(row => row.tier))
  ])
  const candidates: ReminderCandidate[] = []

  for (const membership of memberships) {
    if (!membership.user_id) continue
    const anchorValue = anchorField === 'current_period_end'
      ? membership.current_period_end
      : (membership.updated_at ?? membership.created_at)
    const anchor = parseDate(anchorValue)
    if (!anchor) continue
    const customer = customers.get(membership.user_id)
    if (!customer?.email) continue
    const tier = membership.tier ? tiers.get(membership.tier) : null

    for (const offset of offsets) {
      const due = direction === 'before'
        ? isDueBeforeTarget(now, anchor, offset)
        : isDueAfterAnchor(now, anchor, offset)
      if (!due) continue

      candidates.push({
        eventType: rule.event_type,
        category: rule.category,
        userId: membership.user_id,
        entityType,
        entityId: membership.id,
        reminderKey: reminderKeyForOffset(direction, offset),
        to: customer.email,
        payload: withBasePayload(event, customer, {
          userId: membership.user_id,
          membershipId: membership.id,
          tierId: membership.tier ?? '',
          tierName: tier?.display_name ?? membership.tier ?? '',
          membershipPlanName: tier?.display_name ?? membership.tier ?? '',
          cadence: membership.cadence ?? '',
          cadenceLabel: formatCadenceLabel(membership.cadence),
          membershipStatus: membership.status ?? '',
          currentPeriodEnd: membership.current_period_end ?? '',
          endPeriodHuman: formatDateOnly(membership.current_period_end),
          daysUntilEnd: direction === 'before' ? daysBetween(now, anchor) : 0,
          daysPastDue: direction === 'after' ? daysBetween(anchor, now) : 0,
          reminderLabel: `${humanOffset(offset)} ${direction}`
        })
      })
    }
  }

  return candidates
}

async function buildGuestOnboardingCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const customers = await throwIfError<CustomerRow>(
    db
      .from<CustomerRow>('customers')
      .select('id,user_id,email,phone,first_name,last_name,created_at')
      .not('user_id', 'is', null)
      .not('email', 'is', null)
      .lte('created_at', now.minus({ minutes: Math.min(...offsets) }).toISO())
      .gte('created_at', now.minus({ minutes: maxOffset + 1440 }).toISO())
      .order('created_at', { ascending: false })
      .limit(1000),
    'load guest onboarding customers'
  )

  return buildNoActivityAccountCandidates(event, db, rule, now, customers, 'guest_account', 'created_at')
}

async function buildInactiveAccountCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const customers = await throwIfError<CustomerRow>(
    db
      .from<CustomerRow>('customers')
      .select('id,user_id,email,phone,first_name,last_name,created_at')
      .not('user_id', 'is', null)
      .not('email', 'is', null)
      .lte('created_at', now.minus({ minutes: Math.min(...offsets) }).toISO())
      .gte('created_at', now.minus({ minutes: maxOffset + 10080 }).toISO())
      .order('created_at', { ascending: false })
      .limit(1000),
    'load inactive customers'
  )

  return buildNoActivityAccountCandidates(event, db, rule, now, customers, 'account', 'created_at')
}

async function buildNoActivityAccountCandidates(
  event: H3Event,
  db: SupabaseLike,
  rule: ReminderRuleRow,
  now: DateTime,
  customers: CustomerRow[],
  entityType: string,
  anchorField: 'created_at'
) {
  const userIds = uniqueStrings(customers.map(row => row.user_id))
  if (!userIds.length) return []

  const [membershipUsers, bookingUsers, topupUsers] = await Promise.all([
    loadExistingUserIds(db, 'memberships', userIds, [query => query.neq('status', 'pending_checkout')]),
    loadExistingUserIds(db, 'bookings', userIds, [query => query.neq('status', 'canceled')]),
    loadExistingUserIds(db, 'credits_ledger', userIds, [query => query.eq('reason', 'topoff')])
  ])

  const offsets = resolveOffsets(rule)
  const candidates: ReminderCandidate[] = []
  for (const customer of customers) {
    if (!customer.user_id || !customer.email) continue
    if (membershipUsers.has(customer.user_id) || bookingUsers.has(customer.user_id) || topupUsers.has(customer.user_id)) continue
    const anchor = parseDate(customer[anchorField])
    if (!anchor) continue

    for (const offset of offsets) {
      if (!isDueAfterAnchor(now, anchor, offset)) continue
      candidates.push({
        eventType: rule.event_type,
        category: rule.category,
        userId: customer.user_id,
        entityType,
        entityId: customer.id,
        reminderKey: reminderKeyForOffset('after', offset),
        to: customer.email,
        payload: withBasePayload(event, customer, {
          userId: customer.user_id,
          accountCreatedAt: customer.created_at ?? '',
          daysSinceSignup: daysBetween(anchor, now),
          reminderLabel: `${humanOffset(offset)} after signup`
        })
      })
    }
  }

  return candidates
}

async function buildReactivationCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const minOffset = Math.min(...offsets)
  const bookings = await throwIfError<BookingRow>(
    db
      .from<BookingRow>('bookings')
      .select('id,user_id,customer_id,start_time,end_time,status,notes,credits_burned,booking_kind,booking_rate_kind,workshop_title')
      .not('user_id', 'is', null)
      .in('status', ['confirmed', 'requested', 'no_show'])
      .lt('end_time', now.minus({ minutes: minOffset }).toISO())
      .gt('end_time', now.minus({ days: USER_ACTIVITY_LOOKBACK_DAYS }).toISO())
      .order('end_time', { ascending: false })
      .limit(2000),
    'load reactivation bookings'
  )

  const latestByUser = new Map<string, BookingRow>()
  for (const booking of bookings) {
    if (!booking.user_id || latestByUser.has(booking.user_id)) continue
    latestByUser.set(booking.user_id, booking)
  }

  const userIds = [...latestByUser.keys()]
  if (!userIds.length) return []

  const [futureBookingUsers, customers] = await Promise.all([
    loadExistingUserIds(db, 'bookings', userIds, [
      query => query.in('status', ['confirmed', 'requested', 'pending_payment']),
      query => query.gt('start_time', now.toISO())
    ]),
    loadCustomersByUserIds(db, userIds)
  ])

  const candidates: ReminderCandidate[] = []
  for (const [userId, booking] of latestByUser.entries()) {
    if (futureBookingUsers.has(userId)) continue
    const end = parseDate(booking.end_time)
    const customer = customers.get(userId)
    if (!end || !customer?.email) continue

    for (const offset of offsets) {
      if (!isDueAfterAnchor(now, end, offset)) continue
      candidates.push({
        eventType: rule.event_type,
        category: rule.category,
        userId,
        entityType: 'booking',
        entityId: booking.id,
        reminderKey: reminderKeyForOffset('after_last_booking', offset),
        to: customer.email,
        payload: withBasePayload(event, customer, {
          userId,
          lastBookingId: booking.id,
          lastBookingStart: booking.start_time ?? '',
          lastBookingStartHuman: formatDateTime(booking.start_time),
          lastBookingEnd: booking.end_time ?? '',
          lastBookingEndHuman: formatDateTime(booking.end_time),
          daysSinceLastBooking: daysBetween(end, now),
          reminderLabel: `${humanOffset(offset)} after last booking`
        })
      })
    }
  }

  return candidates
}

async function buildWaiverExpiringCandidates(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  const offsets = resolveOffsets(rule)
  if (!offsets.length) return []

  const maxOffset = Math.max(...offsets)
  const signatures = await throwIfError<WaiverSignatureRow>(
    db
      .from<WaiverSignatureRow>('member_waiver_signatures')
      .select('id,user_id,customer_id,signer_name,signed_at,expires_at')
      .gt('expires_at', now.toISO())
      .lte('expires_at', now.plus({ minutes: maxOffset }).toISO())
      .order('expires_at', { ascending: true })
      .limit(1000),
    'load expiring waivers'
  )

  const latestByUser = new Map<string, WaiverSignatureRow>()
  for (const signature of signatures) {
    const current = latestByUser.get(signature.user_id)
    const currentExpires = parseDate(current?.expires_at)?.toMillis() ?? 0
    const nextExpires = parseDate(signature.expires_at)?.toMillis() ?? 0
    if (!current || nextExpires > currentExpires) latestByUser.set(signature.user_id, signature)
  }

  const customers = await loadCustomersByUserIds(db, [...latestByUser.keys()])
  const candidates: ReminderCandidate[] = []
  for (const [userId, signature] of latestByUser.entries()) {
    const expiry = parseDate(signature.expires_at)
    const customer = customers.get(userId)
    if (!expiry || !customer?.email) continue

    for (const offset of offsets) {
      if (!isDueBeforeTarget(now, expiry, offset)) continue
      candidates.push({
        eventType: rule.event_type,
        category: rule.category,
        userId,
        entityType: 'waiver_signature',
        entityId: signature.id,
        reminderKey: reminderKeyForOffset('before', offset),
        to: customer.email,
        payload: withBasePayload(event, customer, {
          userId,
          signerName: signature.signer_name ?? fullName(customer),
          waiverSignedAt: signature.signed_at ?? '',
          waiverSignedAtHuman: formatDateOnly(signature.signed_at),
          waiverExpiresAt: signature.expires_at ?? '',
          waiverExpiresAtHuman: formatDateOnly(signature.expires_at),
          daysUntilExpiry: daysBetween(now, expiry),
          reminderLabel: `${humanOffset(offset)} before`
        })
      })
    }
  }

  return candidates
}

async function buildCandidatesForRule(event: H3Event, db: SupabaseLike, rule: ReminderRuleRow, now: DateTime) {
  switch (rule.event_type) {
    case 'booking.upcomingReminder':
      return buildBookingUpcomingCandidates(event, db, rule, now)
    case 'credits.expiringReminder':
      return buildCreditsExpiringCandidates(event, db, rule, now)
    case 'membership.cancellationEndingReminder':
      return buildMembershipCancellationCandidates(event, db, rule, now)
    case 'membership.pastDueReminder':
      return buildMembershipPastDueCandidates(event, db, rule, now)
    case 'account.guestOnboardingReminder':
      return buildGuestOnboardingCandidates(event, db, rule, now)
    case 'account.inactiveReminder':
      return buildInactiveAccountCandidates(event, db, rule, now)
    case 'booking.reactivationReminder':
      return buildReactivationCandidates(event, db, rule, now)
    case 'waiver.expiringReminder':
      return buildWaiverExpiringCandidates(event, db, rule, now)
    default:
      return []
  }
}

async function loadRules(db: SupabaseLike, eventType?: string | null) {
  let query = db
    .from<ReminderRuleRow>('mail_reminder_rules')
    .select('event_type,category,enabled,offsets_minutes,cooldown_hours,description,admin_notes')
    .order('event_type', { ascending: true })

  if (eventType) query = query.eq('event_type', eventType)

  const rows = await throwIfError<ReminderRuleRow>(query, 'load reminder rules')
  const registered = new Map(getRegisteredMailEvents().map(item => [item.eventType, item] as const))
  return rows
    .filter(row => registered.has(row.event_type))
    .map(row => ({
      ...row,
      category: row.category ?? registered.get(row.event_type)?.category ?? 'non_critical'
    }))
}

async function loadRegistry(db: SupabaseLike, eventTypes: string[]) {
  const uniqueEventTypes = uniqueStrings(eventTypes)
  if (!uniqueEventTypes.length) return new Map<string, MailTemplateRegistryRow>()

  const rows = await throwIfError<MailTemplateRegistryRow>(
    db
      .from<MailTemplateRegistryRow>('mail_template_registry')
      .select('event_type,sendgrid_template_id,category,active')
      .in('event_type', uniqueEventTypes),
    'load mail template registry'
  )

  return new Map(rows.map(row => [row.event_type, row] as const))
}

async function loadPreferences(db: SupabaseLike, userIds: string[]) {
  const uniqueIds = uniqueStrings(userIds)
  if (!uniqueIds.length) return new Map<string, MailUserPreferenceRow>()

  const rows = await throwIfError<MailUserPreferenceRow>(
    db
      .from<MailUserPreferenceRow>('mail_user_preferences')
      .select('user_id,critical_enabled,non_critical_enabled')
      .in('user_id', uniqueIds),
    'load mail user preferences'
  )

  return new Map(rows.map(row => [row.user_id, row] as const))
}

async function recordDelivery(
  db: SupabaseLike,
  candidate: ReminderCandidate,
  values: {
    status: 'sent' | 'skipped' | 'error'
    templateId?: string | null
    skipReason?: string | null
    errorMessage?: string | null
    fomailerResponse?: unknown
  }
) {
  const now = nowIso()
  const row = {
    event_type: candidate.eventType,
    user_id: candidate.userId,
    entity_type: candidate.entityType,
    entity_id: candidate.entityId,
    reminder_key: candidate.reminderKey,
    category: candidate.category,
    status: values.status,
    to_email: candidate.to,
    template_id: values.templateId ?? null,
    skip_reason: values.skipReason ?? null,
    error_message: values.errorMessage ?? null,
    payload: candidate.payload,
    fomailer_response: values.fomailerResponse ?? null,
    sent_at: values.status === 'sent' ? now : null,
    skipped_at: values.status === 'skipped' ? now : null
  }

  const result = await db
    .from('mail_reminder_deliveries')
    .upsert(row, { onConflict: 'event_type,user_id,entity_type,entity_id,reminder_key' })

  if (result.error) throw new Error(`record delivery: ${result.error.message}`)
}

async function hasDelivery(db: SupabaseLike, candidate: ReminderCandidate) {
  const result = await db
    .from<{ id: string }>('mail_reminder_deliveries')
    .select('id')
    .eq('event_type', candidate.eventType)
    .eq('user_id', candidate.userId)
    .eq('entity_type', candidate.entityType)
    .eq('entity_id', candidate.entityId)
    .eq('reminder_key', candidate.reminderKey)
    .limit(1)

  if (result.error) throw new Error(`check delivery: ${result.error.message}`)
  return (result.data?.length ?? 0) > 0
}

async function isInCooldown(db: SupabaseLike, candidate: ReminderCandidate, rule: ReminderRuleRow) {
  const cooldownHours = readNumber(rule.cooldown_hours, 0)
  if (cooldownHours <= 0) return false
  const since = DateTime.utc().minus({ hours: cooldownHours }).toISO()
  const result = await db
    .from<{ id: string }>('mail_reminder_deliveries')
    .select('id')
    .eq('event_type', candidate.eventType)
    .eq('user_id', candidate.userId)
    .eq('status', 'sent')
    .gte('created_at', since)
    .limit(1)

  if (result.error) throw new Error(`check cooldown: ${result.error.message}`)
  return (result.data?.length ?? 0) > 0
}

function preferenceAllows(category: MailTemplateCategory, preference: MailUserPreferenceRow | undefined) {
  if (category === 'critical') return preference?.critical_enabled ?? true
  return preference?.non_critical_enabled ?? true
}

function fomailerResponseReason(response: Awaited<ReturnType<typeof sendViaFomailer>>) {
  if (response.ok) return null
  return readString(response.reason, 'send_failed')
}

export async function processMailReminders(event: H3Event, options: ReminderProcessOptions = {}): Promise<ReminderProcessSummary> {
  const db = getDb(event)
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? DEFAULT_LIMIT)))
  const now = DateTime.utc()
  const rules = (await loadRules(db, options.eventType)).filter(rule => rule.enabled)
  const ruleByEventType = new Map(rules.map(rule => [rule.event_type, rule] as const))
  const generatedAt = now.toISO() ?? nowIso()

  const candidates: ReminderCandidate[] = []
  for (const rule of rules) {
    const ruleCandidates = await buildCandidatesForRule(event, db, rule, now)
    candidates.push(...ruleCandidates)
    if (candidates.length >= limit) break
  }

  const boundedCandidates = candidates.slice(0, limit)
  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      generatedAt,
      candidates: boundedCandidates.length,
      sent: 0,
      skipped: 0,
      errors: 0,
      results: boundedCandidates.map(candidate => ({
        eventType: candidate.eventType,
        userId: candidate.userId,
        entityType: candidate.entityType,
        entityId: candidate.entityId,
        reminderKey: candidate.reminderKey,
        status: 'candidate',
        to: candidate.to
      }))
    }
  }

  const [registryByEventType, preferencesByUserId] = await Promise.all([
    loadRegistry(db, boundedCandidates.map(candidate => candidate.eventType)),
    loadPreferences(db, boundedCandidates.map(candidate => candidate.userId))
  ])

  const results: ReminderProcessResult[] = []
  let sent = 0
  let skipped = 0
  let errors = 0

  for (const candidate of boundedCandidates) {
    const baseResult = {
      eventType: candidate.eventType,
      userId: candidate.userId,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      reminderKey: candidate.reminderKey,
      to: candidate.to
    }

    try {
      const rule = ruleByEventType.get(candidate.eventType)
      if (!rule) {
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: 'rule_missing' })
        continue
      }

      if (await hasDelivery(db, candidate)) {
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: 'duplicate' })
        continue
      }

      if (await isInCooldown(db, candidate, rule)) {
        await recordDelivery(db, candidate, { status: 'skipped', skipReason: 'cooldown' })
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: 'cooldown' })
        continue
      }

      const registry = registryByEventType.get(candidate.eventType)
      const templateId = registry?.sendgrid_template_id?.trim() ?? ''
      if (!registry || !templateId) {
        await recordDelivery(db, candidate, { status: 'skipped', skipReason: 'template_missing' })
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: 'template_missing' })
        continue
      }

      if (registry.active === false) {
        await recordDelivery(db, candidate, { status: 'skipped', templateId, skipReason: 'template_inactive' })
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: 'template_inactive' })
        continue
      }

      const category = registry.category ?? candidate.category
      if (!preferenceAllows(category, preferencesByUserId.get(candidate.userId))) {
        await recordDelivery(db, { ...candidate, category }, { status: 'skipped', templateId, skipReason: category === 'critical' ? 'critical_opted_out' : 'user_opted_out' })
        skipped += 1
        results.push({ ...baseResult, status: 'skipped', reason: category === 'critical' ? 'critical_opted_out' : 'user_opted_out' })
        continue
      }

      const sendResult = await sendViaFomailer(event, {
        type: candidate.eventType,
        payload: {
          ...candidate.payload,
          to: candidate.to,
          userId: candidate.userId,
          eventType: candidate.eventType,
          templateId
        }
      })

      if (!sendResult.ok) {
        const reason = fomailerResponseReason(sendResult) ?? 'send_failed'
        await recordDelivery(db, { ...candidate, category }, { status: 'error', templateId, errorMessage: reason, fomailerResponse: sendResult })
        errors += 1
        results.push({ ...baseResult, status: 'error', reason })
        continue
      }

      await recordDelivery(db, { ...candidate, category }, { status: 'sent', templateId, fomailerResponse: sendResult.data })
      sent += 1
      results.push({ ...baseResult, status: 'sent' })
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown_error'
      errors += 1
      results.push({ ...baseResult, status: 'error', reason })
    }
  }

  return {
    ok: errors === 0,
    dryRun: false,
    generatedAt,
    candidates: boundedCandidates.length,
    sent,
    skipped,
    errors,
    results
  }
}
