<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

const route = useRoute()
const router = useRouter()
const toast = useToast()

type WaiverStatus = 'current' | 'expired' | 'missing' | 'stale_version'
type MemberTab = 'overview' | 'activity' | 'bookings' | 'credits' | 'access'

type MemberRecord = {
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

type MembersSummary = {
  totalMembers: number
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
  summary: {
    upcomingBookings: number
    pastBookings: number
    totalCreditsAdded: number
    totalCreditsUsed: number
    referralsAwarded: number
    openIncidents: number
    openExpenses: number
  }
}

type ActivityItem = {
  id: string
  at: string
  label: string
  description: string
  icon: string
  color: 'neutral' | 'primary' | 'success' | 'warning' | 'error' | 'info'
}

const emptySummary: MembersSummary = {
  totalMembers: 0,
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
const memberStatusFilter = ref<'all' | 'active' | 'past_due' | 'pending_checkout' | 'canceled' | 'expired' | 'inactive'>('all')
const memberHealthFilter = ref<'all' | 'attention' | 'waiver' | 'door_code' | 'zero_credits' | 'incidents' | 'workshops'>('all')
const rosterPage = ref(1)
const rosterPageSize = ref(25)
const membersPending = ref(false)
const detailPending = ref(false)
const selectedDetail = ref<MemberDetail | null>(null)
const updatingStatus = ref(false)
const adjustingCredits = ref(false)
const updatingDoorCode = ref(false)
const updatingWorkshopAccess = ref(false)
const dashboardHydrated = ref(false)

const statusForm = reactive({ status: 'active' })
const creditForm = reactive({ delta: 1, reason: 'admin_adjustment', note: '' })
const doorCodeForm = reactive({ value: '' })
const workshopAccessForm = reactive({ enabled: false })

const statusFilterItems = [
  { label: 'All statuses', value: 'all' },
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

const tabItems: Array<{ label: string, value: MemberTab, icon: string }> = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  { label: 'Activity', value: 'activity', icon: 'i-lucide-activity' },
  { label: 'Bookings', value: 'bookings', icon: 'i-lucide-calendar-days' },
  { label: 'Credits', value: 'credits', icon: 'i-lucide-wallet-cards' },
  { label: 'Access', value: 'access', icon: 'i-lucide-key-round' }
]

const members = computed(() => memberRows.value)
const selectedMember = computed(() => members.value.find(member => member.membership_id === selectedMemberId.value) ?? null)
const filteredMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()
  return members.value.filter((member) => {
    if (memberStatusFilter.value !== 'all' && member.effective_status !== memberStatusFilter.value) return false

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
  { label: 'Active members', value: summary.value.activeMembers, hint: `${summary.value.totalMembers} total`, icon: 'i-lucide-users', color: 'success' as const },
  { label: 'Needs waiver', value: summary.value.waiverAttentionMembers, hint: 'Missing, expired, or stale', icon: 'i-lucide-file-warning', color: summary.value.waiverAttentionMembers ? 'warning' as const : 'neutral' as const },
  { label: 'Door requests', value: summary.value.pendingDoorCodeRequests, hint: 'Pending code changes', icon: 'i-lucide-key-round', color: summary.value.pendingDoorCodeRequests ? 'warning' as const : 'neutral' as const },
  { label: 'Upcoming bookings', value: summary.value.upcomingBookings, hint: 'Across listed members', icon: 'i-lucide-calendar-clock', color: 'primary' as const },
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

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  if (!dashboardHydrated.value) {
    const iso = dt.toISOString()
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
  }
  return dt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Los_Angeles'
  })
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

function memberStatusColor(status: string | null | undefined) {
  const normalized = String(status ?? '').toLowerCase()
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
  membersPending.value = true
  try {
    const res = await $fetch<{ members: MemberRecord[], summary: MembersSummary }>('/api/admin/members')
    memberRows.value = res.members ?? []
    summary.value = res.summary ?? emptySummary
    if (!options.preserveSelection || !selectedMember.value) applySelectedMember(memberRows.value)
  } catch (error: unknown) {
    toast.add({
      title: 'Could not load members',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    membersPending.value = false
  }
}

async function loadMemberDetail(userId: string) {
  detailPending.value = true
  try {
    selectedDetail.value = await $fetch<MemberDetail>('/api/admin/members/detail', { query: { userId } })
  } catch (error: unknown) {
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
  if (!selectedMember.value) return
  updatingStatus.value = true
  try {
    await $fetch('/api/admin/members/membership-status', {
      method: 'POST',
      body: {
        membershipId: selectedMember.value.membership_id,
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
  if (!selectedMember.value) return
  adjustingCredits.value = true
  try {
    await $fetch('/api/admin/members/credits-adjust', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        membershipId: selectedMember.value.membership_id,
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

async function saveDoorCode() {
  if (!selectedMember.value || updatingDoorCode.value) return
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
  if (!selectedMember.value || updatingWorkshopAccess.value) return
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
    return
  }
  void loadMemberDetail(userId)
}, { immediate: true })

onMounted(async () => {
  dashboardHydrated.value = true
  await loadMembers()
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-members"
    title="Members"
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

    <div class="space-y-4">
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
          <UFormField label="Status">
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
                    Status
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
                  tabindex="0"
                  @click="selectMember(member)"
                  @keydown.enter.prevent="selectMember(member)"
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
                    <UBadge
                      :color="memberStatusColor(member.effective_status)"
                      size="xs"
                      variant="soft"
                    >
                      {{ member.effective_status }}
                    </UBadge>
                  </td>
                  <td class="px-4 py-3 text-dimmed">
                    {{ member.tier || 'No tier' }}<br>
                    <span class="text-xs">{{ member.cadence || 'no cadence' }}</span>
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
                  :color="memberStatusColor(selectedMember.effective_status)"
                  variant="soft"
                >
                  {{ selectedMember.effective_status }}
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
                <span>{{ selectedMember.tier || 'No tier' }} / {{ selectedMember.cadence || 'no cadence' }}</span>
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

          <template v-else>
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
                    Contact and membership
                  </div>
                  <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
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
                      @click="saveWorkshopAccess"
                    >
                      Save workshop access
                    </UButton>
                  </div>
                </UCard>
              </div>

              <UCard class="border-0 bg-default/50">
                <div class="font-medium">
                  Membership status
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-[12rem_auto]">
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
  </DashboardPageScaffold>
</template>
