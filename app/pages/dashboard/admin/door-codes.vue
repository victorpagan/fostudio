<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type MemberRecord = {
  membership_id: string
  user_id: string
  customer_email: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  door_code: string | null
  effective_status: string
}

type PermanentCodeRecord = {
  id: string
  label: string
  slot_number: number
  code: string
  active: boolean
  last_synced_at: string | null
  last_sync_status: 'ok' | 'error' | null
  last_sync_error: string | null
}

type DoorCodesPayload = {
  members: MemberRecord[]
  permanentCodes: PermanentCodeRecord[]
  settings: {
    permanentCodesDisarmAbodeOutsideLabHours: boolean
  }
}

type DoorCodesTab = 'members' | 'permanent'

const toast = useToast()
const selectedMemberId = ref<string | null>(null)
const memberDoorCode = ref('')
const memberCodeSearch = ref('')
const savingMemberDoorCode = ref(false)

const savingPermanent = ref(false)
const deletingPermanentId = ref<string | null>(null)
const savingAccessSettings = ref(false)
const doorCodesTab = ref<DoorCodesTab>('members')
const permanentCodeSearch = ref('')
const permanentStatusFilter = ref<'all' | 'active' | 'inactive'>('all')
const permanentCodesDisarmAbodeOutsideLabHours = ref(false)
const permanentForm = reactive({
  id: '' as string,
  label: '',
  slotNumber: 90,
  code: '',
  active: true
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

const { data, pending, refresh } = await useAsyncData<DoorCodesPayload>('admin:door-codes', async () => {
  const [membersRes, permanentRes, settingsRes] = await Promise.all([
    $fetch<{ members: MemberRecord[] }>('/api/admin/members'),
    $fetch<{ codes: PermanentCodeRecord[] }>('/api/admin/access/permanent-codes'),
    $fetch<{ settings: { permanentCodesDisarmAbodeOutsideLabHours: boolean } }>('/api/admin/access/settings')
  ])

  return {
    members: membersRes.members ?? [],
    permanentCodes: permanentRes.codes ?? [],
    settings: {
      permanentCodesDisarmAbodeOutsideLabHours: Boolean(
        settingsRes.settings?.permanentCodesDisarmAbodeOutsideLabHours
      )
    }
  }
})

onMounted(async () => {
  await refresh()
})

const members = computed(() => data.value?.members ?? [])
const permanentCodes = computed(() => data.value?.permanentCodes ?? [])
const filteredMemberCodes = computed(() => {
  const query = memberCodeSearch.value.trim().toLowerCase()
  if (!query) return members.value

  return members.value.filter((member) => {
    const text = [
      memberLabel(member),
      member.customer_email,
      member.user_id,
      member.effective_status,
      member.door_code
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return text.includes(query)
  })
})
const filteredPermanentCodes = computed(() => {
  const query = permanentCodeSearch.value.trim().toLowerCase()
  return permanentCodes.value.filter((row) => {
    if (permanentStatusFilter.value === 'active' && !row.active) return false
    if (permanentStatusFilter.value === 'inactive' && row.active) return false
    if (!query) return true

    const text = [
      row.label,
      String(row.slot_number),
      row.code,
      row.last_sync_status,
      row.last_sync_error
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return text.includes(query)
  })
})
const initialPermanentCodesDisarmOutsideLabHours = computed(() =>
  Boolean(data.value?.settings?.permanentCodesDisarmAbodeOutsideLabHours)
)
const accessSettingsDirty = computed(() =>
  permanentCodesDisarmAbodeOutsideLabHours.value !== initialPermanentCodesDisarmOutsideLabHours.value
)

const selectedMember = computed(() =>
  members.value.find(row => row.membership_id === selectedMemberId.value) ?? null
)

function memberLabel(member: MemberRecord) {
  const name = [member.customer_first_name, member.customer_last_name].filter(Boolean).join(' ')
  return name || member.customer_email || member.user_id
}

function memberStatusColor(status: string) {
  const normalized = String(status ?? '').toLowerCase()
  return normalized === 'active' || normalized === 'past_due' ? 'success' : 'neutral'
}

watch(members, (next) => {
  if (!next.length) return
  if (!selectedMemberId.value) {
    selectedMemberId.value = next[0]!.membership_id
    memberDoorCode.value = next[0]!.door_code ?? ''
    return
  }

  const current = next.find(row => row.membership_id === selectedMemberId.value)
  if (!current) {
    selectedMemberId.value = next[0]!.membership_id
    memberDoorCode.value = next[0]!.door_code ?? ''
    return
  }

  memberDoorCode.value = current.door_code ?? ''
}, { immediate: true })

watch(filteredMemberCodes, (next) => {
  if (!next.length) {
    selectedMemberId.value = null
    return
  }

  if (selectedMemberId.value && next.some(member => member.membership_id === selectedMemberId.value)) {
    return
  }

  const target = next[0]!
  selectedMemberId.value = target.membership_id
  memberDoorCode.value = target.door_code ?? ''
}, { immediate: true })

watch(initialPermanentCodesDisarmOutsideLabHours, (next) => {
  permanentCodesDisarmAbodeOutsideLabHours.value = next
}, { immediate: true })

function resetPermanentForm() {
  permanentForm.id = ''
  permanentForm.label = ''
  permanentForm.slotNumber = 90
  permanentForm.code = ''
  permanentForm.active = true
}

function editPermanentCode(row: PermanentCodeRecord) {
  permanentForm.id = row.id
  permanentForm.label = row.label
  permanentForm.slotNumber = Number(row.slot_number)
  permanentForm.code = row.code
  permanentForm.active = Boolean(row.active)
}

async function saveMemberDoorCode() {
  if (!selectedMember.value || savingMemberDoorCode.value) return
  savingMemberDoorCode.value = true
  try {
    await $fetch('/api/admin/members/door-code-set', {
      method: 'POST',
      body: {
        userId: selectedMember.value.user_id,
        doorCode: String(memberDoorCode.value ?? '').trim()
      }
    })
    toast.add({ title: 'Member door code updated' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not update member door code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingMemberDoorCode.value = false
  }
}

async function savePermanentCode() {
  if (savingPermanent.value) return
  savingPermanent.value = true
  try {
    const res = await $fetch<{
      code: PermanentCodeRecord
      syncOk: boolean
      syncError: string | null
    }>('/api/admin/access/permanent-codes.upsert', {
      method: 'POST',
      body: {
        id: permanentForm.id || undefined,
        label: permanentForm.label,
        slotNumber: Number(permanentForm.slotNumber),
        code: String(permanentForm.code ?? '').trim(),
        active: Boolean(permanentForm.active)
      }
    })

    if (res.syncOk) {
      toast.add({ title: 'Permanent door code saved' })
    } else {
      toast.add({
        title: 'Permanent code saved, but lock sync failed',
        description: res.syncError ?? 'Unknown sync error',
        color: 'warning'
      })
    }

    resetPermanentForm()
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save permanent code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingPermanent.value = false
  }
}

async function deletePermanentCode(id: string) {
  if (deletingPermanentId.value) return
  deletingPermanentId.value = id
  try {
    await $fetch('/api/admin/access/permanent-codes.delete', {
      method: 'POST',
      body: { id }
    })
    toast.add({ title: 'Permanent code removed' })
    if (permanentForm.id === id) resetPermanentForm()
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not remove permanent code',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    deletingPermanentId.value = null
  }
}

async function saveAccessSettings() {
  if (savingAccessSettings.value) return
  savingAccessSettings.value = true
  try {
    await $fetch('/api/admin/access/settings.upsert', {
      method: 'POST',
      body: {
        permanentCodesDisarmAbodeOutsideLabHours: permanentCodesDisarmAbodeOutsideLabHours.value
      }
    })
    toast.add({ title: 'Access settings saved' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save access settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingAccessSettings.value = false
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('en-US')
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-door-codes"
    title="Door Codes"
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
      icon="i-lucide-key-round"
      title="Door code controls"
      description="Manage member codes and permanent lock codes. Permanent codes stay active outside booking windows."
    />

    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="font-medium">
            Access automation settings
          </div>
          <p class="mt-1 text-xs text-dimmed">
            When enabled, permanent-code unlocks can trigger Abode disarm only outside lab hours (11:00 AM–7:00 PM).
          </p>
        </div>
        <div class="flex items-center gap-3">
          <USwitch v-model="permanentCodesDisarmAbodeOutsideLabHours" />
          <UButton
            size="sm"
            :disabled="!accessSettingsDirty"
            :loading="savingAccessSettings"
            @click="saveAccessSettings"
          >
            Save setting
          </UButton>
        </div>
      </div>
    </UCard>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        size="sm"
        :variant="doorCodesTab === 'members' ? 'solid' : 'soft'"
        :color="doorCodesTab === 'members' ? 'primary' : 'neutral'"
        @click="doorCodesTab = 'members'"
      >
        Member codes
      </UButton>
      <UButton
        size="sm"
        :variant="doorCodesTab === 'permanent' ? 'solid' : 'soft'"
        :color="doorCodesTab === 'permanent' ? 'primary' : 'neutral'"
        @click="doorCodesTab = 'permanent'"
      >
        Permanent codes
      </UButton>
    </div>

    <div class="space-y-4">
      <DashboardDataPanel
        v-if="doorCodesTab === 'members'"
        list-title="Member door codes"
        list-description="Search members first, then update their assigned code."
        detail-title="Member code editor"
        detail-description="Member codes are booking-window controlled by access jobs."
      >
        <template #list-controls>
          <UCard class="admin-panel-card border-0">
            <UFormField label="Search members">
              <UInput
                v-model="memberCodeSearch"
                icon="i-lucide-search"
                placeholder="Name, email, user id, code"
              />
            </UFormField>
          </UCard>
        </template>

        <template #list>
          <DashboardSectionState
            v-if="pending && !members.length"
            state="loading"
            title="Loading member codes"
            description="Fetching membership and code assignments."
          />
          <DashboardSectionState
            v-else-if="!filteredMemberCodes.length"
            state="empty"
            title="No members found"
            description="Try a different search query."
          />
          <div
            v-else
            class="space-y-2"
          >
            <button
              v-for="member in filteredMemberCodes"
              :key="member.membership_id"
              class="w-full rounded-xl border border-default bg-elevated/35 p-3 text-left transition hover:bg-elevated/55"
              :class="selectedMemberId === member.membership_id ? '!border-primary bg-elevated/70' : ''"
              @click="() => { selectedMemberId = member.membership_id; memberDoorCode = member.door_code ?? '' }"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="truncate text-sm font-medium">
                  {{ memberLabel(member) }}
                </div>
                <UBadge
                  :color="memberStatusColor(member.effective_status)"
                  size="xs"
                  variant="soft"
                >
                  {{ member.effective_status }}
                </UBadge>
              </div>
              <div class="mt-1 text-xs text-dimmed truncate">
                {{ member.customer_email || member.user_id }}
              </div>
              <div class="mt-2 text-xs font-mono text-highlighted">
                {{ member.door_code || 'no code set' }}
              </div>
            </button>
          </div>
        </template>

        <template #detail>
          <DashboardSectionState
            v-if="!selectedMember"
            state="empty"
            title="No member selected"
            description="Select a member to update the door code."
          />
          <UCard
            v-else
            class="admin-panel-card border-0"
          >
            <div class="space-y-3">
              <div>
                <div class="text-sm font-medium">
                  {{ memberLabel(selectedMember) }}
                </div>
                <div class="mt-1 text-xs text-dimmed">
                  {{ selectedMember.customer_email || selectedMember.user_id }}
                </div>
              </div>
              <div class="grid gap-3 sm:grid-cols-[12rem_auto]">
                <UInput
                  v-model="memberDoorCode"
                  maxlength="6"
                  inputmode="numeric"
                  placeholder="000000"
                />
                <UButton
                  :loading="savingMemberDoorCode"
                  @click="saveMemberDoorCode"
                >
                  Save member code
                </UButton>
              </div>
            </div>
          </UCard>
        </template>
      </DashboardDataPanel>

      <DashboardDataPanel
        v-else
        list-title="Permanent door codes"
        list-description="Filter and search permanent lock slots, then edit details."
        detail-title="Permanent code editor"
        detail-description="Permanent codes are programmed directly to lock slots and stay active while enabled."
      >
        <template #list-controls>
          <UCard class="admin-panel-card border-0">
            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Search permanent codes">
                <UInput
                  v-model="permanentCodeSearch"
                  icon="i-lucide-search"
                  placeholder="Label, slot, code, sync status"
                />
              </UFormField>
              <UFormField label="Status">
                <USelect
                  v-model="permanentStatusFilter"
                  :items="[
                    { label: 'All statuses', value: 'all' },
                    { label: 'Active', value: 'active' },
                    { label: 'Inactive', value: 'inactive' }
                  ]"
                />
              </UFormField>
            </div>
          </UCard>
        </template>

        <template #list>
          <DashboardSectionState
            v-if="!filteredPermanentCodes.length"
            state="empty"
            title="No permanent codes"
            description="No permanent codes match this filter."
          />
          <div
            v-else
            class="space-y-2"
          >
            <UCard
              v-for="row in filteredPermanentCodes"
              :key="row.id"
              class="admin-panel-card border-0"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <div class="truncate text-sm font-medium">
                      {{ row.label }}
                    </div>
                    <UBadge
                      :color="row.active ? 'success' : 'neutral'"
                      size="xs"
                      variant="soft"
                    >
                      {{ row.active ? 'active' : 'inactive' }}
                    </UBadge>
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    Slot {{ row.slot_number }} · Code {{ row.code }}
                  </div>
                  <div class="mt-1 text-xs text-dimmed">
                    Sync: {{ row.last_sync_status ?? 'unknown' }} · {{ formatDateTime(row.last_synced_at) }}
                  </div>
                  <div
                    v-if="row.last_sync_error"
                    class="mt-1 text-xs text-error"
                  >
                    {{ row.last_sync_error }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    @click="editPermanentCode(row)"
                  >
                    Edit
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    :loading="deletingPermanentId === row.id"
                    @click="deletePermanentCode(row.id)"
                  >
                    Delete
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <template #detail>
          <UCard class="admin-panel-card border-0">
            <div class="space-y-3">
              <div class="text-sm font-medium">
                {{ permanentForm.id ? 'Edit permanent code' : 'Create permanent code' }}
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="Label">
                  <UInput
                    v-model="permanentForm.label"
                    placeholder="Staff / Cleaner / Owner"
                  />
                </UFormField>
                <UFormField label="Slot">
                  <UInput
                    v-model.number="permanentForm.slotNumber"
                    type="number"
                    min="1"
                    max="99"
                  />
                </UFormField>
                <UFormField label="Code">
                  <UInput
                    v-model="permanentForm.code"
                    maxlength="6"
                    inputmode="numeric"
                    placeholder="000000"
                  />
                </UFormField>
                <UFormField label="Active">
                  <UCheckbox
                    v-model="permanentForm.active"
                    label="Enabled"
                  />
                </UFormField>
              </div>
              <DashboardActionGroup
                align="start"
                :primary="{
                  label: permanentForm.id ? 'Update permanent code' : 'Create permanent code',
                  loading: savingPermanent,
                  onSelect: savePermanentCode
                }"
                :secondary="[
                  {
                    label: 'New',
                    color: 'neutral',
                    variant: 'soft',
                    onSelect: resetPermanentForm
                  }
                ]"
              />
            </div>
          </UCard>
        </template>
      </DashboardDataPanel>
    </div>
  </DashboardPageScaffold>
</template>
