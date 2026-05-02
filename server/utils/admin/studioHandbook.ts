import type { H3Event } from 'h3'
import { DateTime } from 'luxon'
import { queryCollection } from '@nuxt/content/server'
import { serverSupabaseServiceRole } from '#supabase/server'
import { DEFAULT_HOLD_END_HOUR, DEFAULT_HOLD_MIN_END_HOUR, DEFAULT_MIN_HOLD_BOOKING_HOURS } from '~~/server/utils/booking/holds'
import { loadGuestBookingPolicy, loadStandbyBookingPolicy, formatHourLabel } from '~~/server/utils/booking/guestPolicy'
import { loadPeakWindowConfig, toPeakWindowPayload, STUDIO_TZ } from '~~/server/utils/booking/peak'
import { ACCESS_WINDOW_LEAD_MINUTES, ACCESS_WINDOW_TRAIL_MINUTES } from '~~/server/utils/access/policy'
import { getLockSlotRanges } from '~~/server/utils/access/slots'
import { defaultReferralCredits } from '~~/server/utils/referrals'

type QueryResult<T> = { data: T | null, error: { message?: string, code?: string } | null, count?: number | null }
type SupabaseQuery<T = unknown[]> = PromiseLike<QueryResult<T>> & {
  select: (columns?: string, options?: Record<string, unknown>) => SupabaseQuery<T>
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>
  in: (column: string, values: unknown[]) => SupabaseQuery<T>
  eq: (column: string, value: unknown) => SupabaseQuery<T>
}
type SupabaseLike = {
  from: (table: string) => SupabaseQuery
}

type RawVariation = {
  tier_id?: string | null
  cadence?: string | null
  provider?: string | null
  provider_plan_id?: string | null
  provider_plan_variation_id?: string | null
  credits_per_month?: number | string | null
  price_cents?: number | string | null
  currency?: string | null
  discount_label?: string | null
  active?: boolean | null
  visible?: boolean | null
  sort_order?: number | string | null
}

type RawTier = {
  id?: string | null
  display_name?: string | null
  description?: string | null
  booking_window_days?: number | string | null
  peak_multiplier?: number | string | null
  max_bank?: number | string | null
  max_slots?: number | string | null
  holds_included?: number | string | null
  active_hold_cap?: number | string | null
  credit_expiry_days?: number | string | null
  topoff_credit_expiry_days?: number | string | null
  active?: boolean | null
  visible?: boolean | null
  direct_access_only?: boolean | null
  sort_order?: number | string | null
  membership_plan_variations?: RawVariation[] | null
}

type RawCreditOption = {
  id?: string | null
  key?: string | null
  label?: string | null
  description?: string | null
  credits?: number | string | null
  base_price_cents?: number | string | null
  sale_price_cents?: number | string | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  active?: boolean | null
  sort_order?: number | string | null
}

type RawReferralRule = {
  tier_id?: string | null
  cadence?: string | null
  referrer_credits?: number | string | null
  referred_credits?: number | string | null
}

export type HandbookPlanVariation = {
  cadence: string
  provider: string
  creditsPerMonth: number
  priceCents: number
  currency: string
  discountLabel: string | null
  active: boolean
  visible: boolean
  squareSynced: boolean
  sortOrder: number
}

export type HandbookTier = {
  id: string
  displayName: string
  description: string | null
  bookingWindowDays: number
  peakMultiplier: number
  maxBank: number | null
  maxSlots: number | null
  holdsIncluded: number
  activeHoldCap: number
  creditExpiryDays: number
  topoffCreditExpiryDays: number
  active: boolean
  visible: boolean
  directAccessOnly: boolean
  sortOrder: number
  variations: HandbookPlanVariation[]
}

