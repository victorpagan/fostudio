<script setup lang="ts">
import { formatMembershipTierLabel } from '~~/app/utils/membershipTierLabel'
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()
const colorMode = useColorMode()

type CustomerRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
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
type PaymentMethodsResponse = {
  methods: SavedCardMethod[]
  defaultCardId?: string | null
}
type SubscriptionState = {
  hasManagedSubscription: boolean
  subscriptionStatus?: string | null
  currentPeriodEnd?: string | null
  pendingSwap?: {
    effectiveDate: string | null
    target?: { displayName?: string | null, cadence?: string | null } | null
  } | null
  pendingCancel?: {
    effectiveDate?: string | null
  } | null
}
type MembershipSummary = {
  tier: string | null
  cadence: string | null
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
  billing_provider: string | null
  membership_source: string | null
  manual_expires_at: string | null
}
type WaiverCurrentResponse = {
  status: 'current' | 'expired' | 'missing' | 'stale_version'
  renewalNeeded: boolean
  activeTemplate: {
    version: number
  } | null
  latestSignature: {
    signedAt: string
    expiresAt: string
    templateVersion: number
  } | null
}
type EmailPreferencesResponse = {
  preferences: {
    criticalEnabled: boolean
    nonCriticalEnabled: boolean
  }
}

const {
  data: customer,
  pending: customerPending,
  error: customerError,
  refresh
} = await useAsyncData('dash:profile', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as CustomerRow | null
})
const {
  data: paymentMethodsData,
  pending: paymentMethodsPending,
  error: paymentMethodsError,
  refresh: refreshPaymentMethods
} = await useAsyncData('dash:profile:payment-methods', async () => {
  if (!user.value?.sub) return { methods: [] as SavedCardMethod[], defaultCardId: null }
  return await $fetch<PaymentMethodsResponse>('/api/payments/methods')
}, { watch: [() => user.value?.sub], default: () => ({ methods: [], defaultCardId: null }), server: false })
const { data: subscriptionState, error: subscriptionStateError, refresh: refreshSubscriptionState } = await useAsyncData('dash:profile:subscription-state', async () => {
  if (!user.value?.sub) return null
  return await $fetch<SubscriptionState>('/api/membership/subscription-state')
}, { watch: [() => user.value?.sub], default: () => null })
const {
  data: membershipSummary,
  pending: membershipSummaryPending,
  error: membershipSummaryError,
  refresh: refreshMembershipSummary
} = await useAsyncData('dash:profile:membership-summary', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('tier,cadence,status,current_period_end,canceled_at,billing_provider,membership_source,manual_expires_at')
    .eq('user_id', user.value.sub)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as MembershipSummary | null
}, { watch: [() => user.value?.sub], default: () => null })
const {
  data: waiverStatus,
  pending: waiverStatusPending,
  error: waiverStatusError,
  refresh: refreshWaiverStatus
} = await useAsyncData('dash:profile:waiver-status', async () => {
  if (!user.value?.sub) return null
  return await $fetch<WaiverCurrentResponse>('/api/waiver/current')
}, { watch: [() => user.value?.sub], default: () => null })
const emailPreferences = reactive({
  criticalEnabled: true,
  nonCriticalEnabled: true
})
const emailPreferencesSaving = ref(false)
const {
  data: emailPreferencesData,
  pending: emailPreferencesPending,
  error: emailPreferencesError,
  refresh: refreshEmailPreferences
} = await useAsyncData('dash:profile:email-preferences', async () => {
  if (!user.value?.sub) {
    return {
      preferences: {
        criticalEnabled: true,
        nonCriticalEnabled: true
      }
    } as EmailPreferencesResponse
  }
  return await $fetch<EmailPreferencesResponse>('/api/profile/email-preferences')
}, {
  watch: [() => user.value?.sub],
  server: false,
  default: () => ({
    preferences: {
      criticalEnabled: true,
      nonCriticalEnabled: true
    }
  })
})

