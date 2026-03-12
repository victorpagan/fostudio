<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

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
  billing_provider: string | null
}

const { data: customer, refresh } = await useAsyncData('dash:profile', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as CustomerRow | null
})
const { data: paymentMethodsData, refresh: refreshPaymentMethods } = await useAsyncData('dash:profile:payment-methods', async () => {
  if (!user.value?.sub) return { methods: [] as SavedCardMethod[] }
  return await $fetch<{ methods: SavedCardMethod[] }>('/api/payments/methods')
}, { watch: [() => user.value?.sub], default: () => ({ methods: [] }) })
const { data: subscriptionState, refresh: refreshSubscriptionState } = await useAsyncData('dash:profile:subscription-state', async () => {
  if (!user.value?.sub) return null
  return await $fetch<SubscriptionState>('/api/membership/subscription-state')
}, { watch: [() => user.value?.sub], default: () => null })
const { data: membershipSummary, refresh: refreshMembershipSummary } = await useAsyncData('dash:profile:membership-summary', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('tier,cadence,status,current_period_end,billing_provider')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipSummary | null
}, { watch: [() => user.value?.sub], default: () => null })

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

const saving = ref(false)
const saved = ref(false)
const addingCard = ref(false)
const removingCardId = ref<string | null>(null)
const cardModalOpen = ref(false)

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
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.message ?? 'Error', color: 'error' })
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
  } catch (e: any) {
    pwError.value = e?.message ?? 'Failed to update password'
  } finally {
    pwSaving.value = false
  }
}

const isDirty = computed(() =>
  form.first_name !== (customer.value?.first_name ?? '') ||
  form.last_name !== (customer.value?.last_name ?? '') ||
  form.phone !== (customer.value?.phone ?? '')
)
const savedCards = computed(() => paymentMethodsData.value?.methods ?? [])

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
  } catch (error: any) {
    toast.add({
      title: 'Could not save card',
      description: error?.data?.statusMessage ?? error?.message ?? 'Error',
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
    await refreshPaymentMethods()
  } catch (error: any) {
    toast.add({
      title: 'Could not remove card',
      description: error?.data?.statusMessage ?? error?.message ?? 'Error',
      color: 'error'
    })
  } finally {
    removingCardId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="profile">
    <template #header>
      <UDashboardNavbar title="Profile">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4 max-w-xl">
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium">Billing</div>
              <UButton size="xs" color="neutral" variant="soft" @click="refreshSubscriptionState(); refreshMembershipSummary(); refreshPaymentMethods()">
                Refresh
              </UButton>
            </div>

            <div class="rounded-lg border border-default p-3 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-dimmed">Tier</span>
                <span class="font-medium">{{ membershipSummary?.tier ?? 'No active membership' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">Cadence</span>
                <span>{{ membershipSummary?.cadence ?? '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">Status</span>
                <span>{{ membershipSummary?.status ?? '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">Billing provider</span>
                <span>{{ membershipSummary?.billing_provider ?? '—' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dimmed">Current period end</span>
                <span>{{ formatExactDate(subscriptionState?.currentPeriodEnd ?? membershipSummary?.current_period_end) ?? '—' }}</span>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-sm font-medium">Saved cards</div>
                <UButton size="xs" @click="cardModalOpen = true">
                  Add card
                </UButton>
              </div>

              <div v-if="savedCards.length === 0" class="text-xs text-dimmed">
                No saved cards yet.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="card in savedCards"
                  :key="card.id"
                  class="rounded-lg border border-default p-3 flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate">
                      {{ card.brand ?? 'Card' }} •••• {{ card.last4 ?? '----' }}
                    </div>
                    <div class="text-xs text-dimmed">
                      Expires {{ formatCardExpiry(card.expMonth, card.expYear) }}
                      <span v-if="!card.enabled" class="text-error"> · unavailable</span>
                      <span v-if="isCardExpired(card.expMonth, card.expYear)" class="text-warning"> · expired</span>
                    </div>
                  </div>
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    :disabled="!card.enabled"
                    :loading="removingCardId === card.id"
                    @click="removePaymentMethod(card.id)"
                  >
                    Remove
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Account info -->
        <UCard>
          <div class="space-y-4">
            <div class="text-sm font-medium">Account</div>

            <div class="space-y-1">
              <div class="text-xs text-dimmed">Email</div>
              <div class="text-sm font-medium">{{ user?.email ?? '—' }}</div>
              <p class="text-xs text-dimmed">Email cannot be changed here. Contact support if needed.</p>
            </div>

            <div class="border-t border-default pt-4 grid grid-cols-2 gap-3">
              <UFormField label="First name">
                <UInput v-model="form.first_name" placeholder="Jane" class="w-full" />
              </UFormField>
              <UFormField label="Last name">
                <UInput v-model="form.last_name" placeholder="Smith" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Phone number">
              <UInput v-model="form.phone" type="tel" placeholder="+1 555 000 0000" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                :loading="saving"
                :disabled="!isDirty"
                @click="saveProfile"
              >
                Save changes
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Change password -->
        <UCard>
          <div class="space-y-4">
            <div class="text-sm font-medium">Change password</div>

            <UFormField label="New password">
              <UInput v-model="pwForm.next" type="password" placeholder="••••••••" class="w-full" />
            </UFormField>
            <UFormField label="Confirm new password">
              <UInput v-model="pwForm.confirm" type="password" placeholder="••••••••" class="w-full" />
            </UFormField>

            <UAlert v-if="pwError" color="error" variant="soft" :title="pwError" />

            <div class="flex justify-end">
              <UButton
                :loading="pwSaving"
                :disabled="!pwForm.next || !pwForm.confirm"
                color="neutral"
                variant="soft"
                @click="changePassword"
              >
                Update password
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Danger zone -->
        <UCard>
          <div class="space-y-3">
            <div class="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</div>
            <p class="text-sm text-dimmed">
              To cancel your membership or delete your account, please contact us directly.
              Active memberships are managed through Square and must be canceled before account deletion.
            </p>
            <UButton color="error" variant="soft" size="sm" disabled>
              Delete account (contact support)
            </UButton>
          </div>
        </UCard>
      </div>

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
    </template>
  </UDashboardPanel>
</template>