export type HandbookPayload = {
  generatedAt: string
  timezone: string
  sources: Array<{ label: string, status: 'live' | 'fallback' | 'error', detail: string }>
  quickReference: {
    customerSafe: string[]
    internalNotes: string[]
  }
  rates: {
    tiers: HandbookTier[]
    creditOptions: Array<{
      key: string
      label: string
      description: string | null
      credits: number
      basePriceCents: number
      salePriceCents: number | null
      active: boolean
      sortOrder: number
    }>
    referralRules: Array<{
      tierId: string
      cadence: string
      referrerCredits: number
      referredCredits: number
    }>
  }
  policies: {
    guest: {
      peakMultiplier: number
      ratePerCreditCents: number
      bookingWindowDays: number
      hoursLabel: string
      minBookingHours: number
      bookingIncrementMinutes: number
      creditExpiryDays: number
      pendingPaymentHoldMinutes: number
    }
    standby: {
      enabled: boolean
      minOpenSlotHours: number
      discountMultiplier: number
      memberWindowLabel: string
      guestWindowHours: number
    }
    peak: {
      daysLabel: string
      windowLabel: string
      timezone: string
    }
    holds: {
      holdCreditCost: number
      minHoldBookingHours: number
      holdMinEndHour: number
      holdEndHour: number
      minEndLabel: string
      holdEndLabel: string
    }
    credits: {
      membershipCreditExpiryDays: number
      topoffCreditExpiryDays: number
      rolloverMaxMultiplier: number
      workshopCreditMultiplier: number
    }
  }
  customerFlows: Array<{
    title: string
    customerSafe: string
    internal: string
  }>
  doorAccess: {
    overview: string[]
    technical: {
      leadMinutes: number
      trailMinutes: number
      slotRanges: {
        memberStart: number
        memberEnd: number
        guestStart: number
        guestEnd: number
      }
      status: {
        pendingJobs: number
        deadJobs: number
        openIncidents: number
        activePermanentCodes: number
        activeMemberSlots: number
        activeGuestSlots: number
        scheduledOrActiveGuestCodes: number
        pendingDoorCodeRequests: number
      }
      notes: string[]
    }
  }
  equipment: {
    heroTitle: string
    heroBody: string
    includedHeader: string
    includedGear: string[]
    equipmentListHeader: string
    equipmentList: string[]
    guidelinesHeader: string
    sessionGuidelines: string[]
  }
  callAnswers: Array<{
    question: string
    customerSafeAnswer: string
    internalNote: string
    tags: string[]
  }>
}

