<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })
const route = useRoute()
const router = useRouter()

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
  customer_first_name: string | null
  customer_last_name: string | null
  door_code: string | null
  door_code_request_status: string | null
  door_code_last_request_at: string | null
  credit_balance: number | null
  waiver_status: 'current' | 'expired' | 'missing' | 'stale_version'
  waiver_signed_at: string | null
  waiver_expires_at: string | null
  waiver_signer_name: string | null
  waiver_version: number | null
}

const toast = useToast()
const selectedMemberId = ref<string | null>(null)
const memberSearch = ref('')
const memberStatusFilter = ref<'all' | 'active' | 'past_due' | 'pending_checkout' | 'canceled' | 'inactive'>('all')
const updatingStatus = ref(false)
const adjustingCredits = ref(false)
const updatingDoorCode = ref(false)
const dashboardHydrated = ref(false)

const statusForm = reactive({
  status: 'active'
})

const creditForm = reactive({
  delta: 1,
  reason: 'admin_adjustment',
  note: ''
})

const doorCodeForm = reactive({
  value: ''
})

const { data: memberRows, refresh, pending } = await useAsyncData('admin:members', async () => {
  const res = await $fetch<{ members: MemberRecord[] }>('/api/admin/members')
  return res.members
})

const members = computed(() => memberRows.value ?? [])
const filteredMembers = computed(() => {
  const query = memberSearch.value.trim().toLowerCase()
  return members.value.filter((member) => {
    if (memberStatusFilter.value !== 'all' && member.effective_status !== memberStatusFilter.value) {
      return false
    }
    if (!query) return true

    const text = [
      member.customer_first_name,
      member.customer_last_name,
      member.customer_email,
      member.user_id,
      member.tier,
      member.cadence
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(query)
  })
})

const selectedMember = computed(() =>
  members.value.find(member => member.membership_id === selectedMemberId.value) ?? null
)

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

function applySelectedMember(next: MemberRecord[]) {
  if (!next.length) return

  const queryMembershipId = readQueryValue(route.query.membershipId)
  const queryUserId = readQueryValue(route.query.userId)
  const fromMembershipQuery = queryMembershipId
    ? next.find(member => member.membership_id === queryMembershipId)
    : null
  const fromUserQuery = queryUserId
    ? next.find(member => member.user_id === queryUserId)
    : null
  const current = selectedMemberId.value
    ? next.find(member => member.membership_id === selectedMemberId.value)
    : null

  const target = fromMembershipQuery ?? fromUserQuery ?? current ?? next[0]!
  selectedMemberId.value = target.membership_id
  statusForm.status = target.status ?? 'active'
  doorCodeForm.value = target.door_code ?? ''
}

watch(
  [members, () => route.query.userId, () => route.query.membershipId],
  ([next]) => {
    applySelectedMember(next ?? [])
  },
  { immediate: true }
)

function selectMember(member: MemberRecord) {
  selectedMemberId.value = member.membership_id
  statusForm.status = member.status ?? 'active'
  doorCodeForm.value = member.door_code ?? ''

  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      userId: member.user_id
    }
  })
}

watch(filteredMembers, (next) => {
  if (!next.length) {
    selectedMemberId.value = null
    return
  }

  if (selectedMemberId.value && next.some(member => member.membership_id === selectedMemberId.value)) {
    return
  }

  const target = next[0]!
  selectedMemberId.value = target.membership_id
  statusForm.status = target.status ?? 'active'
  doorCodeForm.value = target.door_code ?? ''
})

function memberLabel(member: MemberRecord) {
  const name = [member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ')
  return name || member.customer_email || member.user_id
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  if (!dashboardHydrated.value) {
    const iso = dt.toISOString()
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
  }
  return dt.toLocaleString('en-US')
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
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update membership',
      description: readErrorMessage(error),
      color: 'error'
    })
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
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not apply credit adjustment',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    adjustingCredits.value = false
  }
}

function formatRequestStatus(status: string | null) {
  if (!status) return 'None'
  if (status === 'pending') return 'Pending'
  if (status === 'resolved') return 'Resolved'
  if (status === 'rejected') return 'Rejected'
  return status
}

function memberStatusColor(status: string) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'active' || normalized === 'past_due' ? 'success' : 'neutral'
}

function waiverStatusLabel(status: MemberRecord['waiver_status']) {
  if (status === 'current') return 'Current'
  if (status === 'expired') return 'Expired'
  if (status === 'stale_version') return 'Needs re-sign'
  return 'Missing'
}

function waiverStatusColor(status: MemberRecord['waiver_status']) {
  if (status === 'current') return 'success'
  if (status === 'expired') return 'warning'
  return 'error'
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
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update door code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    updatingDoorCode.value = false
  }
}

