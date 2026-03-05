<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

type AdminOpsResponse = {
  summary: {
    dueGrantCount: number
    scheduledGrantCount: number
    membershipsNeedingAttention: number
    guestBookings: number
    membershipsMissingFutureSchedule: number
  }
  dueGrants: Array<{
    id: string
    membership_id: string
    user_id: string
    invoice_id: string | null
    due_at: string
    credits: number
    processed_credits: number | null
    status: string
    last_error: string | null
    created_at: string
  }>
  upcomingGrants: Array<{
    id: string
    membership_id: string
    user_id: string
    invoice_id: string | null
    due_at: string
    credits: number
    processed_credits: number | null
    status: string
    last_error: string | null
    created_at: string
  }>
  membershipsNeedingAttention: Array<{
    id: string
    user_id: string
    tier: string | null
    cadence: string | null
    status: string | null
    current_period_start: string | null
    current_period_end: string | null
    last_invoice_id: string | null
    last_paid_at: string | null
  }>
  membershipsMissingFutureSchedule: Array<{
    id: string
    user_id: string
    tier: string | null
    cadence: string | null
    status: string | null
    current_period_start: string | null
    current_period_end: string | null
    last_invoice_id: string | null
    last_paid_at: string | null
  }>
  recentGuestBookings: Array<{
    id: string
    start_time: string
    end_time: string
    status: string
    guest_name: string | null
    guest_email: string | null
    notes: string | null
    created_at: string
    square_order_id: string | null
  }>
}

type ProcessGrantsResult = {
  processed_count: number
  skipped_count: number
  canceled_count: number
}

type CreatedTierResult = {
  tierId: string
  squarePlanId: string
  directAccessOnly: boolean
  checkoutLinks: Array<{
    cadence: 'monthly' | 'quarterly' | 'annual'
    url: string
  }>
  variationIds: Array<{
    cadence: 'monthly' | 'quarterly' | 'annual'
    providerPlanVariationId: string
  }>
}

const toast = useToast()
const data = ref<AdminOpsResponse | null>(null)
const pending = ref(false)
const processing = ref(false)
const backfilling = ref(false)
const creatingTier = ref(false)
const createdTier = ref<CreatedTierResult | null>(null)

const tierForm = reactive({
  tierId: '',
  displayName: '',
  description: '',
  bookingWindowDays: 30,
  peakMultiplier: 1,
  maxBank: 100,
  maxSlots: null as number | null,
  holdsIncluded: 0,
  sortOrder: 100,
  active: true,
  visible: true,
  directAccessOnly: false,
  cadences: {
    monthly: { enabled: true, creditsPerMonth: 12, priceCents: 40000, discountLabel: '' },
    quarterly: { enabled: true, creditsPerMonth: 12, priceCents: 114000, discountLabel: 'Save 5%' },
    annual: { enabled: true, creditsPerMonth: 12, priceCents: 432000, discountLabel: 'Save 10%' }
  }
})

onMounted(() => {
  void loadOps()
})

async function processDueGrants() {
  processing.value = true

  try {
    const res = await $fetch<{ result: ProcessGrantsResult | null }>('/api/admin/grants/process', {
      method: 'POST',
      body: {}
    })

    const result = res.result
    toast.add({
      title: 'Due grants processed',
      description: result
        ? `${result.processed_count} processed, ${result.skipped_count} skipped, ${result.canceled_count} canceled.`
        : 'No grants were processed.'
    })
    await loadOps()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not process grants',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    processing.value = false
  }
}

async function backfillSchedules() {
  backfilling.value = true

  try {
    const res = await $fetch<{
      backfilled: number
      processed: ProcessGrantsResult | null
    }>('/api/admin/grants/backfill', {
      method: 'POST',
      body: {}
    })

    toast.add({
      title: 'Grant schedules rebuilt',
      description: `${res.backfilled} memberships backfilled.`
    })
    await loadOps()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not backfill schedules',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    backfilling.value = false
  }
}