const fallbackEquipment: HandbookPayload['equipment'] = {
  heroTitle: 'Studio Setup',
  heroBody: 'FO Studio is built for fast, reliable sessions. Memberships include the in-house gear and consumables, so your main focus is choosing the right plan and getting on set quickly.',
  includedHeader: 'What members can expect',
  includedGear: [
    'All in-house lighting, grip, and core studio equipment are included for member sessions.',
    'Backdrop paper and day-to-day consumables are included, so members can arrive ready to shoot.',
    'Membership keeps production simple: book, pay, and show up without separate equipment rentals.'
  ],
  equipmentListHeader: 'Equipment list',
  equipmentList: [
    'Profoto monolights and wireless triggers.',
    'Softboxes, umbrellas, strip modifiers, and beauty-dish style modifiers.',
    'C-stands, combo stands, boom support, sandbags, and core grip hardware.',
    'V-flats, apple boxes, clamps, extension runs, and common support tools.',
    'Seamless backdrop paper system with studio-ready color rolls.',
    'Styling tables, stools, and practical props for product and portrait setups.'
  ],
  guidelinesHeader: 'Before you book',
  sessionGuidelines: [
    'Bring any specialty gear, props, or production-specific tools your session depends on.',
    'Plan extra setup time for larger sets, multi-subject sessions, or custom lighting diagrams.',
    'Compare membership tiers before booking so lead time and hold access match the workflow.'
  ]
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toInt(value: unknown, fallback = 0) {
  return Math.floor(toNumber(value, fallback))
}

function cents(value: number) {
  return `$${(value / 100).toFixed(2)}`
}

function isSaleActive(option: RawCreditOption, now = Date.now()) {
  const salePrice = option.sale_price_cents
  if (salePrice === null || salePrice === undefined || salePrice === '') return false
  const startsAt = option.sale_starts_at ? Date.parse(option.sale_starts_at) : null
  const endsAt = option.sale_ends_at ? Date.parse(option.sale_ends_at) : null
  if (startsAt && Number.isFinite(startsAt) && now < startsAt) return false
  if (endsAt && Number.isFinite(endsAt) && now > endsAt) return false
  return true
}

function readConfigValue(rows: Array<{ key: string, value: unknown }>, key: string, fallback: number) {
  const found = rows.find(row => row.key === key)
  return toNumber(found?.value, fallback)
}

async function safeCount(
  db: SupabaseLike,
  table: string,
  build: (query: SupabaseQuery) => PromiseLike<QueryResult<unknown[]>>
) {
  try {
    const result = await build(db.from(table).select('id', { count: 'exact', head: true }))
    if (result.error) return 0
    return Number(result.count ?? 0)
  } catch {
    return 0
  }
}

async function loadEquipmentContent(event: H3Event, sources: HandbookPayload['sources']) {
  try {
    const content = await queryCollection(event, 'siteEquipment').first() as Record<string, unknown> | null
    if (!content) {
      sources.push({ label: 'Equipment content', status: 'fallback', detail: 'content/site/equipment.yml was not available through Nuxt Content.' })
      return fallbackEquipment
    }
    sources.push({ label: 'Equipment content', status: 'live', detail: 'Loaded from Nuxt Content collection siteEquipment.' })
    return {
      heroTitle: String(content.heroTitle ?? fallbackEquipment.heroTitle),
      heroBody: String(content.heroBody ?? fallbackEquipment.heroBody),
      includedHeader: String(content.includedHeader ?? fallbackEquipment.includedHeader),
      includedGear: Array.isArray(content.includedGear) ? content.includedGear.map(String) : fallbackEquipment.includedGear,
      equipmentListHeader: String(content.equipmentListHeader ?? fallbackEquipment.equipmentListHeader),
      equipmentList: Array.isArray(content.equipmentList) ? content.equipmentList.map(String) : fallbackEquipment.equipmentList,
      guidelinesHeader: String(content.guidelinesHeader ?? fallbackEquipment.guidelinesHeader),
      sessionGuidelines: Array.isArray(content.sessionGuidelines) ? content.sessionGuidelines.map(String) : fallbackEquipment.sessionGuidelines
    }
  } catch (error) {
    sources.push({ label: 'Equipment content', status: 'error', detail: error instanceof Error ? error.message : 'Could not load equipment content.' })
    return fallbackEquipment
  }
}

async function loadTiers(db: SupabaseLike, sources: HandbookPayload['sources']) {
  const selectWithModernColumns = `
    id,display_name,description,booking_window_days,peak_multiplier,max_bank,max_slots,holds_included,active_hold_cap,credit_expiry_days,topoff_credit_expiry_days,active,visible,direct_access_only,sort_order,
    membership_plan_variations:membership_plan_variations(tier_id,cadence,provider,provider_plan_id,provider_plan_variation_id,credits_per_month,price_cents,currency,discount_label,active,visible,sort_order)
  `
  const selectLegacy = `
    id,display_name,description,booking_window_days,peak_multiplier,max_bank,max_slots,holds_included,active,visible,sort_order,
    membership_plan_variations:membership_plan_variations(tier_id,cadence,provider,provider_plan_id,provider_plan_variation_id,credits_per_month,price_cents,currency,discount_label,active,visible,sort_order)
  `

  let result = await db.from('membership_tiers').select(selectWithModernColumns).order('sort_order', { ascending: true })
  if (result.error && /column .* does not exist|relation .* does not exist/i.test(result.error.message ?? '')) {
    result = await db.from('membership_tiers').select(selectLegacy).order('sort_order', { ascending: true })
  }
  if (result.error) {
    sources.push({ label: 'Membership tiers', status: 'error', detail: result.error.message ?? 'Could not load tiers.' })
    return [] as HandbookTier[]
  }

  sources.push({ label: 'Membership tiers', status: 'live', detail: 'Loaded active/visible status, pricing variations, credits, caps, and holds.' })
  return ((result.data ?? []) as RawTier[]).map((tier) => {
    const variations = (tier.membership_plan_variations ?? [])
      .filter(variation => variation.provider === 'square')
      .sort((left, right) => toInt(left.sort_order, 0) - toInt(right.sort_order, 0))
      .map(variation => ({
        cadence: String(variation.cadence ?? ''),
        provider: String(variation.provider ?? 'square'),
        creditsPerMonth: toNumber(variation.credits_per_month, 0),
        priceCents: toInt(variation.price_cents, 0),
        currency: String(variation.currency ?? 'USD'),
        discountLabel: variation.discount_label ? String(variation.discount_label) : null,
        active: variation.active !== false,
        visible: variation.visible !== false,
        squareSynced: Boolean(String(variation.provider_plan_variation_id ?? '').trim()),
        sortOrder: toInt(variation.sort_order, 0)
      }))

    return {
      id: String(tier.id ?? ''),
      displayName: String(tier.display_name ?? tier.id ?? 'Membership tier'),
      description: tier.description ? String(tier.description) : null,
      bookingWindowDays: toInt(tier.booking_window_days, 30),
      peakMultiplier: toNumber(tier.peak_multiplier, 1.5),
      maxBank: tier.max_bank === null || tier.max_bank === undefined ? null : toInt(tier.max_bank, 0),
      maxSlots: tier.max_slots === null || tier.max_slots === undefined ? null : toInt(tier.max_slots, 0),
      holdsIncluded: toInt(tier.holds_included, 0),
      activeHoldCap: toInt(tier.active_hold_cap, 0),
      creditExpiryDays: toInt(tier.credit_expiry_days, 90),
      topoffCreditExpiryDays: toInt(tier.topoff_credit_expiry_days, 30),
      active: tier.active !== false,
      visible: tier.visible !== false,
      directAccessOnly: Boolean(tier.direct_access_only),
      sortOrder: toInt(tier.sort_order, 0),
      variations
    }
  })
}

async function loadCreditOptions(db: SupabaseLike, sources: HandbookPayload['sources']) {
  const result = await db
    .from('credit_pricing_options')
    .select('id,key,label,description,credits,base_price_cents,sale_price_cents,sale_starts_at,sale_ends_at,active,sort_order')
    .order('sort_order', { ascending: true })

  if (result.error) {
    sources.push({ label: 'Credit top-up options', status: 'error', detail: result.error.message ?? 'Could not load credit options.' })
    return [] as HandbookPayload['rates']['creditOptions']
  }

  sources.push({ label: 'Credit top-up options', status: 'live', detail: 'Loaded from credit_pricing_options.' })
  return ((result.data ?? []) as RawCreditOption[]).map(option => ({
    key: String(option.key ?? ''),
    label: String(option.label ?? option.key ?? 'Credit option'),
    description: option.description ? String(option.description) : null,
    credits: toNumber(option.credits, 0),
    basePriceCents: toInt(option.base_price_cents, 0),
    salePriceCents: isSaleActive(option) ? toInt(option.sale_price_cents, 0) : null,
    active: option.active !== false,
    sortOrder: toInt(option.sort_order, 0)
  }))
}

async function loadReferralRules(db: SupabaseLike, tiers: HandbookTier[], sources: HandbookPayload['sources']) {
  const result = await db
    .from('referral_credit_rules')
    .select('tier_id,cadence,referrer_credits,referred_credits')
    .order('tier_id', { ascending: true })
    .order('cadence', { ascending: true })

  if (!result.error && Array.isArray(result.data) && result.data.length) {
    sources.push({ label: 'Referral rules', status: 'live', detail: 'Loaded from referral_credit_rules.' })
    return (result.data as RawReferralRule[]).map(rule => ({
      tierId: String(rule.tier_id ?? ''),
      cadence: String(rule.cadence ?? ''),
      referrerCredits: toNumber(rule.referrer_credits, 0),
      referredCredits: toNumber(rule.referred_credits, 0)
    }))
  }

  sources.push({ label: 'Referral rules', status: result.error ? 'error' : 'fallback', detail: result.error?.message ?? 'Derived from tier variations and default referral reward logic.' })
  return tiers.flatMap(tier => tier.variations.map((variation) => {
    const fallback = defaultReferralCredits(tier.id, variation.cadence)
    return {
      tierId: tier.id,
      cadence: variation.cadence,
      referrerCredits: fallback,
      referredCredits: fallback
    }
  }))
}

async function loadConfigRows(db: SupabaseLike, sources: HandbookPayload['sources']) {
  const keys = [
    'credit_expiry_days',
    'credit_rollover_max_multiplier',
    'workshop_credit_multiplier',
    'hold_credit_cost',
    'min_hold_booking_hours',
    'hold_min_end_hour',
    'hold_end_hour'
  ]
  const result = await db.from('system_config').select('key,value').in('key', keys)
  if (result.error) {
    sources.push({ label: 'System config', status: 'error', detail: result.error.message ?? 'Could not load config rows.' })
    return [] as Array<{ key: string, value: unknown }>
  }
  sources.push({ label: 'System config', status: 'live', detail: 'Loaded credit, hold, and workshop settings from system_config.' })
  return (result.data ?? []) as Array<{ key: string, value: unknown }>
}

async function loadAccessStatus(event: H3Event, db: SupabaseLike) {
  const [
    pendingJobs,
    deadJobs,
    openIncidents,
    activePermanentCodes,
    activeMemberSlots,
    activeGuestSlots,
    scheduledOrActiveGuestCodes,
    pendingDoorCodeRequests,
    slotRanges
  ] = await Promise.all([
    safeCount(db, 'lock_access_jobs', query => query.in('status', ['scheduled', 'running'])),
    safeCount(db, 'lock_access_jobs', query => query.eq('status', 'dead')),
    safeCount(db, 'lock_access_incidents', query => query.in('status', ['open', 'investigating'])),
    safeCount(db, 'lock_permanent_codes', query => query.eq('active', true)),
    safeCount(db, 'lock_slot_assignments', query => query.eq('slot_kind', 'member').eq('active', true)),
    safeCount(db, 'lock_slot_assignments', query => query.eq('slot_kind', 'guest').eq('active', true)),
    safeCount(db, 'booking_access_codes', query => query.eq('code_type', 'guest').in('status', ['scheduled', 'active'])),
    safeCount(db, 'door_code_change_requests', query => query.eq('status', 'pending')),
    getLockSlotRanges(event).catch(() => ({ memberStart: 1, memberEnd: 49, guestStart: 50, guestEnd: 99 }))
  ])

  return {
    slotRanges,
    status: {
      pendingJobs,
      deadJobs,
      openIncidents,
      activePermanentCodes,
      activeMemberSlots,
      activeGuestSlots,
      scheduledOrActiveGuestCodes,
      pendingDoorCodeRequests
    }
  }
}

function buildCustomerFlows(policies: HandbookPayload['policies']): HandbookPayload['customerFlows'] {
  return [
    {
      title: 'Anonymous visitor wants to book',
      customerSafe: 'They can view availability, but booking requires creating or signing into an account first.',
      internal: 'Keep membership checkout separate from guest booking. If they pick a plan from pricing, preserve the membership checkout path; if they pick a calendar slot, send them to signup/login and return to booking.'
    },
    {
      title: 'Guest creates a normal booking',
      customerSafe: `Guest bookings use premium credits, must be at least ${policies.guest.minBookingHours} hours, and must fit between ${policies.guest.hoursLabel}.`,
      internal: 'Preview calculates credit need, available credits, shortfall credits, and Square amount due. If shortfall exists, the system creates a pending_payment reservation, charges only the shortfall, mints top-off credits, then burns the full booking cost.'
    },
    {
      title: 'Active member creates a booking',
      customerSafe: 'Members use their included and top-off credits, get their tier booking window, and can use hold benefits when eligible.',
      internal: 'Active entitlement is based on membership status plus current period dates. Expired or canceled accounts fall back to guest rules while keeping their customer row, door code, credits, waiver, and account history.'
    },
    {
      title: 'Standby booking',
      customerSafe: 'Standby is a same-day discounted option when a long enough open slot is available.',
      internal: `Standby requires a same-day open slot of at least ${policies.standby.minOpenSlotHours} hours and applies a ${policies.standby.discountMultiplier}x multiplier after normal guest/member peak pricing. Users cannot cancel, reschedule, extend, or chain standby bookings.`
    },
    {
      title: 'Workshop booking',
      customerSafe: 'Workshop booking is only available when enabled on the account, uses a higher credit multiplier, and requires a liability acknowledgement.',
      internal: `Workshop burn is standard credits times ${policies.credits.workshopCreditMultiplier}. Workshop metadata can promote title, description, and link on booking calendars.`
    }
  ]
}

function buildCallAnswers(policies: HandbookPayload['policies'], tiers: HandbookTier[]): HandbookPayload['callAnswers'] {
  const firstTier = tiers.find(tier => tier.active && tier.visible && !tier.directAccessOnly)
  const firstMonthly = firstTier?.variations.find(variation => variation.cadence === 'monthly' && variation.active && variation.visible)
  const entryPrice = firstMonthly ? cents(firstMonthly.priceCents) : 'the lowest monthly tier price shown online'

  return [
    {
      question: 'Can I book without becoming a member?',
      customerSafeAnswer: `Yes. Create an account and book as a guest. Guest bookings use premium credits, are limited to ${policies.guest.bookingWindowDays} days ahead, and must be between ${policies.guest.hoursLabel}.`,
      internalNote: 'If they book often or the guest credit cost is approaching a membership price, compare memberships. Do not block the guest path.',
      tags: ['guest', 'booking', 'sales']
    },
    {
      question: 'What is the cheapest way to book regularly?',
      customerSafeAnswer: `Membership usually makes sense for repeat use. The entry membership starts at ${entryPrice}/month and includes monthly credits, lower effective credit burn, longer booking windows, and member benefits.`,
      internalNote: 'Use actual live tier table on the handbook Rates tab before quoting exact plan/cadence details.',
      tags: ['membership', 'rates', 'sales']
    },
    {
      question: 'Why does peak time cost more credits?',
      customerSafeAnswer: `Peak windows are ${policies.peak.daysLabel}, ${policies.peak.windowLabel}. Peak time uses a multiplier so high-demand hours stay fair and available.`,
      internalNote: 'Guest peak multiplier and member tier peak multipliers differ. Quote the customer from their account state when possible.',
      tags: ['credits', 'peak']
    },
    {
      question: 'Can I hold a setup overnight?',
      customerSafeAnswer: `Overnight holds are a member benefit. Holds require eligible membership benefits, a booking of at least ${policies.holds.minHoldBookingHours} hours, and a booking ending at or after ${policies.holds.minEndLabel}.`,
      internalNote: 'Hold time is not booking time. Door lock access is not available during hold hours unless staff intentionally coordinates access.',
      tags: ['holds', 'membership']
    },
    {
      question: 'How does door access work?',
      customerSafeAnswer: `Account and booking access is time-limited around confirmed sessions. Access normally starts ${ACCESS_WINDOW_LEAD_MINUTES} minutes before the booking and ends ${ACCESS_WINDOW_TRAIL_MINUTES} minutes after.`,
      internalNote: 'Do not give technical slot details to customers. If a code fails, check admin Door Codes and access incidents before manually overriding.',
      tags: ['door access', 'operations']
    },
    {
      question: 'What equipment is included?',
      customerSafeAnswer: 'In-house lighting, grip, modifiers, backdrop paper, props, and standard consumables are included for member sessions. Specialty production-specific gear should still be brought by the customer.',
      internalNote: 'Use the Equipment tab for the current list; avoid promising specific specialty gear unless confirmed in-house.',
      tags: ['equipment']
    },
    {
      question: 'What happens if my membership expires?',
      customerSafeAnswer: 'The account remains active. If membership is inactive, the account can still book as a guest under guest rules.',
      internalNote: 'Operational account state is active_member only when membership is currently active; expired/canceled falls back to guest mode.',
      tags: ['membership', 'guest']
    }
  ]
}

export async function buildStudioHandbook(event: H3Event): Promise<HandbookPayload> {
  const db = serverSupabaseServiceRole(event) as unknown as SupabaseLike
  const sources: HandbookPayload['sources'] = []

  const [guestPolicy, standbyPolicy, peakConfig, equipment, configRows, tiers, creditOptions, access] = await Promise.all([
    loadGuestBookingPolicy(event),
    loadStandbyBookingPolicy(event),
    loadPeakWindowConfig(event),
    loadEquipmentContent(event, sources),
    loadConfigRows(db, sources),
    loadTiers(db, sources),
    loadCreditOptions(db, sources),
    loadAccessStatus(event, db)
  ])

  const referralRules = await loadReferralRules(db, tiers, sources)
  sources.push(
    { label: 'Guest booking policy', status: 'live', detail: 'Resolved from configured guest booking policy with application defaults for missing keys.' },
    { label: 'Standby policy', status: 'live', detail: 'Resolved from configured standby policy with application defaults for missing keys.' },
    { label: 'Peak policy', status: 'live', detail: 'Resolved from configured peak window policy.' },
    { label: 'Door access status', status: 'live', detail: 'Loaded operational counts and lock slot ranges from access tables.' }
  )
  const holdCreditCost = readConfigValue(configRows, 'hold_credit_cost', 2)
  const minHoldBookingHours = readConfigValue(configRows, 'min_hold_booking_hours', DEFAULT_MIN_HOLD_BOOKING_HOURS)
  const holdMinEndHour = readConfigValue(configRows, 'hold_min_end_hour', DEFAULT_HOLD_MIN_END_HOUR)
  const holdEndHour = readConfigValue(configRows, 'hold_end_hour', DEFAULT_HOLD_END_HOUR)
  const creditExpiryDays = readConfigValue(configRows, 'credit_expiry_days', 90)
  const rolloverMaxMultiplier = readConfigValue(configRows, 'credit_rollover_max_multiplier', 2)
  const workshopCreditMultiplier = readConfigValue(configRows, 'workshop_credit_multiplier', 2)
  const peak = toPeakWindowPayload(peakConfig, null)

  const policies: HandbookPayload['policies'] = {
    guest: {
      peakMultiplier: guestPolicy.peakMultiplier,
      ratePerCreditCents: guestPolicy.ratePerCreditCents,
      bookingWindowDays: guestPolicy.bookingWindowDays,
      hoursLabel: `${formatHourLabel(guestPolicy.startHour)}-${formatHourLabel(guestPolicy.endHour)}`,
      minBookingHours: guestPolicy.minBookingHours,
      bookingIncrementMinutes: guestPolicy.bookingIncrementMinutes,
      creditExpiryDays: guestPolicy.creditExpiryDays,
      pendingPaymentHoldMinutes: guestPolicy.pendingPaymentHoldMinutes
    },
    standby: {
      enabled: standbyPolicy.enabled,
      minOpenSlotHours: standbyPolicy.minOpenSlotHours,
      discountMultiplier: standbyPolicy.discountMultiplier,
      memberWindowLabel: `${formatHourLabel(standbyPolicy.memberStartHour)} start, ${standbyPolicy.memberWindowHours} hour reach, same-day only`,
      guestWindowHours: standbyPolicy.guestWindowHours
    },
    peak: {
      daysLabel: peak.daysLabel,
      windowLabel: peak.windowLabel,
      timezone: peak.timezone
    },
    holds: {
      holdCreditCost,
      minHoldBookingHours,
      holdMinEndHour,
      holdEndHour,
      minEndLabel: formatHourLabel(holdMinEndHour),
      holdEndLabel: formatHourLabel(holdEndHour)
    },
    credits: {
      membershipCreditExpiryDays: creditExpiryDays,
      topoffCreditExpiryDays: tiers[0]?.topoffCreditExpiryDays ?? 30,
      rolloverMaxMultiplier,
      workshopCreditMultiplier
    }
  }

  const customerFlows = buildCustomerFlows(policies)
  const callAnswers = buildCallAnswers(policies, tiers)

  return {
    generatedAt: DateTime.now().setZone(STUDIO_TZ).toISO() ?? new Date().toISOString(),
    timezone: STUDIO_TZ,
    sources,
    quickReference: {
      customerSafe: [
        `Guests can book after account signup, use premium credits at ${cents(policies.guest.ratePerCreditCents)} per credit, and book between ${policies.guest.hoursLabel}.`,
        `Guest normal bookings require at least ${policies.guest.minBookingHours} hours and ${policies.guest.bookingIncrementMinutes}-minute increments.`,
        'Members get tier-based booking windows, lower effective peak multipliers, included credits, and member-only hold benefits.',
        `Door access is time-limited: ${ACCESS_WINDOW_LEAD_MINUTES} minutes before through ${ACCESS_WINDOW_TRAIL_MINUTES} minutes after confirmed sessions.`,
        'In-house equipment and standard consumables are included; customers should bring specialty production-specific gear.'
      ],
      internalNotes: [
        'Treat this page/PDF as internal only. Customer-safe answers are labeled separately from internal implementation notes.',
        'Expired or canceled members remain valid accounts but book under guest rules until membership is active again.',
        'For exact pricing, quote the live Rates tab because Square/admin updates can change plan variations and credit bundles.'
      ]
    },
    rates: {
      tiers,
      creditOptions,
      referralRules
    },
    policies,
    customerFlows,
    doorAccess: {
      overview: [
        'Every authenticated account can have an account-level 6-digit door code stored on its customer row.',
        'Guest bookings can receive temporary booking-specific access codes that are only valid for the booking access window.',
        'Member access jobs allocate member lock slots; guest access jobs allocate guest lock slots by booking.',
        'Access windows are generated from booking start/end, with lead and trail buffers.',
        'Admin Door Codes controls account codes and permanent operational codes; access incidents surface sync failures.'
      ],
      technical: {
        leadMinutes: ACCESS_WINDOW_LEAD_MINUTES,
        trailMinutes: ACCESS_WINDOW_TRAIL_MINUTES,
        slotRanges: access.slotRanges,
        status: access.status,
        notes: [
          'Account codes live in customers.door_code and must be unique 6-digit values.',
          'Temporary guest booking codes live in booking_access_codes with code_type=guest and scheduled/active/expired/revoked statuses.',
          'lock_access_jobs schedules activate/deactivate work and retries on provider failures.',
          'lock_slot_assignments tracks active member, guest, and permanent code slots.',
          'The lock provider sync is controlled by system config and can also trigger Abode automation around window end.',
          'Access failures should create operational incidents rather than silently failing.'
        ]
      }
    },
    equipment,
    callAnswers
  }
}