onMounted(() => {
  dashboardHydrated.value = true
})
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-members"
    title="Members Management"
  >
    <template #right>
      <DashboardActionGroup
        align="end"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            loading: pending,
            onSelect: () => refresh()
          }
        ]"
      />
    </template>
    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-users"
      title="Member account controls"
      description="Review memberships, update status, and apply manual credit adjustments."
    />

    <DashboardDataPanel
      list-title="Member list"
      list-description="Search and filter members first, then manage account controls."
      detail-title="Member detail"
      detail-description="Status, waiver, and credit controls for the selected member."
    >
      <template #list-controls>
        <UCard class="admin-panel-card border-0">
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Search">
              <UInput
                v-model="memberSearch"
                icon="i-lucide-search"
                placeholder="Name, email, tier, cadence"
              />
            </UFormField>
            <UFormField label="Status">
              <USelect
                v-model="memberStatusFilter"
                :items="[
                  { label: 'All statuses', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Past due', value: 'past_due' },
                  { label: 'Pending checkout', value: 'pending_checkout' },
                  { label: 'Canceled', value: 'canceled' },
                  { label: 'Inactive', value: 'inactive' }
                ]"
              />
            </UFormField>
          </div>
        </UCard>
      </template>

      <template #list>
        <DashboardSectionState
          v-if="pending && !members.length"
          state="loading"
          title="Loading members"
          description="Fetching membership records."
        />
        <DashboardSectionState
          v-else-if="!filteredMembers.length"
          state="empty"
          title="No members found"
          description="Try adjusting the status filter or search query."
        />
        <div
          v-else
          class="space-y-2"
        >
          <button
            v-for="member in filteredMembers"
            :key="member.membership_id"
            class="w-full rounded-xl border border-default bg-elevated/35 p-3 text-left text-sm transition hover:bg-elevated/55"
            :class="selectedMemberId === member.membership_id ? '!border-primary bg-elevated/70' : ''"
            @click="selectMember(member)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium truncate">{{ memberLabel(member) }}</span>
              <UBadge
                :color="memberStatusColor(member.effective_status)"
                size="xs"
                variant="soft"
              >
                {{ member.effective_status }}
              </UBadge>
            </div>
            <div class="mt-1 text-xs text-dimmed truncate">
              {{ member.tier || 'No tier' }} · {{ member.cadence || 'no cadence' }}
            </div>
            <div class="mt-2 flex items-center gap-2">
              <UBadge
                :color="waiverStatusColor(member.waiver_status)"
                size="xs"
                variant="soft"
              >
                Waiver: {{ waiverStatusLabel(member.waiver_status) }}
              </UBadge>
              <UBadge
                color="neutral"
                size="xs"
                variant="soft"
              >
                {{ member.credit_balance ?? 0 }} cr
              </UBadge>
            </div>
          </button>
        </div>
      </template>

      <template #detail>
        <DashboardSectionState
          v-if="!selectedMember"
          state="empty"
          title="No member selected"
          description="Select a member from the list to view account controls."
        />
        <div
          v-else
          class="space-y-4"
        >
          <UCard class="admin-panel-card border-0">
            <div class="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Member
                </div>
                <div class="mt-1 font-medium">
                  {{ memberLabel(selectedMember) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Credit balance
                </div>
                <div class="mt-1 font-medium">
                  {{ selectedMember.credit_balance ?? 0 }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Period start
                </div>
                <div class="mt-1">
                  {{ formatDate(selectedMember.current_period_start) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Period end
                </div>
                <div class="mt-1">
                  {{ formatDate(selectedMember.current_period_end) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Door code request
                </div>
                <div class="mt-1">
                  {{ formatRequestStatus(selectedMember.door_code_request_status) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Last request at
                </div>
                <div class="mt-1">
                  {{ formatDate(selectedMember.door_code_last_request_at) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Waiver status
                </div>
                <div class="mt-1">
                  <UBadge
                    :color="waiverStatusColor(selectedMember.waiver_status)"
                    size="xs"
                    variant="soft"
                  >
                    {{ waiverStatusLabel(selectedMember.waiver_status) }}
                  </UBadge>
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Waiver version
                </div>
                <div class="mt-1">
                  {{ selectedMember.waiver_version ?? '—' }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Waiver signer
                </div>
                <div class="mt-1">
                  {{ selectedMember.waiver_signer_name ?? '—' }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Waiver signed
                </div>
                <div class="mt-1">
                  {{ formatDate(selectedMember.waiver_signed_at) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Waiver expires
                </div>
                <div class="mt-1">
                  {{ formatDate(selectedMember.waiver_expires_at) }}
                </div>
              </div>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
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

          <UCard class="admin-panel-card border-0">
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

          <UCard class="admin-panel-card border-0">
            <div class="font-medium">
              Credit adjustment
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-3">
              <UFormField label="Delta credits">
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
            </div>
            <UButton
              class="mt-3"
              :loading="adjustingCredits"
              @click="applyCreditAdjustment"
            >
              Apply credits
            </UButton>
          </UCard>
        </div>
      </template>
    </DashboardDataPanel>
  </DashboardPageScaffold>
</template>
