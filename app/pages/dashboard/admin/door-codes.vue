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
const savingMemberDoorCode = ref(false)

const savingPermanent = ref(false)
const deletingPermanentId = ref<string | null>(null)
const savingAccessSettings = ref(false)
const doorCodesTab = ref<DoorCodesTab>('members')
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

const members = computed(() => data.value?.members ?? [])
const permanentCodes = computed(() => data.value?.permanentCodes ?? [])
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

function syncStatusColor(status: PermanentCodeRecord['last_sync_status']) {
  if (status === 'ok') return 'success'
  if (status === 'error') return 'error'
  return 'neutral'
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
  <UDashboardPanel id="admin-door-codes">
    <template #header>
      <UDashboardNavbar
        title="Door Codes"
        :ui="{ right: 'gap-2' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
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
          <UCard v-if="doorCodesTab === 'members'">
            <div class="font-medium">
              Member door codes
            </div>
            <p class="mt-1 text-xs text-dimmed">
              Member codes are booking-window controlled by access jobs.
            </p>

            <div class="mt-3 max-h-80 overflow-auto rounded-lg border border-default">
              <table class="min-w-full text-sm">
                <thead class="bg-elevated/50 text-left text-xs uppercase tracking-wide text-dimmed">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      Member
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Code
                    </th>
                    <th class="px-3 py-2 font-medium text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="member in members"
                    :key="member.membership_id"
                    class="border-t border-default transition"
                    :class="selectedMemberId === member.membership_id ? 'bg-elevated/60' : 'hover:bg-elevated/30'"
                  >
                    <td class="px-3 py-2">
                      {{ memberLabel(member) }}
                    </td>
                    <td class="px-3 py-2">
                      <UBadge
                        :color="memberStatusColor(member.effective_status)"
                        size="xs"
                        variant="soft"
                      >
                        {{ member.effective_status }}
                      </UBadge>
                    </td>
                    <td class="px-3 py-2 font-mono">
                      {{ member.door_code || 'none' }}
                    </td>
                    <td class="px-3 py-2 text-right">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        @click="() => { selectedMemberId = member.membership_id; memberDoorCode = member.door_code ?? '' }"
                      >
                        Edit
                      </UButton>
                    </td>
                  </tr>
                  <tr v-if="!members.length">
                    <td
                      colspan="4"
                      class="px-3 py-4 text-sm text-dimmed"
                    >
                      No members found.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div
              v-if="selectedMember"
              class="mt-4 grid gap-3 sm:grid-cols-[12rem_auto]"
            >
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
          </UCard>

          <UCard v-else>
            <div class="font-medium">
              Permanent door codes
            </div>
            <p class="mt-1 text-xs text-dimmed">
              Permanent codes are programmed directly to the selected slot and stay active while enabled.
            </p>

            <div class="mt-3 grid gap-3 sm:grid-cols-2">
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

            <div class="mt-3 flex gap-2">
              <UButton
                :loading="savingPermanent"
                @click="savePermanentCode"
              >
                {{ permanentForm.id ? 'Update permanent code' : 'Create permanent code' }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                @click="resetPermanentForm"
              >
                New
              </UButton>
            </div>

            <div class="mt-4 max-h-80 overflow-auto rounded-lg border border-default">
              <table class="min-w-full text-sm">
                <thead class="bg-elevated/50 text-left text-xs uppercase tracking-wide text-dimmed">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      Label
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Slot
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Code
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Sync
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Last sync
                    </th>
                    <th class="px-3 py-2 font-medium text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in permanentCodes"
                    :key="row.id"
                    class="border-t border-default"
                  >
                    <td class="px-3 py-2">
                      {{ row.label }}
                    </td>
                    <td class="px-3 py-2">
                      {{ row.slot_number }}
                    </td>
                    <td class="px-3 py-2 font-mono">
                      {{ row.code }}
                    </td>
                    <td class="px-3 py-2">
                      <UBadge
                        :color="row.active ? 'success' : 'neutral'"
                        size="xs"
                        variant="soft"
                      >
                        {{ row.active ? 'active' : 'inactive' }}
                      </UBadge>
                    </td>
                    <td class="px-3 py-2">
                      <UBadge
                        :color="syncStatusColor(row.last_sync_status)"
                        size="xs"
                        variant="soft"
                      >
                        {{ row.last_sync_status ?? 'unknown' }}
                      </UBadge>
                    </td>
                    <td class="px-3 py-2">
                      <span class="text-xs text-dimmed">{{ formatDateTime(row.last_synced_at) }}</span>
                      <div
                        v-if="row.last_sync_error"
                        class="mt-1 text-xs text-error"
                      >
                        {{ row.last_sync_error }}
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex justify-end gap-2">
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
                    </td>
                  </tr>
                  <tr v-if="!permanentCodes.length">
                    <td
                      colspan="7"
                      class="px-3 py-4 text-sm text-dimmed"
                    >
                      No permanent door codes configured.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