// Editable form — synced from customer data
const form = reactive({
  first_name: '',
  last_name: '',
  phone: ''
})

watch(customer, (c) => {
  if (!c) return
  form.first_name = c.first_name ?? ''
  form.last_name = c.last_name ?? ''
  form.phone = c.phone ?? ''
}, { immediate: true })
watch(emailPreferencesData, (data) => {
  const prefs = data?.preferences
  if (!prefs) return
  emailPreferences.criticalEnabled = Boolean(prefs.criticalEnabled)
  emailPreferences.nonCriticalEnabled = Boolean(prefs.nonCriticalEnabled)
}, { immediate: true })

const saving = ref(false)
const saved = ref(false)
const addingCard = ref(false)
const removingCardId = ref<string | null>(null)
const settingDefaultCardId = ref<string | null>(null)
const cardModalOpen = ref(false)
const removeCardConfirmOpen = ref(false)
const removeCardTarget = ref<SavedCardMethod | null>(null)

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Error'
  if ('data' in error && error.data && typeof error.data === 'object') {
    const data = error.data as { statusMessage?: string, message?: string }
    if (typeof data.statusMessage === 'string' && data.statusMessage.trim()) return data.statusMessage
    if (typeof data.message === 'string' && data.message.trim()) return data.message
  }
  if ('message' in error && typeof error.message === 'string' && error.message.trim()) return error.message
  return 'Error'
}

async function saveProfile() {
  if (!customer.value?.id) return
  saving.value = true
  saved.value = false
  try {
    const { error } = await supabase
      .from('customers')
      .update({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null
      })
      .eq('id', customer.value.id)

    if (error) throw error
    saved.value = true
    toast.add({ title: 'Profile saved', color: 'success' })
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Could not save', description: readErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

// Password change
const pwForm = reactive({ current: '', next: '', confirm: '' })
const pwSaving = ref(false)
const pwError = ref<string | null>(null)

async function changePassword() {
  pwError.value = null
  if (pwForm.next !== pwForm.confirm) {
    pwError.value = 'New passwords do not match'
    return
  }
  if (pwForm.next.length < 8) {
    pwError.value = 'Password must be at least 8 characters'
    return
  }
  pwSaving.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) throw error
    toast.add({ title: 'Password updated', color: 'success' })
    pwForm.current = ''
    pwForm.next = ''
    pwForm.confirm = ''
  } catch (error: unknown) {
    pwError.value = readErrorMessage(error)
  } finally {
    pwSaving.value = false
  }
}

const isDirty = computed(() =>
  form.first_name !== (customer.value?.first_name ?? '')
  || form.last_name !== (customer.value?.last_name ?? '')
  || form.phone !== (customer.value?.phone ?? '')
)
const savedCards = computed(() => paymentMethodsData.value?.methods ?? [])
const defaultCardId = computed(() => paymentMethodsData.value?.defaultCardId ?? null)
const membershipUiState = computed(() => resolveMembershipUiState(membershipSummary.value))
const isManualMembership = computed(() =>
  (membershipSummary.value?.membership_source ?? membershipSummary.value?.billing_provider ?? '').toLowerCase() === 'manual'
)
const isMembershipExpired = computed(() => {
  if (membershipUiState.value !== 'inactive') return false
  const value = membershipSummary.value?.manual_expires_at ?? membershipSummary.value?.current_period_end
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time <= Date.now()
})
const membershipTierLabel = computed(() => {
  if (!membershipSummary.value || membershipUiState.value === 'none') return null
  return formatMembershipTierLabel(membershipSummary.value?.tier) ?? null
})
const membershipUiStatusLabel = computed(() => {
  if (isMembershipExpired.value) return 'expired'
  if (isManualMembership.value && membershipUiState.value === 'active') return 'manual · active'
  return membershipUiState.value.replace(/_/g, ' ')
})
const membershipUiStatusColor = computed(() => {
  if (membershipUiState.value === 'active') return 'success'
  if (membershipUiState.value === 'past_due') return 'error'
  if (membershipUiState.value === 'pending_checkout') return 'warning'
  return 'neutral'
})
const waiverStatusLabel = computed(() => {
  const status = waiverStatus.value?.status
  if (status === 'current') return 'Current'
  if (status === 'expired') return 'Expired'
  if (status === 'stale_version') return 'Needs re-sign'
  return 'Missing'
})
const waiverStatusColor = computed(() => {
  const status = waiverStatus.value?.status
  if (status === 'current') return 'success'
  if (status === 'expired') return 'warning'
  return 'error'
})
const emailPreferencesDirty = computed(() => {
  const defaults = emailPreferencesData.value?.preferences
  if (!defaults) return false
  return (
    emailPreferences.criticalEnabled !== Boolean(defaults.criticalEnabled)
    || emailPreferences.nonCriticalEnabled !== Boolean(defaults.nonCriticalEnabled)
  )
})
const prefersDarkMode = computed({
  get: () => colorMode.value === 'dark',
  set: (value: boolean) => {
    colorMode.preference = value ? 'dark' : 'light'
  }
})

function formatExactDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatCardExpiry(month: number | null, year: number | null) {
  if (!month || !year) return '—'
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
}

function isCardExpired(month: number | null, year: number | null) {
  if (!month || !year) return false
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  return year < currentYear || (year === currentYear && month < currentMonth)
}

async function addPaymentMethod(payload: { sourceId: string }) {
  if (addingCard.value) return
  addingCard.value = true
  try {
    await $fetch('/api/payments/methods.add', {
      method: 'POST',
      body: { sourceId: payload.sourceId }
    })
    cardModalOpen.value = false
    toast.add({ title: 'Card saved', color: 'success' })
    await refreshPaymentMethods()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save card',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    addingCard.value = false
  }
}

async function removePaymentMethod(cardId: string) {
  if (removingCardId.value) return
  removingCardId.value = cardId
  try {
    await $fetch('/api/payments/methods.remove', {
      method: 'POST',
      body: { cardId }
    })
    toast.add({ title: 'Card removed', color: 'success' })
    removeCardConfirmOpen.value = false
    removeCardTarget.value = null
    await refreshPaymentMethods()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not remove card',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    removingCardId.value = null
  }
}

function requestRemovePaymentMethod(card: SavedCardMethod) {
  if (removingCardId.value) return
  removeCardTarget.value = card
  removeCardConfirmOpen.value = true
}

function closeRemoveCardConfirmation() {
  if (removingCardId.value) return
  removeCardConfirmOpen.value = false
  removeCardTarget.value = null
}

async function setDefaultPaymentMethod(cardId: string) {
  if (settingDefaultCardId.value) return
  settingDefaultCardId.value = cardId
  try {
    await $fetch('/api/payments/methods.default', {
      method: 'POST',
      body: { cardId }
    })
    toast.add({ title: 'Default card updated', color: 'success' })
    await refreshPaymentMethods()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not set default card',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    settingDefaultCardId.value = null
  }
}