async function createSubscriptionTier() {
  creatingTier.value = true
  createdTier.value = null

  try {
    const payload = {
      tierId: tierForm.tierId.trim().toLowerCase(),
      displayName: tierForm.displayName.trim(),
      description: tierForm.description.trim() || null,
      bookingWindowDays: Number(tierForm.bookingWindowDays),
      peakMultiplier: Number(tierForm.peakMultiplier),
      maxBank: Number(tierForm.maxBank),
      maxSlots: tierForm.maxSlots === null ? null : Number(tierForm.maxSlots),
      holdsIncluded: Number(tierForm.holdsIncluded),
      sortOrder: Number(tierForm.sortOrder),
      active: tierForm.active,
      visible: tierForm.visible,
      directAccessOnly: tierForm.directAccessOnly,
      cadences: {
        monthly: {
          enabled: tierForm.cadences.monthly.enabled,
          creditsPerMonth: Number(tierForm.cadences.monthly.creditsPerMonth),
          priceCents: Number(tierForm.cadences.monthly.priceCents),
          discountLabel: tierForm.cadences.monthly.discountLabel.trim() || null
        },
        quarterly: {
          enabled: tierForm.cadences.quarterly.enabled,
          creditsPerMonth: Number(tierForm.cadences.quarterly.creditsPerMonth),
          priceCents: Number(tierForm.cadences.quarterly.priceCents),
          discountLabel: tierForm.cadences.quarterly.discountLabel.trim() || null
        },
        annual: {
          enabled: tierForm.cadences.annual.enabled,
          creditsPerMonth: Number(tierForm.cadences.annual.creditsPerMonth),
          priceCents: Number(tierForm.cadences.annual.priceCents),
          discountLabel: tierForm.cadences.annual.discountLabel.trim() || null
        }
      }
    }

    const res = await $fetch<CreatedTierResult>('/api/admin/membership/tier-create', {
      method: 'POST',
      body: payload
    })

    createdTier.value = res

    toast.add({
      title: 'Tier created',
      description: `Tier "${res.tierId}" was created and synced to Square plan ${res.squarePlanId}.`
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not create subscription tier',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    creatingTier.value = false
  }
}

async function loadOps() {
  pending.value = true

  try {
    data.value = await $fetch('/api/admin/ops')
  } catch (error: unknown) {
    if (readErrorMessage(error) === 'Admin access required') {
      await navigateTo('/dashboard')
      return
    }

    toast.add({
      title: 'Could not load admin tools',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    pending.value = false
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'

  const maybeError = error as {
    data?: { statusMessage?: string | null }
    message?: string | null
  }

  return maybeError.data?.statusMessage ?? maybeError.message ?? 'Unknown error'
}
</script>

<template>
  <UDashboardPanel id="admin">
    <template #header>
      <UDashboardNavbar
        title="Admin"
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
            @click="loadOps"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-shield"
          title="Admin tools"
          description="Use this page to inspect scheduled membership credits, run manual grant processing, and watch guest bookings."
        />

        <div class="grid gap-4 md:grid-cols-5">
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Due grants
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary.dueGrantCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Scheduled
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary.scheduledGrantCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Attention
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary.membershipsNeedingAttention ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Guest bookings
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary.guestBookings ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Missing future schedule
            </div>
            <div class="mt-2 text-3xl font-semibold">
              {{ data?.summary.membershipsMissingFutureSchedule ?? 0 }}
            </div>
          </UCard>
        </div>

        <UCard>
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="font-medium">
                Grant operations
              </div>
              <p class="mt-1 text-sm text-dimmed">
                Process due runs the same job as pg_cron. Backfill current periods rebuilds schedules from active memberships with a current billing period.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                :loading="processing"
                @click="processDueGrants"
              >
                Process due
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                :loading="backfilling"
                @click="backfillSchedules"
              >
                Backfill current periods
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="font-medium">
              Subscription tier creator
            </div>
          </template>

          <p class="mb-4 text-sm text-dimmed">
            Creates or updates a membership tier in this app and creates active Square subscription plan variations in one step.
          </p>

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Tier id (snake_case)">
              <UInput
                v-model="tierForm.tierId"
                placeholder="creator_plus"
              />
            </UFormField>
            <UFormField label="Display name">
              <UInput
                v-model="tierForm.displayName"
                placeholder="Creator+"
              />
            </UFormField>
            <UFormField
              label="Description"
              class="md:col-span-2"
            >
              <UInput
                v-model="tierForm.description"
                placeholder="Plan description shown in admin contexts"
              />
            </UFormField>
            <UFormField label="Booking window (days)">
              <UInput
                v-model.number="tierForm.bookingWindowDays"
                type="number"
                min="1"
              />
            </UFormField>
            <UFormField label="Peak credits/hour">
              <UInput
                v-model.number="tierForm.peakMultiplier"
                type="number"
                min="1"
                step="0.25"
              />
            </UFormField>
            <UFormField label="Max bank">
              <UInput
                v-model.number="tierForm.maxBank"
                type="number"
                min="0"
              />
            </UFormField>
            <UFormField label="Holds included">
              <UInput
                v-model.number="tierForm.holdsIncluded"
                type="number"
                min="0"
              />
            </UFormField>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div class="rounded-lg border border-default p-3">
              <div class="mb-2 text-sm font-medium">
                Monthly
              </div>
              <UCheckbox
                v-model="tierForm.cadences.monthly.enabled"
                label="Enable"
              />
              <div class="mt-2 space-y-2">
                <UInput
                  v-model.number="tierForm.cadences.monthly.creditsPerMonth"
                  type="number"
                  min="0"
                  placeholder="Credits / month"
                />
                <UInput
                  v-model.number="tierForm.cadences.monthly.priceCents"
                  type="number"
                  min="0"
                  placeholder="Price cents (e.g. 40000)"
                />
                <UInput
                  v-model="tierForm.cadences.monthly.discountLabel"
                  placeholder="Discount label"
                />
              </div>
            </div>

            <div class="rounded-lg border border-default p-3">
              <div class="mb-2 text-sm font-medium">
                Quarterly
              </div>
              <UCheckbox
                v-model="tierForm.cadences.quarterly.enabled"
                label="Enable"
              />
              <div class="mt-2 space-y-2">
                <UInput
                  v-model.number="tierForm.cadences.quarterly.creditsPerMonth"
                  type="number"
                  min="0"
                  placeholder="Credits / month"
                />
                <UInput
                  v-model.number="tierForm.cadences.quarterly.priceCents"
                  type="number"
                  min="0"
                  placeholder="Price cents (e.g. 114000)"
                />
                <UInput
                  v-model="tierForm.cadences.quarterly.discountLabel"
                  placeholder="Discount label"
                />
              </div>
            </div>

            <div class="rounded-lg border border-default p-3">
              <div class="mb-2 text-sm font-medium">
                Annual
              </div>
              <UCheckbox
                v-model="tierForm.cadences.annual.enabled"
                label="Enable"
              />
              <div class="mt-2 space-y-2">
                <UInput
                  v-model.number="tierForm.cadences.annual.creditsPerMonth"
                  type="number"
                  min="0"
                  placeholder="Credits / month"
                />
                <UInput
                  v-model.number="tierForm.cadences.annual.priceCents"
                  type="number"
                  min="0"
                  placeholder="Price cents (e.g. 432000)"
                />
                <UInput
                  v-model="tierForm.cadences.annual.discountLabel"
                  placeholder="Discount label"
                />
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-4">
            <UCheckbox
              v-model="tierForm.active"
              label="Active"
            />
            <UCheckbox
              v-model="tierForm.visible"
              label="Visible in membership catalog"
            />
            <UCheckbox
              v-model="tierForm.directAccessOnly"
              label="Direct access only (hidden, admin link flow)"
            />
          </div>

          <div class="mt-4">
            <UButton
              :loading="creatingTier"
              @click="createSubscriptionTier"
            >
              Create tier + Square subscriptions
            </UButton>
          </div>

          <div
            v-if="createdTier"
            class="mt-4 rounded-lg border border-default p-3 text-sm"
          >
            <div class="font-medium">
              Created {{ createdTier.tierId }} · Square plan {{ createdTier.squarePlanId }}
            </div>
            <div class="mt-2 space-y-1 text-dimmed">
              <div
                v-for="link in createdTier.checkoutLinks"
                :key="link.cadence"
              >
                {{ link.cadence }}: {{ link.url }}
              </div>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 xl:grid-cols-2">
          <UCard>
            <template #header>
              <div class="font-medium">
                Due now
              </div>
            </template>

            <div
              v-if="!(data?.dueGrants?.length)"
              class="text-sm text-dimmed"
            >
              No scheduled grants are currently due.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="grant in data?.dueGrants"
                :key="grant.id"
                class="rounded-lg border border-default p-3 text-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ grant.credits }} credits</span>
                  <UBadge
                    color="warning"
                    variant="soft"
                  >
                    {{ grant.status }}
                  </UBadge>
                </div>
                <div class="mt-1 text-dimmed">
                  Due {{ formatDateTime(grant.due_at) }}
                </div>
                <div class="mt-1 text-dimmed">
                  Membership {{ grant.membership_id }}
                </div>
                <div
                  v-if="grant.last_error"
                  class="mt-1 text-error-600 dark:text-error-400"
                >
                  {{ grant.last_error }}
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="font-medium">
                Upcoming scheduled grants
              </div>
            </template>

            <div
              v-if="!(data?.upcomingGrants?.length)"
              class="text-sm text-dimmed"
            >
              No future grants are scheduled yet.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="grant in data?.upcomingGrants"
                :key="grant.id"
                class="rounded-lg border border-default p-3 text-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ grant.credits }} credits</span>
                  <UBadge
                    color="neutral"
                    variant="soft"
                  >
                    {{ grant.status }}
                  </UBadge>
                </div>
                <div class="mt-1 text-dimmed">
                  Due {{ formatDateTime(grant.due_at) }}
                </div>
                <div class="mt-1 text-dimmed">
                  Membership {{ grant.membership_id }}
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <UCard>
            <template #header>
              <div class="font-medium">
                Memberships needing attention
              </div>
            </template>

            <div
              v-if="!(data?.membershipsNeedingAttention?.length)"
              class="text-sm text-dimmed"
            >
              No memberships are currently flagged by status.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="membership in data?.membershipsNeedingAttention"
                :key="membership.id"
                class="rounded-lg border border-default p-3 text-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ membership.tier ?? 'Unknown tier' }} · {{ membership.cadence ?? '—' }}</span>
                  <UBadge
                    color="error"
                    variant="soft"
                  >
                    {{ membership.status }}
                  </UBadge>
                </div>
                <div class="mt-1 text-dimmed">
                  User {{ membership.user_id }}
                </div>
                <div class="mt-1 text-dimmed">
                  Period ends {{ formatDateTime(membership.current_period_end) }}
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="font-medium">
                Active memberships missing future schedule
              </div>
            </template>

            <div
              v-if="!(data?.membershipsMissingFutureSchedule?.length)"
              class="text-sm text-dimmed"
            >
              All active quarterly and annual memberships currently have future grant rows.
            </div>

            <div
              v-else
              class="space-y-3"
            >
              <div
                v-for="membership in data?.membershipsMissingFutureSchedule"
                :key="membership.id"
                class="rounded-lg border border-default p-3 text-sm"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ membership.tier ?? 'Unknown tier' }} · {{ membership.cadence ?? '—' }}</span>
                  <UBadge
                    color="warning"
                    variant="soft"
                  >
                    Missing schedule
                  </UBadge>
                </div>
                <div class="mt-1 text-dimmed">
                  User {{ membership.user_id }}
                </div>
                <div class="mt-1 text-dimmed">
                  Current period {{ formatDateTime(membership.current_period_start) }} → {{ formatDateTime(membership.current_period_end) }}
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="font-medium">
              Recent guest bookings
            </div>
          </template>

          <div
            v-if="!(data?.recentGuestBookings?.length)"
            class="text-sm text-dimmed"
          >
            No guest bookings found.
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <div
              v-for="booking in data?.recentGuestBookings"
              :key="booking.id"
              class="rounded-lg border border-default p-3 text-sm"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium">{{ booking.guest_name || booking.guest_email || 'Guest booking' }}</span>
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  {{ booking.status }}
                </UBadge>
              </div>
              <div class="mt-1 text-dimmed">
                {{ formatDateTime(booking.start_time) }} → {{ formatDateTime(booking.end_time) }}
              </div>
              <div class="mt-1 text-dimmed">
                Created {{ formatDateTime(booking.created_at) }}
              </div>
              <div
                v-if="booking.square_order_id"
                class="mt-1 text-dimmed"
              >
                Square order {{ booking.square_order_id }}
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
