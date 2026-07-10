<script setup lang="ts">
import { parseUsdInputToCents } from '~~/app/utils/adminMoney'
import {
  adminDateInputToIso,
  adminTodayInput,
  formatAdminDate,
  formatAdminDateTime,
  isoToAdminDateInput
} from '~~/app/utils/adminTime'

definePageMeta({ middleware: ['admin'] })

const route = useRoute()
const router = useRouter()
const toast = useToast()

type WaiverStatus = 'current' | 'expired' | 'missing' | 'stale_version'
type MemberTab = 'overview' | 'activity' | 'bookings' | 'charges' | 'credits' | 'access'

type MemberRecord = {
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

type MembersSummary = {
  totalMembers: number
  guestAccounts: number
  studioSignupAccounts: number
  labSharedAccounts: number
  currentSubscriberAccounts: number
  manualMembershipAccounts: number
  pastSubscriberAccounts: number
  activeMembers: number
  pastDueMembers: number
  pendingCheckoutMembers: number
  expiredMembers: number
  waiverAttentionMembers: number
  pendingDoorCodeRequests: number
  workshopEnabledMembers: number
  zeroCreditMembers: number
  upcomingBookings: number
  openIncidents: number
  openExpenses: number
  generatedAt: string
}

type DetailBooking = {
  id: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  credits_burned: number | null
  booking_kind?: string | null
  workshop_title?: string | null
  workshop_link?: string | null
  created_at: string
  updated_at: string
  booking_holds?: Array<{ id: string, hold_start: string, hold_end: string, hold_type: string }> | null
}

type DetailCredit = {
  id: string
  delta: number
  reason: string
  external_ref: string | null
  expires_at: string | null
  metadata: unknown
  created_at: string
  membership_id: string | null
}

type MemberCharge = {
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

type DetailReferral = {
  id: string
  referral_code: string
  referrer_user_id: string | null
  referred_user_id: string | null
  status: string
  rejection_reason: string | null
  referrer_credits_awarded: number
  referred_credits_awarded: number
  awarded_at: string | null
  created_at: string
}

type DetailIncident = {
  id: string
  title: string
  category: string
  severity: string
  status: string
  occurred_at: string | null
  created_at: string
  updated_at: string
}

type DetailExpense = {
  id: string
  title: string
  category: string
  status: string
  amount_cents: number
  currency: string
  vendor_name: string
  incurred_on: string | null
  incident_id: string | null
  updated_at: string
}

type ManualMembershipEvent = {
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

type MemberDetail = {
  userId: string
  membership: Record<string, unknown> | null
  customer: Record<string, unknown> | null
  creditBalance: number
  waiver: {
    status: WaiverStatus
    activeTemplate: Record<string, unknown> | null
    latestSignature: Record<string, unknown> | null
  }
  doorCodeRequests: Array<Record<string, unknown>>
  bookings: DetailBooking[]
  credits: DetailCredit[]
  referrals: DetailReferral[]
  incidents: DetailIncident[]
  expenses: DetailExpense[]
  manualMembershipEvents: ManualMembershipEvent[]
  memberCharges: MemberCharge[]
  memberChargeHistoryAvailable: boolean
  summary: {
    upcomingBookings: number
    pastBookings: number
    totalCreditsAdded: number
    totalCreditsUsed: number
    referralsAwarded: number
    openIncidents: number
    openExpenses: number
    paidMemberChargeCents: number
  }
}

type MembershipTierCatalog = {
  id: string
  display_name: string
  active: boolean
  visible: boolean
  direct_access_only: boolean
  membership_plan_variations?: Array<{
    cadence: string
    provider: string
    credits_per_month: number
    active: boolean
    visible: boolean
    sort_order: number
  }>
}

type ActivityItem = {
  id: string
  at: string
  label: string
  description: string
  icon: string
  color: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info'
}

type SavedCardMethod = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  cardholderName: string | null
  enabled: boolean
}

const emptySummary: MembersSummary = {
  totalMembers: 0,
  guestAccounts: 0,
  studioSignupAccounts: 0,
  labSharedAccounts: 0,
  currentSubscriberAccounts: 0,
  manualMembershipAccounts: 0,
  pastSubscriberAccounts: 0,
  activeMembers: 0,
  pastDueMembers: 0,
  pendingCheckoutMembers: 0,
  expiredMembers: 0,
  waiverAttentionMembers: 0,
  pendingDoorCodeRequests: 0,
  workshopEnabledMembers: 0,
  zeroCreditMembers: 0,
  upcomingBookings: 0,
  openIncidents: 0,
  openExpenses: 0,
  generatedAt: ''
}

const memberRows = ref<MemberRecord[]>([])
const summary = ref<MembersSummary>(emptySummary)
const selectedMemberId = ref<string | null>(null)
const selectedTab = ref<MemberTab>('overview')
const memberSearch = ref('')
const memberStatusFilter = ref<'all' | 'guest' | 'subscriber_current' | 'manual' | 'subscriber_past' | 'active' | 'past_due' | 'pending_checkout' | 'canceled' | 'expired' | 'inactive'>('all')
const memberHealthFilter = ref<'all' | 'attention' | 'waiver' | 'door_code' | 'zero_credits' | 'incidents' | 'workshops'>('all')
const rosterPage = ref(1)
const rosterPageSize = ref(25)
const membersPending = ref(false)
const membersLoaded = ref(false)
const membersError = ref<unknown>(null)
const detailPending = ref(false)
const detailLoaded = ref(false)
const detailError = ref<unknown>(null)
const selectedDetail = ref<MemberDetail | null>(null)
const updatingStatus = ref(false)
const adjustingCredits = ref(false)
const updatingDoorCode = ref(false)
const updatingWorkshopAccess = ref(false)
const savingManualMembership = ref(false)
const revokingManualMembership = ref(false)
const chargeModalOpen = ref(false)
const chargePaymentMethodsPending = ref(false)
const chargeSubmitting = ref(false)
const chargePaymentMethods = ref<SavedCardMethod[]>([])
const dashboardHydrated = ref(false)
const membershipTierCatalog = ref<MembershipTierCatalog[]>([])
const membershipTiersLoaded = ref(false)
const membershipTiersError = ref<unknown>(null)
const revokeConfirmOpen = ref(false)

const statusForm = reactive({ status: 'active' })
const creditForm = reactive({ delta: 1, reason: 'admin_adjustment', note: '' })
const doorCodeForm = reactive({ value: '' })
const workshopAccessForm = reactive({ enabled: false })
const manualMembershipForm = reactive({
  tierId: '',
  cadence: 'monthly',
  startsOn: '',
  expiresOn: '',
  manualGrantsEnabled: false,
  reason: ''
})
const memberChargeForm = reactive({
  amountDollars: '',
  category: 'repair',
  reason: '',
  internalNote: '',
  cardId: '',
  bookingId: '',
  incidentId: ''
})

const statusFilterItems = [
  { label: 'All accounts', value: 'all' },
  { label: 'Guest accounts', value: 'guest' },
  { label: 'Current subscribers', value: 'subscriber_current' },
  { label: 'Manual memberships', value: 'manual' },
  { label: 'Past subscribers', value: 'subscriber_past' },
  { label: 'Active', value: 'active' },
  { label: 'Past due', value: 'past_due' },
  { label: 'Pending checkout', value: 'pending_checkout' },
  { label: 'Canceled', value: 'canceled' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' }
]

const healthFilterItems = [
  { label: 'All health states', value: 'all' },
  { label: 'Needs attention', value: 'attention' },
  { label: 'Waiver issues', value: 'waiver' },
  { label: 'Door code requests', value: 'door_code' },
  { label: 'Zero credits', value: 'zero_credits' },
  { label: 'Open incidents', value: 'incidents' },
  { label: 'Workshop enabled', value: 'workshops' }
]

const rosterPageSizeItems = [
  { label: '15 / page', value: 15 },
  { label: '25 / page', value: 25 },
  { label: '50 / page', value: 50 },
  { label: '100 / page', value: 100 }
]

const chargeCategoryItems = [
  { label: 'Repair', value: 'repair' },
  { label: 'Damage', value: 'damage' },
  { label: 'Replacement', value: 'replacement' },
  { label: 'Cleaning', value: 'cleaning' },
  { label: 'Other', value: 'other' }
]

const tabItems: Array<{ label: string, value: MemberTab, icon: string }> = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  { label: 'Activity', value: 'activity', icon: 'i-lucide-activity' },
  { label: 'Bookings', value: 'bookings', icon: 'i-lucide-calendar-days' },
  { label: 'Charges', value: 'charges', icon: 'i-lucide-receipt-text' },
  { label: 'Credits', value: 'credits', icon: 'i-lucide-wallet-cards' },
  { label: 'Access', value: 'access', icon: 'i-lucide-key-round' }
]

const members = computed(() => memberRows.value)
const selectedMember = computed(() => members.value.find(member => member.membership_id === selectedMemberId.value) ?? null)
const canMutateMember = computed(() => dashboardHydrated.value && membersLoaded.value && !membersPending.value && !membersError.value && Boolean(selectedMember.value))
const canUseMemberDetail = computed(() => canMutateMember.value && detailLoaded.value && !detailPending.value && !detailError.value)
const canMutateManualMembership = computed(() => canMutateMember.value && membershipTiersLoaded.value && !membershipTiersError.value)
const manualAssignableTiers = computed(() => membershipTierCatalog.value.filter(tier => tier.active !== false))
const manualTierItems = computed(() => manualAssignableTiers.value.map(tier => ({
  label: `${tier.display_name ?? tier.id}${tier.visible === false || tier.direct_access_only ? ' (hidden)' : ''}`,
  value: tier.id
})))
const manualCadenceItems = computed(() => {
  const tier = manualAssignableTiers.value.find(item => item.id === manualMembershipForm.tierId)
  const variations = tier?.membership_plan_variations ?? []
  const seen = new Set<string>()
  return variations
    .filter(variation => variation.active !== false && ['manual', 'square'].includes(String(variation.provider ?? '').toLowerCase()))
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .filter((variation) => {
      const cadence = String(variation.cadence ?? '').trim()
      if (!cadence || seen.has(cadence)) return false
      seen.add(cadence)
      return true
    })
    .map(variation => ({
      label: `${cadenceLabel(variation.cadence)} · ${formatCredits(variation.credits_per_month)} cr`,
      value: variation.cadence
    }))
})
const memberChargeTotal = computed(() => selectedDetail.value?.summary.paidMemberChargeCents ?? 0)
const chargeCardItems = computed(() => chargePaymentMethods.value.map(card => ({
  label: `${card.brand ?? 'Card'} ending ${card.last4 ?? '----'}${card.expMonth && card.expYear ? ` · exp ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : ''}`,
  value: card.id
})))
const chargeBookingItems = computed(() => [
  { label: 'No linked booking', value: '' },
  ...(selectedDetail.value?.bookings ?? []).slice(0, 12).map(booking => ({
    label: `${formatDate(booking.start_time)} · ${booking.status}`,
    value: booking.id
  }))
])
const chargeIncidentItems = computed(() => [
  { label: 'No linked incident', value: '' },
  ...(selectedDetail.value?.incidents ?? []).slice(0, 12).map(incident => ({
    label: `${incident.title} · ${incident.status}`,
    value: incident.id
  }))
])
const filteredMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()
  return members.value.filter((member) => {
    if (memberStatusFilter.value === 'guest' && member.account_kind !== 'guest') return false
    if (memberStatusFilter.value === 'subscriber_current' && member.account_kind !== 'subscriber_current') return false
    if (memberStatusFilter.value === 'manual' && member.membership_source !== 'manual') return false
    if (memberStatusFilter.value === 'subscriber_past' && member.account_kind !== 'subscriber_past') return false
    if (!['all', 'guest', 'subscriber_current', 'manual', 'subscriber_past'].includes(memberStatusFilter.value) && member.effective_status !== memberStatusFilter.value) return false

    if (memberHealthFilter.value === 'attention' && member.health_flags.length === 0) return false
    if (memberHealthFilter.value === 'waiver' && member.waiver_status === 'current') return false
    if (memberHealthFilter.value === 'door_code' && member.door_code_request_status !== 'pending') return false
    if (memberHealthFilter.value === 'zero_credits' && Number(member.credit_balance ?? 0) > 0) return false
    if (memberHealthFilter.value === 'incidents' && member.open_incidents_count <= 0) return false
    if (memberHealthFilter.value === 'workshops' && !member.workshop_booking_enabled) return false

    if (!query) return true
    const text = [
      member.customer_first_name,
      member.customer_last_name,
      member.customer_email,
      member.customer_phone,
      member.user_id,
      member.tier,
      member.cadence,
      accountKindLabel(member.account_kind),
      member.membership_source_label,
      accountSourceLabel(member.account_source),
      member.customer_lab_notes,
      ...member.health_flags
    ].filter(Boolean).join(' ').toLowerCase()
    return text.includes(query)
  })
})
const rosterTotalPages = computed(() => Math.max(1, Math.ceil(filteredMembers.value.length / rosterPageSize.value)))
const rosterPageStart = computed(() => (rosterPage.value - 1) * rosterPageSize.value)
const paginatedMembers = computed(() => filteredMembers.value.slice(rosterPageStart.value, rosterPageStart.value + rosterPageSize.value))
const rosterRangeLabel = computed(() => {
  if (!filteredMembers.value.length) return '0 shown'
  const first = rosterPageStart.value + 1
  const last = Math.min(rosterPageStart.value + rosterPageSize.value, filteredMembers.value.length)
  return `${first}-${last} of ${filteredMembers.value.length}`
})

const kpiCards = computed(() => [
  { label: 'Current subscribers', value: summary.value.currentSubscriberAccounts, hint: `${summary.value.activeMembers} active · ${summary.value.manualMembershipAccounts} manual`, icon: 'i-lucide-badge-check', color: 'success' as const },
  { label: 'Guest accounts', value: summary.value.guestAccounts, hint: `${summary.value.studioSignupAccounts} Studio signups · ${summary.value.labSharedAccounts} lab logins`, icon: 'i-lucide-user-round', color: 'info' as const },
  { label: 'Past subscribers', value: summary.value.pastSubscriberAccounts, hint: 'Canceled, expired, or inactive', icon: 'i-lucide-history', color: summary.value.pastSubscriberAccounts ? 'warning' as const : 'neutral' as const },
  { label: 'Needs waiver', value: summary.value.waiverAttentionMembers, hint: 'Missing, expired, or stale', icon: 'i-lucide-file-warning', color: summary.value.waiverAttentionMembers ? 'warning' as const : 'neutral' as const },
  { label: 'Open ops items', value: summary.value.openIncidents + summary.value.openExpenses, hint: `${summary.value.openIncidents} incidents · ${summary.value.openExpenses} expenses`, icon: 'i-lucide-siren', color: summary.value.openIncidents ? 'error' as const : 'neutral' as const }
])

const memberHealthColor = computed(() => {
  const member = selectedMember.value
  if (!member) return 'neutral' as const
  if (member.open_incidents_count > 0) return 'error' as const
  if (member.health_flags.length > 0) return 'warning' as const
  return 'success' as const
})

const upcomingBookings = computed(() => (selectedDetail.value?.bookings ?? []).filter((booking) => {
  if (booking.status === 'canceled') return false
  const endMs = Date.parse(booking.end_time)
  return Number.isFinite(endMs) && endMs >= Date.now()
}))

const pastBookings = computed(() => (selectedDetail.value?.bookings ?? []).filter((booking) => {
  if (booking.status === 'canceled') return true
  const endMs = Date.parse(booking.end_time)
  return Number.isFinite(endMs) && endMs < Date.now()
}))

const activityItems = computed<ActivityItem[]>(() => {
  const detail = selectedDetail.value
  if (!detail) return []
  const items: ActivityItem[] = []

  for (const booking of detail.bookings.slice(0, 8)) {
    items.push({
      id: `booking-${booking.id}`,
      at: booking.start_time,
      label: `${booking.status} booking`,
      description: `${formatDate(booking.start_time)} → ${formatDate(booking.end_time)}${booking.notes ? ` · ${booking.notes}` : ''}`,
      icon: 'i-lucide-calendar-days',
      color: booking.status === 'canceled' ? 'neutral' : 'primary'
    })
  }

  for (const credit of detail.credits.slice(0, 8)) {
    items.push({
      id: `credit-${credit.id}`,
      at: credit.created_at,
      label: `${formatCredits(credit.delta)} credits`,
      description: `${formatReason(credit.reason)}${credit.external_ref ? ` · ${credit.external_ref}` : ''}`,
      icon: 'i-lucide-wallet-cards',
      color: Number(credit.delta) >= 0 ? 'success' : 'warning'
    })
  }

  for (const charge of detail.memberCharges.slice(0, 5)) {
    items.push({
      id: `member-charge-${charge.id}`,
      at: charge.charged_at ?? charge.created_at,
      label: `${formatReason(charge.category)} charge`,
      description: `${formatMoney(charge.amount_cents)} · ${charge.status} · ${charge.reason}`,
      icon: 'i-lucide-receipt-text',
      color: charge.status === 'paid' ? 'success' : charge.status === 'failed' ? 'error' : 'warning'
    })
  }

  for (const incident of detail.incidents.slice(0, 5)) {
    items.push({
      id: `incident-${incident.id}`,
      at: incident.updated_at,
      label: incident.title,
      description: `${incident.severity} ${incident.category} incident · ${incident.status}`,
      icon: 'i-lucide-siren',
      color: ['high', 'critical'].includes(incident.severity) ? 'error' : 'warning'
    })
  }

  for (const expense of detail.expenses.slice(0, 5)) {
    items.push({
      id: `expense-${expense.id}`,
      at: expense.updated_at,
      label: expense.title,
      description: `${formatMoney(expense.amount_cents)} · ${expense.status}`,
      icon: 'i-lucide-receipt',
      color: expense.status === 'paid' ? 'success' : 'info'
    })
  }

  for (const referral of detail.referrals.slice(0, 5)) {
    items.push({
      id: `referral-${referral.id}`,
      at: referral.awarded_at ?? referral.created_at,
      label: `Referral ${referral.status}`,
      description: `${referral.referral_code} · referrer ${formatCredits(referral.referrer_credits_awarded)} / referred ${formatCredits(referral.referred_credits_awarded)}`,
      icon: 'i-lucide-gift',
      color: referral.status === 'awarded' ? 'success' : referral.status === 'rejected' ? 'error' : 'neutral'
    })
  }

  return items
    .filter(item => Boolean(item.at))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 18)
})

function readQueryValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.trim())
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function memberLabel(member: MemberRecord | null | undefined) {
  if (!member) return 'No member selected'
  const name = [member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ')
  return name || member.customer_email || member.user_id
}

function accountKindLabel(kind: MemberRecord['account_kind']) {
  if (kind === 'guest') return 'Guest account'
  if (kind === 'subscriber_current') return 'Current subscriber'
  return 'Past subscriber'
}

function accountKindColor(kind: MemberRecord['account_kind']) {
  if (kind === 'guest') return 'info' as const
  if (kind === 'subscriber_current') return 'success' as const
  return 'warning' as const
}

function accountSourceLabel(source: MemberRecord['account_source']) {
  if (source === 'studio_signup') return 'Studio signup'
  if (source === 'studio_checkout_signup') return 'Studio checkout signup'
  if (source === 'studio_membership') return 'Studio membership'
  if (source === 'lab_shared_auth') return 'Lab shared login'
  return 'Unknown source'
}

function accountSourceColor(source: MemberRecord['account_source']) {
  if (source === 'studio_signup' || source === 'studio_checkout_signup') return 'primary' as const
  if (source === 'studio_membership') return 'success' as const
  if (source === 'lab_shared_auth') return 'neutral' as const
  return 'warning' as const
}

function membershipSourceColor(label: MemberRecord['membership_source_label']) {
  if (label === 'Manual') return 'info' as const
  if (label === 'Paid') return 'success' as const
  if (label === 'Past subscriber') return 'warning' as const
  return 'neutral' as const
}

function cadenceLabel(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'daily') return 'Daily'
  if (normalized === 'weekly') return 'Weekly'
  if (normalized === 'quarterly') return 'Quarterly'
  if (normalized === 'annual') return 'Annual'
  return 'Monthly'
}

function toDateInput(value: string | null | undefined) {
  return isoToAdminDateInput(value)
}

function toFutureDateInput(value: string | null | undefined) {
  const input = isoToAdminDateInput(value)
  if (!input) return ''
  const parsed = adminDateInputToIso(input)
  return parsed && Date.parse(parsed) > Date.now() ? input : ''
}

function dateInputToIso(value: string | null | undefined) {
  return adminDateInputToIso(value)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function memberSlug(member: MemberRecord) {
  const readable = slugify(memberLabel(member)) || 'member'
  return `${readable}-${member.user_id.slice(0, 8)}`
}

function findMemberByRouteSlug(next: MemberRecord[], value: string | null) {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return next.find((member) => {
    const userId = member.user_id.toLowerCase()
    const membershipId = member.membership_id.toLowerCase()
    return normalized === userId
      || normalized === membershipId
      || normalized === memberSlug(member)
      || normalized.endsWith(userId.slice(0, 8))
  }) ?? null
}

function formatReason(value: string | null | undefined) {
  return String(value ?? 'unknown').replace(/_/g, ' ')
}

function formatCredits(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2)
}

function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents ?? 0) / 100)
}

function moneyInputToCents(value: string | number | null | undefined) {
  return parseUsdInputToCents(value) ?? 0
}

function formatDate(value: string | null | undefined) {
  return formatAdminDateTime(value)
}

function formatShortDate(value: string | null | undefined) {
  return formatAdminDate(value)
}

function memberStatusColor(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized === 'guest') return 'info' as const
  if (normalized === 'active') return 'success' as const
  if (normalized === 'past_due' || normalized === 'pending_checkout') return 'warning' as const
  if (normalized === 'expired' || normalized === 'canceled') return 'error' as const
  return 'neutral' as const
}

function waiverStatusLabel(status: WaiverStatus) {
  if (status === 'current') return 'Current'
  if (status === 'expired') return 'Expired'
  if (status === 'stale_version') return 'Needs re-sign'
  return 'Missing'
}

function waiverStatusColor(status: WaiverStatus) {
  if (status === 'current') return 'success' as const
  if (status === 'expired') return 'warning' as const
  return 'error' as const
}

function bookingStatusColor(status: string | null | undefined) {
  if (status === 'confirmed') return 'success' as const
  if (status === 'requested' || status === 'pending_payment') return 'warning' as const
  if (status === 'canceled') return 'neutral' as const
  return 'primary' as const
}

function applySelectedMember(next: MemberRecord[]) {
  if (!next.length) {
    selectedMemberId.value = null
    selectedDetail.value = null
    return
  }

  const queryMember = readQueryValue(route.query.member)
  const queryMembershipId = readQueryValue(route.query.membershipId)
  const queryUserId = readQueryValue(route.query.userId)
  const hasRouteSelection = Boolean(queryMember || queryMembershipId || queryUserId)

  if (!hasRouteSelection) {
    selectedMemberId.value = null
    selectedDetail.value = null
    return
  }

  const fromMemberQuery = findMemberByRouteSlug(next, queryMember)
  const fromMembershipQuery = queryMembershipId ? next.find(member => member.membership_id === queryMembershipId) : null
  const fromUserQuery = queryUserId ? next.find(member => member.user_id === queryUserId) : null
  const target = fromMemberQuery ?? fromMembershipQuery ?? fromUserQuery
  if (!target) {
    selectedMemberId.value = null
    selectedDetail.value = null
    return
  }
  selectMember(target, {
    syncRoute: queryMember !== memberSlug(target) || Boolean(queryMembershipId || queryUserId)
  })
}

function selectMember(member: MemberRecord, options: { syncRoute?: boolean } = {}) {
  selectedMemberId.value = member.membership_id
  selectedTab.value = 'overview'
  statusForm.status = member.status ?? 'active'
  doorCodeForm.value = member.door_code ?? ''
  workshopAccessForm.enabled = Boolean(member.workshop_booking_enabled)
  const isManualMembership = member.membership_source === 'manual'
  manualMembershipForm.tierId = member.tier ?? manualTierItems.value[0]?.value ?? ''
  manualMembershipForm.cadence = member.cadence ?? manualCadenceItems.value[0]?.value ?? 'monthly'
  manualMembershipForm.startsOn = isManualMembership && ['active', 'past_due'].includes(member.effective_status)
    ? toDateInput(member.current_period_start) || adminTodayInput()
    : adminTodayInput()
  manualMembershipForm.expiresOn = isManualMembership
    ? toFutureDateInput(member.manual_expires_at)
    : ''
  manualMembershipForm.manualGrantsEnabled = isManualMembership && Boolean(member.manual_grants_enabled)
  manualMembershipForm.reason = isManualMembership ? member.manual_reason ?? '' : ''

  if (options.syncRoute !== false) {
    void router.replace({
      path: route.path,
      query: {
        ...route.query,
        member: memberSlug(member),
        userId: undefined,
        membershipId: undefined
      }
    })
  }
}

function clearSelectedMember() {
  selectedMemberId.value = null
  selectedDetail.value = null
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      member: undefined,
      userId: undefined,
      membershipId: undefined
    }
  })
}

function goToRosterPage(delta: number) {
  rosterPage.value = Math.min(rosterTotalPages.value, Math.max(1, rosterPage.value + delta))
}

async function loadMembers(options: { preserveSelection?: boolean } = {}) {
  const priorUserId = selectedMember.value?.user_id ?? null
  membersPending.value = true
  membersError.value = null
  try {
    const res = await $fetch<{ members: MemberRecord[], summary: MembersSummary }>('/api/admin/members')
    memberRows.value = res.members ?? []
    summary.value = res.summary ?? emptySummary
    membersLoaded.value = true
    if (options.preserveSelection && priorUserId) {
      const preserved = memberRows.value.find(member => member.user_id === priorUserId)
      if (preserved) {
        selectMember(preserved, { syncRoute: false })
        return
      }
    }
    if (!options.preserveSelection || !selectedMember.value) applySelectedMember(memberRows.value)
  } catch (error: unknown) {
    membersError.value = error
    toast.add({
      title: 'Could not load members',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    membersPending.value = false
  }
}

async function loadMembershipTiers() {
  membershipTiersError.value = null
  try {
    const res = await $fetch<{ tiers: MembershipTierCatalog[] }>('/api/admin/membership/tiers')
    membershipTierCatalog.value = res.tiers ?? []
    membershipTiersLoaded.value = true
    if (!manualMembershipForm.tierId && manualTierItems.value[0]?.value) {
      manualMembershipForm.tierId = manualTierItems.value[0].value
    }
    if (!manualCadenceItems.value.some(item => item.value === manualMembershipForm.cadence)) {
      manualMembershipForm.cadence = manualCadenceItems.value[0]?.value ?? 'monthly'
    }
  } catch (error: unknown) {
    membershipTiersError.value = error
    toast.add({
      title: 'Could not load membership tiers',
      description: readErrorMessage(error),
      color: 'error'
    })
  }
}

async function loadMemberDetail(userId: string) {
  detailPending.value = true
  detailLoaded.value = false
  detailError.value = null
  selectedDetail.value = null
  try {
    selectedDetail.value = await $fetch<MemberDetail>('/api/admin/members/detail', { query: { userId } })
    detailLoaded.value = true
  } catch (error: unknown) {
    detailError.value = error
    selectedDetail.value = null
    toast.add({
      title: 'Could not load member detail',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    detailPending.value = false
  }
}

async function refreshAll() {
  await loadMembers({ preserveSelection: true })
  if (selectedMember.value) await loadMemberDetail(selectedMember.value.user_id)
}

async function saveMembershipStatus() {
  if (!selectedMember.value?.membership_record_id || !canMutateMember.value) return
  updatingStatus.value = true
  try {
    await $fetch('/api/admin/members/membership-status', {
      method: 'POST',
      body: {
        membershipId: selectedMember.value.membership_record_id,
        status: statusForm.status
      }
    })
    toast.add({ title: 'Membership status updated' })
    await refreshAll()
  } catch (error: unknown) {
    toast.add({ title: 'Could not update membership', description: readErrorMessage(error), color: 'error' })
  } finally {
    updatingStatus.value = false
  }
}

async function applyCreditAdjustment() {
  if (!selectedMember.value || !canUseMemberDetail.value) return
  adjustingCredits.value = true
  try {
    await $fetch('/api/admin/members/credits-adjust', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        membershipId: selectedMember.value.membership_record_id,
        delta: creditForm.delta,
        reason: creditForm.reason,
        note: creditForm.note || null
      }
    })
    toast.add({ title: 'Credit adjustment applied' })
    creditForm.note = ''
    await refreshAll()
  } catch (error: unknown) {
    toast.add({ title: 'Could not apply credit adjustment', description: readErrorMessage(error), color: 'error' })
  } finally {
    adjustingCredits.value = false
  }
}

async function loadChargePaymentMethods() {
  if (!selectedMember.value) return
  chargePaymentMethodsPending.value = true
  try {
    const res = await $fetch<{ methods: SavedCardMethod[], defaultCardId: string | null }>('/api/admin/members/payment-methods', {
      query: { userId: selectedMember.value.user_id }
    })
    chargePaymentMethods.value = res.methods ?? []
    memberChargeForm.cardId = res.defaultCardId ?? chargePaymentMethods.value[0]?.id ?? ''
  } catch (error: unknown) {
    chargePaymentMethods.value = []
    memberChargeForm.cardId = ''
    toast.add({ title: 'Could not load saved cards', description: readErrorMessage(error), color: 'error' })
  } finally {
    chargePaymentMethodsPending.value = false
  }
}

async function openMemberChargeModal() {
  if (!selectedMember.value || !canUseMemberDetail.value) return
  memberChargeForm.amountDollars = ''
  memberChargeForm.category = 'repair'
  memberChargeForm.reason = ''
  memberChargeForm.internalNote = ''
  memberChargeForm.bookingId = ''
  memberChargeForm.incidentId = ''
  memberChargeForm.cardId = ''
  chargeModalOpen.value = true
  await loadChargePaymentMethods()
}

async function submitMemberCharge() {
  if (!selectedMember.value || chargeSubmitting.value || !canUseMemberDetail.value) return
  const amountCents = moneyInputToCents(memberChargeForm.amountDollars)
  if (amountCents <= 0) {
    toast.add({ title: 'Enter a charge amount', color: 'error' })
    return
  }
  if (!memberChargeForm.cardId) {
    toast.add({ title: 'Choose a saved card', color: 'error' })
    return
  }
  if (memberChargeForm.reason.trim().length < 3) {
    toast.add({ title: 'Add a reason for the receipt', color: 'error' })
    return
  }

  chargeSubmitting.value = true
  try {
    const res = await $fetch<{ receiptSent?: boolean, receiptReason?: string }>('/api/admin/members/charge', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        cardId: memberChargeForm.cardId,
        amountCents,
        category: memberChargeForm.category,
        reason: memberChargeForm.reason.trim(),
        internalNote: memberChargeForm.internalNote.trim() || null,
        bookingId: memberChargeForm.bookingId || null,
        incidentId: memberChargeForm.incidentId || null
      }
    })
    chargeModalOpen.value = false
    toast.add({
      title: 'Member charged',
      description: res.receiptSent === false ? `Payment succeeded. Receipt not sent: ${res.receiptReason ?? 'unknown'}.` : 'Payment succeeded and the email receipt was queued.',
      color: res.receiptSent === false ? 'warning' : 'success'
    })
    await refreshAll()
  } catch (error: unknown) {
    toast.add({ title: 'Could not charge member', description: readErrorMessage(error), color: 'error' })
  } finally {
    chargeSubmitting.value = false
  }
}

async function saveDoorCode() {
  if (!selectedMember.value || updatingDoorCode.value || !canMutateMember.value) return
  updatingDoorCode.value = true
  try {
    await $fetch('/api/admin/members/door-code-set', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        doorCode: String(doorCodeForm.value ?? '').trim()
      }
    })
    toast.add({ title: 'Door code updated' })
    await refreshAll()
  } catch (error: unknown) {
    toast.add({ title: 'Could not update door code', description: readErrorMessage(error), color: 'error' })
  } finally {
    updatingDoorCode.value = false
  }
}

async function saveWorkshopAccess() {
  if (!selectedMember.value || updatingWorkshopAccess.value || !canMutateMember.value) return
  updatingWorkshopAccess.value = true
  try {
    await $fetch('/api/admin/members/workshop-access', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        workshopBookingEnabled: workshopAccessForm.enabled
      }
    })
    toast.add({ title: 'Workshop access updated' })
    await refreshAll()
  } catch (error: unknown) {
    toast.add({ title: 'Could not update workshop access', description: readErrorMessage(error), color: 'error' })
  } finally {
    updatingWorkshopAccess.value = false
  }
}

async function saveManualMembership() {
  if (!selectedMember.value || savingManualMembership.value || !canMutateManualMembership.value) return
  if (!manualMembershipForm.tierId) {
    toast.add({ title: 'Choose a manual membership tier', color: 'error' })
    return
  }
  savingManualMembership.value = true
  try {
    await $fetch('/api/admin/members/manual-membership.upsert', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        tierId: manualMembershipForm.tierId,
        cadence: manualMembershipForm.cadence,
        startsAt: dateInputToIso(manualMembershipForm.startsOn),
        expiresAt: dateInputToIso(manualMembershipForm.expiresOn),
        manualGrantsEnabled: manualMembershipForm.manualGrantsEnabled,
        reason: manualMembershipForm.reason || null
      }
    })
    toast.add({ title: 'Manual membership saved' })
    await refreshAll()
    await refreshNuxtData(['dash:sidebar:membership', 'dash:sidebar:credit-cap', 'book:membership-state', 'dash:home:membership'])
  } catch (error: unknown) {
    toast.add({ title: 'Could not save manual membership', description: readErrorMessage(error), color: 'error' })
  } finally {
    savingManualMembership.value = false
  }
}

function requestRevokeManualMembership() {
  if (!canMutateManualMembership.value || selectedMember.value?.membership_source !== 'manual') return
  revokeConfirmOpen.value = true
}

async function revokeManualMembership() {
  if (!selectedMember.value || revokingManualMembership.value || !canMutateManualMembership.value) return
  revokingManualMembership.value = true
  try {
    await $fetch('/api/admin/members/manual-membership.revoke', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        reason: manualMembershipForm.reason || null
      }
    })
    toast.add({ title: 'Manual membership revoked' })
    revokeConfirmOpen.value = false
    await refreshAll()
    await refreshNuxtData(['dash:sidebar:membership', 'dash:sidebar:credit-cap', 'book:membership-state', 'dash:home:membership'])
  } catch (error: unknown) {
    toast.add({ title: 'Could not revoke manual membership', description: readErrorMessage(error), color: 'error' })
  } finally {
    revokingManualMembership.value = false
  }
}

watch([members, () => route.query.member, () => route.query.userId, () => route.query.membershipId], ([next]) => {
  applySelectedMember(next ?? [])
}, { immediate: true })

watch([memberSearch, memberStatusFilter, memberHealthFilter, rosterPageSize], () => {
  rosterPage.value = 1
})

watch([filteredMembers, rosterTotalPages], () => {
  rosterPage.value = Math.min(rosterTotalPages.value, Math.max(1, rosterPage.value))
})

watch(() => selectedMember.value?.user_id, (userId) => {
  if (!userId) {
    selectedDetail.value = null
    detailLoaded.value = false
    detailError.value = null
    return
  }
  void loadMemberDetail(userId)
}, { immediate: true })

watch(() => manualMembershipForm.tierId, () => {
  if (!manualCadenceItems.value.some(item => item.value === manualMembershipForm.cadence)) {
    manualMembershipForm.cadence = manualCadenceItems.value[0]?.value ?? 'monthly'
  }
})

onMounted(async () => {
  dashboardHydrated.value = true
  await Promise.all([loadMembers(), loadMembershipTiers()])
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-members"
    title="Members"
    :busy="membersPending || detailPending"
  >
    <template #right>
      <DashboardActionGroup
        align="end"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            loading: membersPending || detailPending,
            onSelect: () => { void refreshAll() }
          }
        ]"
      />
    </template>

    <DashboardSectionState
      v-if="membersPending && !membersLoaded"
      state="loading"
      title="Loading members"
      description="Fetching account, membership, booking, waiver, and operations signals."
    />
    <DashboardSectionState
      v-else-if="membersError && !membersLoaded"
      state="error"
      title="Members unavailable"
      :description="readErrorMessage(membersError)"
      show-retry
      @retry="() => loadMembers()"
    />
    <DashboardSectionState
      v-else-if="membersError"
      state="error"
      color="warning"
      icon="i-lucide-clock-alert"
      title="Showing stale member data"
      :description="`${readErrorMessage(membersError)} Member mutations are disabled until refresh succeeds.`"
      show-retry
      @retry="refreshAll"
    />

    <div
      v-if="membersLoaded"
      class="space-y-4"
    >
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <UCard
          v-for="card in kpiCards"
          :key="card.label"
          class="admin-panel-card border-0"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                {{ card.label }}
              </div>
              <div class="mt-2 text-2xl font-semibold">
                {{ card.value }}
              </div>
              <div class="mt-1 text-xs text-dimmed">
                {{ card.hint }}
              </div>
            </div>
            <UBadge
              :color="card.color"
              variant="soft"
              size="lg"
            >
              <UIcon :name="card.icon" />
            </UBadge>
          </div>
        </UCard>
      </div>

      <UCard
        v-if="!selectedMember"
        class="admin-panel-card border-0"
      >
        <div class="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_12rem_14rem]">
          <UFormField label="Search members">
            <UInput
              v-model="memberSearch"
              icon="i-lucide-search"
              placeholder="Name, email, phone, tier, notes, flags"
            />
          </UFormField>
          <UFormField label="Account/status">
            <USelect
              v-model="memberStatusFilter"
              :items="statusFilterItems"
            />
          </UFormField>
          <UFormField label="Health">
            <USelect
              v-model="memberHealthFilter"
              :items="healthFilterItems"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard
        v-if="!selectedMember"
        class="admin-panel-card border-0 min-w-0"
      >
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium">
                Member roster
              </div>
              <div class="text-xs text-dimmed">
                {{ rosterRangeLabel }} · {{ members.length }} total accounts
              </div>
            </div>
            <div class="flex items-center gap-2">
              <USelect
                v-model="rosterPageSize"
                :items="rosterPageSizeItems"
                class="w-32"
              />
              <UBadge
                color="neutral"
                variant="soft"
              >
                Paginated roster
              </UBadge>
            </div>
          </div>
        </template>

        <DashboardSectionState
          v-if="membersPending && !members.length"
          state="loading"
          title="Loading members"
          description="Fetching account and activity signals."
        />
        <DashboardSectionState
          v-else-if="!filteredMembers.length"
          state="empty"
          title="No members found"
          description="Adjust the search, status, or health filters."
        />
        <div
          v-else
          class="space-y-4"
        >
          <div class="overflow-x-auto rounded-xl border border-default">
            <table class="min-w-full divide-y divide-default text-sm">
              <thead class="bg-elevated/50 text-left text-xs uppercase tracking-wide text-dimmed">
                <tr>
                  <th class="px-4 py-3 font-medium">
                    Member
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Account
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Plan
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Credits
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Bookings
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Waiver
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Review
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Next
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="member in paginatedMembers"
                  :key="member.membership_id"
                  class="cursor-pointer bg-default/60 transition hover:bg-elevated/60"
                  role="link"
                  tabindex="0"
                  :aria-label="`Open admin member record for ${memberLabel(member)}`"
                  @click="selectMember(member)"
                  @keydown.enter.prevent="selectMember(member)"
                  @keydown.space.prevent="selectMember(member)"
                >
                  <td class="min-w-72 px-4 py-3">
                    <div class="font-semibold text-highlighted">
                      {{ memberLabel(member) }}
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      {{ member.customer_email || 'No email' }}<template v-if="member.customer_phone">
                        · {{ member.customer_phone }}
                      </template>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-col items-start gap-1">
                      <UBadge
                        :color="accountKindColor(member.account_kind)"
                        size="xs"
                        variant="soft"
                      >
                        {{ accountKindLabel(member.account_kind) }}
                      </UBadge>
                      <UBadge
                        :color="membershipSourceColor(member.membership_source_label)"
                        size="xs"
                        variant="soft"
                      >
                        {{ member.membership_source_label }}
                      </UBadge>
                      <UBadge
                        :color="memberStatusColor(member.effective_status)"
                        size="xs"
                        variant="subtle"
                      >
                        {{ member.effective_status }}
                      </UBadge>
                      <UBadge
                        :color="accountSourceColor(member.account_source)"
                        size="xs"
                        variant="outline"
                      >
                        {{ accountSourceLabel(member.account_source) }}
                      </UBadge>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-dimmed">
                    {{ member.tier || (member.account_kind === 'guest' ? 'No subscription history' : 'No tier') }}<br>
                    <span class="text-xs">{{ member.cadence || (member.account_kind === 'guest' ? 'guest rules' : 'no cadence') }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <UBadge
                      :color="Number(member.credit_balance ?? 0) > 0 ? 'success' : 'warning'"
                      size="xs"
                      variant="soft"
                    >
                      {{ formatCredits(member.credit_balance) }} cr
                    </UBadge>
                  </td>
                  <td class="px-4 py-3 text-dimmed">
                    <div>{{ member.booking_count }} total</div>
                    <div class="text-xs">
                      {{ member.upcoming_booking_count }} upcoming
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <UBadge
                      :color="waiverStatusColor(member.waiver_status)"
                      size="xs"
                      variant="soft"
                    >
                      {{ waiverStatusLabel(member.waiver_status) }}
                    </UBadge>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-1">
                      <UBadge
                        v-if="member.health_flags.length"
                        color="warning"
                        size="xs"
                        variant="subtle"
                      >
                        {{ member.health_flags.length }} flags
                      </UBadge>
                      <UBadge
                        v-if="member.open_incidents_count"
                        color="error"
                        size="xs"
                        variant="soft"
                      >
                        {{ member.open_incidents_count }} incidents
                      </UBadge>
                      <UBadge
                        v-if="member.workshop_booking_enabled"
                        color="info"
                        size="xs"
                        variant="soft"
                      >
                        Workshop
                      </UBadge>
                      <span
                        v-if="!member.health_flags.length && !member.open_incidents_count && !member.workshop_booking_enabled"
                        class="text-xs text-dimmed"
                      >
                        Clear
                      </span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-xs text-dimmed">
                    {{ formatDate(member.next_booking_at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="text-sm text-dimmed">
              {{ rosterRangeLabel }} filtered · page {{ rosterPage }} of {{ rosterTotalPages }}
            </div>
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-chevron-left"
                :disabled="rosterPage <= 1"
                @click="goToRosterPage(-1)"
              >
                Previous
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                trailing-icon="i-lucide-chevron-right"
                :disabled="rosterPage >= rosterTotalPages"
                @click="goToRosterPage(1)"
              >
                Next
              </UButton>
            </div>
          </div>
        </div>
      </UCard>

      <UCard
        v-else
        class="admin-panel-card border-0 min-w-0"
      >
        <div class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default pb-4">
            <div class="min-w-0">
              <UButton
                class="mb-3"
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-left"
                @click="clearSelectedMember"
              >
                Member roster
              </UButton>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-xl font-semibold text-highlighted">
                  {{ memberLabel(selectedMember) }}
                </h2>
                <UBadge
                  :color="accountKindColor(selectedMember.account_kind)"
                  variant="soft"
                >
                  {{ accountKindLabel(selectedMember.account_kind) }}
                </UBadge>
                <UBadge
                  :color="membershipSourceColor(selectedMember.membership_source_label)"
                  variant="soft"
                >
                  {{ selectedMember.membership_source_label }}
                </UBadge>
                <UBadge
                  :color="memberStatusColor(selectedMember.effective_status)"
                  variant="subtle"
                >
                  {{ selectedMember.effective_status }}
                </UBadge>
                <UBadge
                  :color="accountSourceColor(selectedMember.account_source)"
                  variant="outline"
                >
                  {{ accountSourceLabel(selectedMember.account_source) }}
                </UBadge>
                <UBadge
                  :color="memberHealthColor"
                  variant="soft"
                >
                  {{ selectedMember.health_flags.length ? 'needs review' : 'healthy' }}
                </UBadge>
              </div>
              <div class="mt-1 text-sm text-dimmed">
                {{ selectedMember.customer_email || 'No email' }}<template v-if="selectedMember.customer_phone">
                  · {{ selectedMember.customer_phone }}
                </template>
              </div>
              <div class="mt-2 flex flex-wrap gap-2 text-xs text-dimmed">
                <span>{{ selectedMember.tier || (selectedMember.account_kind === 'guest' ? 'No subscription history' : 'No tier') }} / {{ selectedMember.cadence || (selectedMember.account_kind === 'guest' ? 'guest rules' : 'no cadence') }}</span>
                <span>·</span>
                <span>{{ formatCredits(selectedMember.credit_balance) }} credits</span>
                <span>·</span>
                <span>{{ selectedMember.booking_count }} lifetime bookings</span>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-calendar-days"
                :to="`/dashboard/admin/bookings?bookingId=${selectedDetail?.bookings?.[0]?.id ?? ''}`"
                :disabled="!(selectedDetail?.bookings?.length)"
              >
                Open bookings
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :loading="detailPending"
                :disabled="!canMutateMember"
                @click="() => { if (selectedMember) void loadMemberDetail(selectedMember.user_id) }"
              >
                Refresh detail
              </UButton>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="tab in tabItems"
              :key="tab.value"
              size="sm"
              :icon="tab.icon"
              :variant="selectedTab === tab.value ? 'solid' : 'soft'"
              :color="selectedTab === tab.value ? 'primary' : 'neutral'"
              :aria-pressed="selectedTab === tab.value"
              @click="selectedTab = tab.value"
            >
              {{ tab.label }}
            </UButton>
          </div>

          <DashboardSectionState
            v-if="detailPending && !selectedDetail"
            state="loading"
            title="Loading member detail"
            description="Fetching bookings, credits, referrals, incidents, and access history."
          />
          <DashboardSectionState
            v-else-if="detailError"
            state="error"
            title="Member detail unavailable"
            :description="readErrorMessage(detailError)"
            show-retry
            @retry="() => { if (selectedMember) void loadMemberDetail(selectedMember.user_id) }"
          />

          <template v-else-if="selectedDetail">
            <div
              v-if="selectedTab === 'overview'"
              class="space-y-4"
            >
              <div class="grid gap-3 md:grid-cols-4">
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Balance
                  </div>
                  <div class="mt-2 text-2xl font-semibold">
                    {{ formatCredits(selectedMember.credit_balance) }}
                  </div>
                </UCard>
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Upcoming
                  </div>
                  <div class="mt-2 text-2xl font-semibold">
                    {{ selectedMember.upcoming_booking_count }}
                  </div>
                </UCard>
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Waiver
                  </div>
                  <div class="mt-2">
                    <UBadge
                      :color="waiverStatusColor(selectedMember.waiver_status)"
                      variant="soft"
                    >
                      {{ waiverStatusLabel(selectedMember.waiver_status) }}
                    </UBadge>
                  </div>
                </UCard>
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Open ops
                  </div>
                  <div class="mt-2 text-2xl font-semibold">
                    {{ selectedMember.open_incidents_count + selectedMember.open_expenses_count }}
                  </div>
                </UCard>
              </div>

              <div class="grid gap-4 lg:grid-cols-2">
                <UCard class="border-0 bg-default/50">
                  <div class="font-medium">
                    Contact and account
                  </div>
                  <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <div class="text-xs text-dimmed">
                        Account type
                      </div><div>
                        <UBadge
                          :color="accountKindColor(selectedMember.account_kind)"
                          variant="soft"
                        >
                          {{ accountKindLabel(selectedMember.account_kind) }}
                        </UBadge>
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Membership status
                      </div><div>{{ selectedMember.has_membership_history ? selectedMember.effective_status : 'Guest only' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Membership source
                      </div><div>
                        <UBadge
                          :color="membershipSourceColor(selectedMember.membership_source_label)"
                          variant="soft"
                        >
                          {{ selectedMember.membership_source_label }}
                        </UBadge>
                      </div>
                    </div>
                    <div v-if="selectedMember.membership_source === 'manual'">
                      <div class="text-xs text-dimmed">
                        Manual grant setting
                      </div><div>{{ selectedMember.manual_grants_enabled ? 'Recurring credits enabled' : 'No recurring credits' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Account source
                      </div><div>{{ accountSourceLabel(selectedMember.account_source) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        First seen in Studio
                      </div><div>{{ formatDate(selectedMember.studio_registered_at) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Email
                      </div><div class="break-words">
                        {{ selectedMember.customer_email || '—' }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Phone
                      </div><div>{{ selectedMember.customer_phone || '—' }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Current period
                      </div><div>{{ formatShortDate(selectedMember.current_period_start) }} → {{ formatShortDate(selectedMember.current_period_end) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Last paid
                      </div><div>{{ formatDate(selectedMember.last_paid_at) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Next booking
                      </div><div>{{ formatDate(selectedMember.next_booking_at) }}</div>
                    </div>
                    <div>
                      <div class="text-xs text-dimmed">
                        Last booking
                      </div><div>{{ formatDate(selectedMember.last_booking_at) }}</div>
                    </div>
                  </div>
                </UCard>

                <UCard class="border-0 bg-default/50">
                  <div class="font-medium">
                    Health flags
                  </div>
                  <div
                    v-if="selectedMember.health_flags.length"
                    class="mt-3 flex flex-wrap gap-2"
                  >
                    <UBadge
                      v-for="flag in selectedMember.health_flags"
                      :key="flag"
                      color="warning"
                      variant="soft"
                    >
                      {{ flag }}
                    </UBadge>
                  </div>
                  <DashboardSectionState
                    v-else
                    class="mt-3"
                    state="empty"
                    title="No flags"
                    description="No operational review items are currently attached to this member."
                  />
                  <div
                    v-if="selectedMember.customer_lab_notes"
                    class="mt-4 rounded-md border border-default bg-default p-3 text-sm"
                  >
                    <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                      Lab notes
                    </div>
                    <p class="mt-1 whitespace-pre-wrap">
                      {{ selectedMember.customer_lab_notes }}
                    </p>
                  </div>
                </UCard>
              </div>
            </div>

            <div
              v-else-if="selectedTab === 'activity'"
              class="space-y-3"
            >
              <DashboardSectionState
                v-if="!activityItems.length"
                state="empty"
                title="No recent activity"
                description="Bookings, credits, referrals, incidents, and expenses will appear here."
              />
              <template v-else>
                <div
                  v-for="item in activityItems"
                  :key="item.id"
                  class="flex gap-3 rounded-lg border border-default bg-default/50 p-3"
                >
                  <UBadge
                    :color="item.color"
                    variant="soft"
                    size="lg"
                  >
                    <UIcon :name="item.icon" />
                  </UBadge>
                  <div class="min-w-0">
                    <div class="font-medium">
                      {{ item.label }}
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      {{ formatDate(item.at) }}
                    </div>
                    <div class="mt-1 text-sm text-dimmed">
                      {{ item.description }}
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div
              v-else-if="selectedTab === 'bookings'"
              class="space-y-4"
            >
              <div class="grid gap-3 md:grid-cols-2">
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Upcoming
                  </div><div class="mt-2 text-2xl font-semibold">
                    {{ upcomingBookings.length }}
                  </div>
                </UCard>
                <UCard class="border-0 bg-default/50">
                  <div class="text-xs uppercase tracking-wide text-dimmed">
                    Recent past
                  </div><div class="mt-2 text-2xl font-semibold">
                    {{ pastBookings.length }}
                  </div>
                </UCard>
              </div>
              <DashboardSectionState
                v-if="!(selectedDetail?.bookings.length)"
                state="empty"
                title="No bookings"
                description="This member does not have recent bookings in the admin detail window."
              />
              <UCard
                v-for="booking in selectedDetail?.bookings ?? []"
                v-else
                :key="booking.id"
                class="border-0 bg-default/50"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <div class="font-medium">
                        {{ formatDate(booking.start_time) }}
                      </div>
                      <UBadge
                        :color="bookingStatusColor(booking.status)"
                        variant="soft"
                      >
                        {{ booking.status }}
                      </UBadge>
                      <UBadge
                        v-if="booking.booking_kind === 'workshop'"
                        color="info"
                        variant="soft"
                      >
                        Workshop
                      </UBadge>
                    </div>
                    <div class="mt-1 text-sm text-dimmed">
                      {{ formatDate(booking.start_time) }} → {{ formatDate(booking.end_time) }} (LA)
                    </div>
                    <div class="mt-1 text-xs text-dimmed">
                      Credits burned: {{ formatCredits(booking.credits_burned) }}
                    </div>
                    <div
                      v-if="booking.workshop_title"
                      class="mt-1 text-xs text-dimmed"
                    >
                      Workshop: {{ booking.workshop_title }}
                    </div>
                    <p
                      v-if="booking.notes"
                      class="mt-2 text-sm text-dimmed whitespace-pre-wrap"
                    >
                      {{ booking.notes }}
                    </p>
                  </div>
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :to="`/dashboard/admin/bookings?bookingId=${booking.id}`"
                  >
                    Open booking
                  </UButton>
                </div>
              </UCard>
            </div>

            <div
              v-else-if="selectedTab === 'charges'"
              class="space-y-4"
            >
              <UCard class="border-0 bg-default/50">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="font-medium">
                      Member charges
                    </div>
                    <p class="mt-1 text-xs text-dimmed">
                      Admin-only repair, damage, replacement, cleaning, or other studio charges. Customers receive an email receipt only.
                    </p>
                  </div>
                  <UButton
                    size="sm"
                    icon="i-lucide-receipt-text"
                    :disabled="selectedDetail?.memberChargeHistoryAvailable === false || !canUseMemberDetail"
                    @click="openMemberChargeModal"
                  >
                    Create charge
                  </UButton>
                </div>
                <AppAlert
                  v-if="selectedDetail?.memberChargeHistoryAvailable === false"
                  class="mt-4"
                  color="warning"
                  variant="soft"
                  icon="i-lucide-database"
                  title="Member charge history is not available yet"
                  description="The admin charge audit table is not in the Supabase schema cache. Apply the latest migration or reload the Supabase API schema before creating member charges."
                />

                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <div class="rounded-lg border border-default bg-default p-3">
                    <div class="text-xs uppercase tracking-wide text-dimmed">
                      Paid member charges
                    </div>
                    <div class="mt-2 text-2xl font-semibold">
                      {{ formatMoney(memberChargeTotal) }}
                    </div>
                  </div>
                  <div class="rounded-lg border border-default bg-default p-3">
                    <div class="text-xs uppercase tracking-wide text-dimmed">
                      Charge count
                    </div>
                    <div class="mt-2 text-2xl font-semibold">
                      {{ selectedDetail?.memberCharges?.length ?? 0 }}
                    </div>
                  </div>
                </div>

                <div class="mt-4">
                  <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Repair charge history
                  </div>
                  <DashboardSectionState
                    v-if="!(selectedDetail?.memberCharges?.length)"
                    class="mt-3"
                    state="empty"
                    title="No member charges"
                    description="Admin-created studio charges will appear here after a card is charged."
                  />
                  <div
                    v-else
                    class="mt-3 space-y-2"
                  >
                    <div
                      v-for="charge in selectedDetail?.memberCharges ?? []"
                      :key="charge.id"
                      class="rounded-lg border border-default bg-default p-3 text-sm"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <div class="font-medium">
                              {{ formatReason(charge.category) }} · {{ formatMoney(charge.amount_cents) }}
                            </div>
                            <UBadge
                              :color="charge.status === 'paid' ? 'success' : charge.status === 'failed' ? 'error' : 'warning'"
                              variant="soft"
                            >
                              {{ charge.status }}
                            </UBadge>
                            <UBadge
                              v-if="charge.receipt_sent_at"
                              color="success"
                              variant="soft"
                            >
                              Receipt sent
                            </UBadge>
                            <UBadge
                              v-else-if="charge.receipt_error"
                              color="warning"
                              variant="soft"
                            >
                              Receipt issue
                            </UBadge>
                          </div>
                          <div class="mt-1 text-xs text-dimmed">
                            {{ formatDate(charge.charged_at ?? charge.created_at) }}
                            <template v-if="charge.card_last4">
                              · {{ charge.card_brand || 'Card' }} ending {{ charge.card_last4 }}
                            </template>
                            <template v-if="charge.square_payment_id">
                              · {{ charge.square_payment_id }}
                            </template>
                          </div>
                          <p class="mt-2 whitespace-pre-wrap text-sm text-dimmed">
                            {{ charge.reason }}
                          </p>
                          <p
                            v-if="charge.internal_note"
                            class="mt-2 whitespace-pre-wrap rounded-md border border-default bg-elevated/40 p-2 text-xs text-dimmed"
                          >
                            Internal: {{ charge.internal_note }}
                          </p>
                          <div
                            v-if="charge.charge_error || charge.receipt_error"
                            class="mt-2 text-xs text-warning"
                          >
                            {{ charge.charge_error || charge.receipt_error }}
                          </div>
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <UButton
                            v-if="charge.booking_id"
                            size="xs"
                            color="neutral"
                            variant="soft"
                            :to="`/dashboard/admin/bookings?bookingId=${charge.booking_id}`"
                          >
                            Booking
                          </UButton>
                          <UButton
                            v-if="charge.incident_id"
                            size="xs"
                            color="neutral"
                            variant="soft"
                            :to="`/dashboard/admin/incidents?incidentId=${charge.incident_id}`"
                          >
                            Incident
                          </UButton>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>

            <div
              v-else-if="selectedTab === 'credits'"
              class="space-y-4"
            >
              <UCard class="border-0 bg-default/50">
                <div class="font-medium">
                  Credit adjustment
                </div>
                <div class="mt-3 grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <UFormField label="Delta">
                    <UInput
                      v-model.number="creditForm.delta"
                      type="number"
                      step="0.25"
                    />
                  </UFormField>
                  <UFormField label="Reason">
                    <UInput v-model="creditForm.reason" />
                  </UFormField>
                  <UFormField label="Note">
                    <UInput v-model="creditForm.note" />
                  </UFormField>
                  <div class="flex items-end">
                    <UButton
                      :loading="adjustingCredits"
                      :disabled="!canUseMemberDetail"
                      @click="applyCreditAdjustment"
                    >
                      Apply
                    </UButton>
                  </div>
                </div>
              </UCard>

              <DashboardSectionState
                v-if="!(selectedDetail?.credits.length)"
                state="empty"
                title="No credit ledger rows"
                description="Credit activity will appear here after grants, burns, top-offs, or adjustments."
              />
              <div
                v-else
                class="space-y-2"
              >
                <div
                  v-for="credit in selectedDetail?.credits ?? []"
                  :key="credit.id"
                  class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default bg-default/50 p-3 text-sm"
                >
                  <div>
                    <div class="font-medium">
                      {{ formatReason(credit.reason) }}
                    </div>
                    <div class="text-xs text-dimmed">
                      {{ formatDate(credit.created_at) }}<template v-if="credit.expires_at">
                        · expires {{ formatDate(credit.expires_at) }}
                      </template>
                    </div>
                  </div>
                  <UBadge
                    :color="Number(credit.delta) >= 0 ? 'success' : 'warning'"
                    variant="soft"
                  >
                    {{ formatCredits(credit.delta) }}
                  </UBadge>
                </div>
              </div>
            </div>

            <div
              v-else
              class="space-y-4"
            >
              <div class="grid gap-4 lg:grid-cols-2">
                <UCard class="border-0 bg-default/50">
                  <div class="font-medium">
                    Door code
                  </div>
                  <p class="mt-1 text-xs text-dimmed">
                    Set a 6-digit code. Saving a new code resolves pending member requests.
                  </p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-[12rem_auto]">
                    <UInput
                      v-model="doorCodeForm.value"
                      maxlength="6"
                      inputmode="numeric"
                      placeholder="000000"
                    />
                    <UButton
                      :loading="updatingDoorCode"
                      :disabled="!canMutateMember"
                      @click="saveDoorCode"
                    >
                      Save door code
                    </UButton>
                  </div>
                </UCard>

                <UCard class="border-0 bg-default/50">
                  <div class="font-medium">
                    Workshop booking access
                  </div>
                  <p class="mt-1 text-xs text-dimmed">
                    Enable the dedicated workshop booking mode for this member account.
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-3">
                    <UCheckbox
                      v-model="workshopAccessForm.enabled"
                      label="Workshop booking enabled"
                    />
                    <UButton
                      :loading="updatingWorkshopAccess"
                      :disabled="!canMutateMember"
                      @click="saveWorkshopAccess"
                    >
                      Save workshop access
                    </UButton>
                  </div>
                </UCard>
              </div>

              <UCard class="border-0 bg-default/50">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div class="font-medium">
                      Manual membership
                    </div>
                    <p class="mt-1 text-xs text-dimmed">
                      Assign a non-paying membership that uses normal booking, credit, hold, and access entitlements without Square billing.
                    </p>
                  </div>
                  <UBadge
                    :color="membershipSourceColor(selectedMember.membership_source_label)"
                    variant="soft"
                  >
                    {{ selectedMember.membership_source_label }}
                  </UBadge>
                </div>

                <div class="mt-4 grid gap-3 lg:grid-cols-2">
                  <DashboardSectionState
                    v-if="membershipTiersError"
                    class="lg:col-span-2"
                    state="error"
                    color="warning"
                    title="Membership tiers unavailable"
                    :description="readErrorMessage(membershipTiersError)"
                    show-retry
                    @retry="loadMembershipTiers"
                  />
                  <UFormField label="Tier">
                    <USelect
                      v-model="manualMembershipForm.tierId"
                      :items="manualTierItems"
                      placeholder="Choose tier"
                    />
                  </UFormField>
                  <UFormField label="Cadence">
                    <USelect
                      v-model="manualMembershipForm.cadence"
                      :items="manualCadenceItems"
                      placeholder="Choose cadence"
                    />
                  </UFormField>
                  <UFormField label="Start date">
                    <UInput
                      v-model="manualMembershipForm.startsOn"
                      type="date"
                    />
                  </UFormField>
                  <UFormField label="Optional end date">
                    <UInput
                      v-model="manualMembershipForm.expiresOn"
                      type="date"
                    />
                  </UFormField>
                  <UFormField
                    class="lg:col-span-2"
                    label="Reason / internal note"
                  >
                    <UTextarea
                      v-model="manualMembershipForm.reason"
                      :rows="3"
                      placeholder="Influencer comp, admin account, partnership, etc."
                    />
                  </UFormField>
                </div>

                <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <UCheckbox
                    v-model="manualMembershipForm.manualGrantsEnabled"
                    label="Grant recurring credits from the selected tier/cadence"
                  />
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      color="error"
                      variant="soft"
                      :loading="revokingManualMembership"
                      :disabled="selectedMember.membership_source !== 'manual' || !canMutateManualMembership"
                      @click="requestRevokeManualMembership"
                    >
                      Revoke manual membership
                    </UButton>
                    <UButton
                      :loading="savingManualMembership"
                      :disabled="!manualTierItems.length || !manualCadenceItems.length || !canMutateManualMembership"
                      @click="saveManualMembership"
                    >
                      Save manual membership
                    </UButton>
                  </div>
                </div>

                <div
                  v-if="selectedMember.membership_source === 'manual'"
                  class="mt-4 grid gap-3 text-sm sm:grid-cols-3"
                >
                  <div>
                    <div class="text-xs text-dimmed">
                      Assigned
                    </div>
                    <div>{{ formatDate(selectedMember.manual_assigned_at) }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-dimmed">
                      Expires
                    </div>
                    <div>{{ formatDate(selectedMember.manual_expires_at) }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-dimmed">
                      Recurring credits
                    </div>
                    <div>{{ selectedMember.manual_grants_enabled ? 'Enabled' : 'Disabled' }}</div>
                  </div>
                </div>

                <div
                  v-if="selectedDetail?.manualMembershipEvents?.length"
                  class="mt-4 space-y-2"
                >
                  <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Recent manual membership audit
                  </div>
                  <div
                    v-for="eventRow in selectedDetail.manualMembershipEvents.slice(0, 5)"
                    :key="eventRow.id"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-default bg-default p-2 text-sm"
                  >
                    <div>
                      <span class="font-medium">{{ formatReason(eventRow.action) }}</span>
                      <span class="text-dimmed"> · {{ eventRow.tier || 'no tier' }} / {{ eventRow.cadence || 'no cadence' }}</span>
                      <div
                        v-if="eventRow.reason"
                        class="text-xs text-dimmed"
                      >
                        {{ eventRow.reason }}
                      </div>
                    </div>
                    <div class="text-xs text-dimmed">
                      {{ formatDate(eventRow.created_at) }}
                    </div>
                  </div>
                </div>
              </UCard>

              <UCard class="border-0 bg-default/50">
                <div class="font-medium">
                  Membership status
                </div>
                <p
                  v-if="selectedMember.membership_source === 'manual'"
                  class="mt-2 text-sm text-dimmed"
                >
                  Manual memberships are managed through the manual membership panel above. Revoke or update that assignment there instead of changing status directly.
                </p>
                <p
                  v-else-if="!selectedMember.membership_record_id"
                  class="mt-2 text-sm text-dimmed"
                >
                  This is a guest account with no subscription history. Membership status controls appear once the account has a membership record.
                </p>
                <div
                  v-else
                  class="mt-3 grid gap-3 sm:grid-cols-[12rem_auto]"
                >
                  <USelect
                    v-model="statusForm.status"
                    :items="[
                      { label: 'Active', value: 'active' },
                      { label: 'Pending checkout', value: 'pending_checkout' },
                      { label: 'Past due', value: 'past_due' },
                      { label: 'Canceled', value: 'canceled' }
                    ]"
                  />
                  <UButton
                    :loading="updatingStatus"
                    :disabled="!selectedMember.membership_record_id || !canMutateMember"
                    @click="saveMembershipStatus"
                  >
                    Save status
                  </UButton>
                </div>
              </UCard>

              <UCard class="border-0 bg-default/50">
                <div class="font-medium">
                  Door code request history
                </div>
                <DashboardSectionState
                  v-if="!(selectedDetail?.doorCodeRequests.length)"
                  class="mt-3"
                  state="empty"
                  title="No requests"
                  description="Recent member door-code requests will appear here."
                />
                <div
                  v-else
                  class="mt-3 space-y-2"
                >
                  <div
                    v-for="request in selectedDetail?.doorCodeRequests ?? []"
                    :key="String(request.id)"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-default bg-default p-2 text-sm"
                  >
                    <div>{{ String(request.status ?? 'unknown') }}</div>
                    <div class="text-xs text-dimmed">
                      {{ formatDate(String(request.requested_at ?? '')) }}
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </div>
      </UCard>
    </div>

    <ConfirmDialog
      v-model:open="revokeConfirmOpen"
      title="Revoke this manual membership?"
      :description="`${memberLabel(selectedMember)} will immediately lose manual membership entitlements. Existing account history, credits, and bookings remain.`"
      confirm-label="Revoke manual membership"
      color="error"
      :busy="revokingManualMembership"
      @confirm="revokeManualMembership"
    />

    <UModal
      v-model:open="chargeModalOpen"
      title="Create member charge"
      description="Review the repair or operational charge before billing the member's saved Square card."
      :dismissible="!chargeSubmitting"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold">
                  Create member charge
                </h3>
                <p class="mt-1 text-xs text-dimmed">
                  Charge a saved Square card and send only an email receipt to the customer.
                </p>
              </div>
              <UBadge
                color="neutral"
                variant="soft"
              >
                Admin only
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <div
              v-if="selectedMember"
              class="rounded-lg border border-default bg-elevated/40 p-3 text-sm"
            >
              <div class="font-medium">
                {{ memberLabel(selectedMember) }}
              </div>
              <div class="mt-1 text-xs text-dimmed">
                {{ selectedMember.customer_email || selectedMember.user_id }}
              </div>
            </div>

            <DashboardSectionState
              v-if="chargePaymentMethodsPending"
              state="loading"
              title="Loading saved cards"
              description="Checking Square cards attached to this member account."
            />
            <AppAlert
              v-else-if="!chargePaymentMethods.length"
              color="warning"
              variant="soft"
              title="No saved card available"
              description="This member needs a saved Square card before an admin charge can be created."
            />

            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Amount">
                <UInput
                  v-model="memberChargeForm.amountDollars"
                  placeholder="125.00"
                  inputmode="decimal"
                >
                  <template #leading>
                    <span class="text-dimmed">$</span>
                  </template>
                </UInput>
              </UFormField>

              <UFormField label="Category">
                <USelect
                  v-model="memberChargeForm.category"
                  :items="chargeCategoryItems"
                />
              </UFormField>

              <UFormField
                class="sm:col-span-2"
                label="Saved card"
              >
                <USelect
                  v-model="memberChargeForm.cardId"
                  :items="chargeCardItems"
                  :disabled="!chargeCardItems.length"
                  placeholder="Choose saved card"
                />
              </UFormField>

              <UFormField
                class="sm:col-span-2"
                label="Customer receipt reason"
                description="This appears in the email receipt."
              >
                <UTextarea
                  v-model="memberChargeForm.reason"
                  :rows="3"
                  placeholder="Repair charge for damaged paper backdrop..."
                />
              </UFormField>

              <UFormField
                class="sm:col-span-2"
                label="Internal note"
                description="Admin-only. This is not sent to the customer."
              >
                <UTextarea
                  v-model="memberChargeForm.internalNote"
                  :rows="3"
                  placeholder="Evidence, staff context, approval notes..."
                />
              </UFormField>

              <UFormField label="Linked booking">
                <USelect
                  v-model="memberChargeForm.bookingId"
                  :items="chargeBookingItems"
                />
              </UFormField>

              <UFormField label="Linked incident">
                <USelect
                  v-model="memberChargeForm.incidentId"
                  :items="chargeIncidentItems"
                />
              </UFormField>
            </div>
          </div>

          <template #footer>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-dimmed">
                This will immediately charge the selected saved card through Square.
              </p>
              <div class="flex gap-2">
                <UButton
                  color="neutral"
                  variant="soft"
                  :disabled="chargeSubmitting"
                  @click="chargeModalOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  icon="i-lucide-credit-card"
                  :loading="chargeSubmitting"
                  :disabled="!chargePaymentMethods.length || !canUseMemberDetail"
                  @click="submitMemberCharge"
                >
                  Charge card now
                </UButton>
              </div>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </DashboardPageScaffold>
</template>