async function saveEmailPreferences() {
  if (!user.value?.sub) return
  emailPreferencesSaving.value = true
  try {
    await $fetch('/api/profile/email-preferences.upsert', {
      method: 'POST',
      body: {
        criticalEnabled: emailPreferences.criticalEnabled,
        nonCriticalEnabled: emailPreferences.nonCriticalEnabled
      }
    })
    toast.add({ title: 'Email preferences saved', color: 'success' })
    await refreshEmailPreferences()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save email preferences',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    emailPreferencesSaving.value = false
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="profile"
    title="Profile"
  >
    <template #right>
      <DashboardActionGroup
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            onSelect: () => {
              refreshSubscriptionState()
              refreshMembershipSummary()
              refreshPaymentMethods()
              refreshWaiverStatus()
              refreshEmailPreferences()
            }
          }
        ]"
      />
    </template>
    <div class="space-y-4 max-w-xl">
      <UCard>
        <div class="space-y-4">
          <div class="text-sm font-medium">
            Billing
          </div>

          <AppAlert
            v-if="!membershipSummaryError && membershipUiState === 'past_due'"
            color="error"
            variant="soft"
            icon="i-lucide-credit-card"
            title="Membership payment is past due"
            description="Review the saved cards below or contact support. Member booking benefits remain paused until billing recovers."
          />
          <AppAlert
            v-else-if="!membershipSummaryError && isManualMembership"
            color="info"
            variant="soft"
            icon="i-lucide-user-cog"
            title="Admin-assigned membership"
            description="This assignment is not billed or canceled through Square. Contact FO Studio for membership changes."
          />
          <AppAlert
            v-if="subscriptionStateError && !membershipSummaryError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Live subscription details unavailable"
            description="Stored membership details are shown below, but current Square actions could not be verified."
          />

          <DashboardSectionState
            v-if="membershipSummaryPending"
            state="loading"
            title="Loading membership billing"
          />
          <DashboardSectionState
            v-else-if="membershipSummaryError"
            state="error"
            title="Membership billing unavailable"
            description="No guest or inactive billing state was assumed."
            show-retry
            @retry="refreshMembershipSummary"
          />
          <div
            v-else
            class="rounded-lg border border-default p-3 space-y-2 text-sm"
          >
            <div class="flex justify-between">
              <span class="text-dimmed">Tier</span>
              <span class="font-medium">{{ membershipTierLabel ?? 'No membership' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">Cadence</span>
              <span>{{ membershipSummary?.cadence ?? '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">Status</span>
              <UBadge
                :color="membershipUiStatusColor"
                variant="soft"
                size="xs"
              >
                {{ membershipUiStatusLabel }}
              </UBadge>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">Billing provider</span>
              <span>{{ isManualMembership ? 'Admin assigned' : membershipSummary?.billing_provider ?? '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-dimmed">{{ isManualMembership ? 'Assignment ends' : 'Current period end' }}</span>
              <span>{{ formatExactDate(isManualMembership ? membershipSummary?.manual_expires_at : subscriptionState?.currentPeriodEnd ?? membershipSummary?.current_period_end) ?? (isManualMembership ? 'No scheduled expiration' : '—') }}</span>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium">
                Saved cards
              </div>
              <UButton
                size="xs"
                @click="cardModalOpen = true"
              >
                Add card
              </UButton>
            </div>

            <DashboardSectionState
              v-if="paymentMethodsPending"
              state="loading"
              title="Loading saved cards"
            />
            <DashboardSectionState
              v-else-if="paymentMethodsError"
              state="error"
              title="Could not load saved cards"
              description="No empty card state was assumed."
              show-retry
              @retry="refreshPaymentMethods"
            />
            <DashboardSectionState
              v-else-if="savedCards.length === 0"
              state="empty"
              title="No saved cards"
              description="Add a card for membership billing and faster credit purchases."
            />
            <div
              v-else
              class="space-y-2"
            >
              <div
                v-for="card in savedCards"
                :key="card.id"
                class="rounded-lg border border-default p-3 flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate flex items-center gap-2">
                    {{ card.brand ?? 'Card' }} •••• {{ card.last4 ?? '----' }}
                    <UBadge
                      v-if="defaultCardId === card.id"
                      size="xs"
                      color="success"
                      variant="soft"
                      label="Default"
                    />
                  </div>
                  <div class="text-xs text-dimmed">
                    Expires {{ formatCardExpiry(card.expMonth, card.expYear) }}
                    <span
                      v-if="isCardExpired(card.expMonth, card.expYear)"
                      class="text-warning"
                    > · expired</span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    v-if="defaultCardId !== card.id"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    :loading="settingDefaultCardId === card.id"
                    @click="setDefaultPaymentMethod(card.id)"
                  >
                    Make default
                  </UButton>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    :loading="removingCardId === card.id"
                    @click="requestRemovePaymentMethod(card)"
                  >
                    Remove
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-medium">
            Waiver
          </div>
          <UBadge
            :color="waiverStatusError ? 'error' : waiverStatusColor"
            variant="soft"
            size="xs"
          >
            {{ waiverStatusPending ? 'Loading' : waiverStatusError ? 'Unavailable' : waiverStatusLabel }}
          </UBadge>
        </div>
        <DashboardSectionState
          v-if="waiverStatusPending"
          class="mt-3"
          state="loading"
          title="Loading waiver status"
        />
        <DashboardSectionState
          v-else-if="waiverStatusError"
          class="mt-3"
          state="error"
          title="Could not load waiver status"
          show-retry
          @retry="refreshWaiverStatus"
        />
        <div
          v-else
          class="mt-3 rounded-lg border border-default p-3 space-y-2 text-sm"
        >
          <div class="flex justify-between">
            <span class="text-dimmed">Active version</span>
            <span>{{ waiverStatus?.activeTemplate?.version ?? '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-dimmed">Signed version</span>
            <span>{{ waiverStatus?.latestSignature?.templateVersion ?? '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-dimmed">Signed at</span>
            <span>{{ formatExactDate(waiverStatus?.latestSignature?.signedAt) ?? '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-dimmed">Expires at</span>
            <span>{{ formatExactDate(waiverStatus?.latestSignature?.expiresAt) ?? '—' }}</span>
          </div>
        </div>
        <div
          v-if="!waiverStatusError"
          class="mt-3 flex justify-end"
        >
          <UButton
            size="sm"
            to="/dashboard/waiver"
          >
            View waiver
          </UButton>
        </div>
      </UCard>

      <UCard>
        <div class="space-y-4">
          <div class="text-sm font-medium">
            Appearance
          </div>
          <SwitchRow
            v-model="prefersDarkMode"
            label="Dark mode"
            description="Choose the dashboard color theme."
          />
        </div>
      </UCard>

      <UCard>
        <div class="space-y-4">
          <div class="text-sm font-medium">
            Email preferences
          </div>

          <DashboardSectionState
            v-if="emailPreferencesPending"
            state="loading"
            title="Loading email preferences"
          />
          <DashboardSectionState
            v-else-if="emailPreferencesError"
            state="error"
            title="Could not load email preferences"
            description="No default preference state was assumed."
            show-retry
            @retry="refreshEmailPreferences"
          />

          <SwitchRow
            v-model="emailPreferences.criticalEnabled"
            label="Critical emails"
            description="Membership and booking status updates."
            :disabled="emailPreferencesPending || Boolean(emailPreferencesError)"
          />

          <SwitchRow
            v-model="emailPreferences.nonCriticalEnabled"
            label="Non-critical emails"
            description="Optional reminders and informational messages."
            :disabled="emailPreferencesPending || Boolean(emailPreferencesError)"
          />

          <div class="flex justify-end">
            <UButton
              :loading="emailPreferencesSaving"
              :disabled="!emailPreferencesDirty || emailPreferencesPending || Boolean(emailPreferencesError)"
              @click="saveEmailPreferences"
            >
              Save email preferences
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Account info -->
      <UCard>
        <form
          class="space-y-4"
          @submit.prevent="saveProfile"
        >
          <div class="text-sm font-medium">
            Account
          </div>

          <DashboardSectionState
            v-if="customerPending"
            state="loading"
            title="Loading profile"
          />
          <DashboardSectionState
            v-else-if="customerError"
            state="error"
            title="Could not load profile"
            description="Profile fields remain disabled to avoid overwriting unknown values."
            show-retry
            @retry="refresh"
          />

          <div class="space-y-1">
            <div class="text-xs text-dimmed">
              Email
            </div>
            <div class="text-sm font-medium">
              {{ user?.email ?? '—' }}
            </div>
            <p class="text-xs text-dimmed">
              Email cannot be changed here. Contact support if needed.
            </p>
          </div>

          <div class="border-t border-default pt-4 grid grid-cols-2 gap-3">
            <UFormField label="First name">
              <UInput
                v-model="form.first_name"
                placeholder="Jane"
                class="w-full"
                :disabled="customerPending || Boolean(customerError)"
              />
            </UFormField>
            <UFormField label="Last name">
              <UInput
                v-model="form.last_name"
                placeholder="Smith"
                class="w-full"
                :disabled="customerPending || Boolean(customerError)"
              />
            </UFormField>
          </div>

          <UFormField label="Phone number">
            <UInput
              v-model="form.phone"
              type="tel"
              placeholder="+1 555 000 0000"
              class="w-full"
              :disabled="customerPending || Boolean(customerError)"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              type="submit"
              :loading="saving"
              :disabled="!isDirty || customerPending || Boolean(customerError)"
            >
              Save changes
            </UButton>
          </div>
        </form>
      </UCard>

      <!-- Change password -->
      <UCard>
        <form
          class="space-y-4"
          @submit.prevent="changePassword"
        >
          <div class="text-sm font-medium">
            Change password
          </div>

          <UFormField label="New password">
            <UInput
              v-model="pwForm.next"
              type="password"
              placeholder="••••••••"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Confirm new password">
            <UInput
              v-model="pwForm.confirm"
              type="password"
              placeholder="••••••••"
              class="w-full"
            />
          </UFormField>

          <AppAlert
            v-if="pwError"
            color="error"
            variant="soft"
            :title="pwError"
          />

          <div class="flex justify-end">
            <UButton
              type="submit"
              :loading="pwSaving"
              :disabled="!pwForm.next || !pwForm.confirm"
              color="neutral"
              variant="soft"
            >
              Update password
            </UButton>
          </div>
        </form>
      </UCard>

      <!-- Danger zone -->
      <UCard>
        <div class="space-y-3">
          <div class="text-sm font-medium text-red-600 dark:text-red-400">
            Danger zone
          </div>
          <p class="text-sm text-dimmed">
            Manage eligible membership changes from the Membership page. Account deletion requires support and cannot be completed while a paid or assigned membership is active.
          </p>
          <UButton
            color="error"
            variant="soft"
            size="sm"
            disabled
          >
            Delete account (contact support)
          </UButton>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="removeCardConfirmOpen"
      title="Remove saved card?"
      description="Confirm before removing this card from future billing and purchases."
      :dismissible="!removingCardId"
    >
      <template #content>
        <UCard v-if="removeCardTarget">
          <template #header>
            <h3 class="text-base font-semibold">
              Remove saved card?
            </h3>
          </template>
          <div class="space-y-3 text-sm">
            <p class="text-dimmed">
              Future membership renewals and purchases cannot use this card after removal.
            </p>
            <div class="rounded-lg border border-default p-3 font-medium">
              {{ removeCardTarget.brand ?? 'Card' }} •••• {{ removeCardTarget.last4 ?? '----' }}
            </div>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                :disabled="Boolean(removingCardId)"
                @click="closeRemoveCardConfirmation"
              >
                Keep card
              </UButton>
              <UButton
                color="error"
                :loading="removingCardId === removeCardTarget.id"
                @click="removePaymentMethod(removeCardTarget.id)"
              >
                Remove card
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <SquareCardPaymentModal
      v-model:open="cardModalOpen"
      instance-key="profile-add-card"
      title="Add payment method"
      description="Save a card to use for membership billing, credits, and holds."
      :amount-cents="0"
      currency="USD"
      confirm-label="Save card"
      :busy="addingCard"
      @confirm="addPaymentMethod"
    />
  </DashboardPageScaffold>
</template>
