<script setup lang="ts">
import type { HandbookPayload, HandbookTier } from '~~/server/utils/admin/studioHandbook'

definePageMeta({ middleware: ['admin'] })

const toast = useToast()
const loading = ref(false)
const handbook = ref<HandbookPayload | null>(null)
const search = ref('')
const activeTab = ref('quick')

const tabs = [
  { label: 'Quick Reference', value: 'quick', icon: 'i-lucide-list-checks' },
  { label: 'Rates', value: 'rates', icon: 'i-lucide-badge-dollar-sign' },
  { label: 'Policies', value: 'policies', icon: 'i-lucide-clipboard-check' },
  { label: 'Customer Flows', value: 'flows', icon: 'i-lucide-route' },
  { label: 'Door Access', value: 'door', icon: 'i-lucide-key-round' },
  { label: 'Equipment', value: 'equipment', icon: 'i-lucide-camera' },
  { label: 'Call Answers', value: 'answers', icon: 'i-lucide-message-circle-question' }
]

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function loadHandbook() {
  loading.value = true
  try {
    handbook.value = await $fetch<HandbookPayload>('/api/admin/studio-handbook')
  } catch (error: unknown) {
    toast.add({
      title: 'Could not load handbook',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadHandbook()
})

const normalizedSearch = computed(() => search.value.trim().toLowerCase())

function matches(...parts: Array<unknown>) {
  const query = normalizedSearch.value
  if (!query) return true
  return parts
    .flatMap(part => Array.isArray(part) ? part : [part])
    .filter(part => part !== null && part !== undefined)
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`
}

function titleCase(value: string) {
  return String(value ?? '')
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function generatedAtLabel(value: string | null | undefined) {
  if (!value) return 'Not generated yet'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function sourceColor(status: string) {
  if (status === 'live') return 'success'
  if (status === 'fallback') return 'warning'
  return 'error'
}

function tierPlanLines(tier: HandbookTier) {
  const visible = tier.variations.filter(variation => variation.active && variation.visible)
  if (!visible.length) return ['No active public Square variation']
  return visible.map((variation) => {
    const discount = variation.discountLabel ? `, ${variation.discountLabel}` : ''
    return `${titleCase(variation.cadence)}: ${money(variation.priceCents)} (${variation.creditsPerMonth} cr/mo${discount})`
  })
}

const filteredTiers = computed(() => {
  const rows = handbook.value?.rates.tiers ?? []
  return rows.filter(tier => matches(
    tier.displayName,
    tier.description,
    tier.id,
    tierPlanLines(tier),
    tier.bookingWindowDays,
    tier.peakMultiplier
  ))
})

const filteredCreditOptions = computed(() => {
  const rows = handbook.value?.rates.creditOptions ?? []
  return rows.filter(option => matches(option.label, option.key, option.description, option.credits, option.basePriceCents))
})

const filteredReferralRules = computed(() => {
  const rows = handbook.value?.rates.referralRules ?? []
  return rows.filter(rule => matches(rule.tierId, rule.cadence, rule.referrerCredits, rule.referredCredits))
})

const filteredFlows = computed(() => {
  const rows = handbook.value?.customerFlows ?? []
  return rows.filter(flow => matches(flow.title, flow.customerSafe, flow.internal))
})

const filteredAnswers = computed(() => {
  const rows = handbook.value?.callAnswers ?? []
  return rows.filter(answer => matches(answer.question, answer.customerSafeAnswer, answer.internalNote, answer.tags))
})

const filteredEquipment = computed(() => {
  const equipment = handbook.value?.equipment
  if (!equipment) return null
  if (!normalizedSearch.value) return equipment
  const found = matches(
    equipment.heroTitle,
    equipment.heroBody,
    equipment.includedHeader,
    equipment.includedGear,
    equipment.equipmentListHeader,
    equipment.equipmentList,
    equipment.guidelinesHeader,
    equipment.sessionGuidelines
  )
  return found ? equipment : null
})

function downloadPdf() {
  window.open('/api/admin/studio-handbook.pdf', '_blank', 'noopener')
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-studio-handbook"
    title="Studio Handbook"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'Download PDF',
          icon: 'i-lucide-download',
          onSelect: downloadPdf
        }"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            loading,
            onSelect: () => { void loadHandbook() }
          }
        ]"
      />
    </template>

    <AdminOpsShell>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <UCard class="admin-panel-card border-0">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="max-w-3xl space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  Internal only
                </UBadge>
                <UBadge
                  color="primary"
                  variant="soft"
                >
                  Live Supabase backed
                </UBadge>
              </div>
              <div>
                <h2 class="text-2xl font-semibold tracking-tight">
                  FO Studio Ops Handbook
                </h2>
                <p class="mt-1 text-sm text-dimmed">
                  Staff reference for rates, policies, customer calls, door access, and equipment. Customer-safe wording is separated from internal implementation notes.
                </p>
              </div>
            </div>

            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search handbook"
              class="w-full lg:w-80"
            />
          </div>
        </UCard>

        <UCard class="admin-panel-card border-0">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">
                  Source Freshness
                </div>
                <div class="text-xs text-dimmed">
                  {{ generatedAtLabel(handbook?.generatedAt) }}
                </div>
              </div>
              <UIcon
                name="i-lucide-database-zap"
                class="size-5 text-dimmed"
              />
            </div>
          </template>

          <DashboardSectionState
            v-if="loading && !handbook"
            state="loading"
            title="Loading handbook"
            description="Collecting live rates, settings, equipment, and access status."
          />
          <div
            v-else
            class="space-y-2"
          >
            <div
              v-for="source in handbook?.sources ?? []"
              :key="`${source.label}-${source.status}`"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">
                    {{ source.label }}
                  </div>
                  <div class="mt-1 line-clamp-2 text-xs text-dimmed">
                    {{ source.detail }}
                  </div>
                </div>
                <UBadge
                  :color="sourceColor(source.status)"
                  variant="soft"
                  size="xs"
                >
                  {{ source.status }}
                </UBadge>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <UCard class="admin-panel-card border-0">
        <UTabs
          v-model="activeTab"
          :items="tabs"
          :content="false"
          color="primary"
          variant="pill"
          class="w-full"
        />
      </UCard>

      <DashboardSectionState
        v-if="!loading && !handbook"
        state="empty"
        title="Handbook unavailable"
        description="Refresh to load current studio handbook data."
      />

      <div
        v-else-if="handbook"
        class="space-y-4"
      >
        <div
          v-if="activeTab === 'quick'"
          class="grid gap-4 lg:grid-cols-2"
        >
          <UCard class="admin-panel-card border-0">
            <template #header>
              <div>
                <div class="font-medium">
                  Customer-Safe Quick Answers
                </div>
                <div class="text-xs text-dimmed">
                  Safe to use during calls or email replies.
                </div>
              </div>
            </template>
            <ul class="space-y-3 text-sm">
              <li
                v-for="item in handbook.quickReference.customerSafe.filter(value => matches(value))"
                :key="item"
                class="rounded-lg bg-elevated/50 p-3"
              >
                {{ item }}
              </li>
            </ul>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="font-medium">
                    Internal Notes
                  </div>
                  <div class="text-xs text-dimmed">
                    Do not quote implementation details to customers.
                  </div>
                </div>
                <UBadge
                  color="warning"
                  variant="soft"
                >
                  Internal only
                </UBadge>
              </div>
            </template>
            <ul class="space-y-3 text-sm">
              <li
                v-for="item in handbook.quickReference.internalNotes.filter(value => matches(value))"
                :key="item"
                class="rounded-lg border border-default p-3"
              >
                {{ item }}
              </li>
            </ul>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'rates'"
          class="space-y-4"
        >
          <UCard class="admin-panel-card border-0">
            <template #header>
              <div>
                <div class="font-medium">
                  Membership Rates + Tiers
                </div>
                <div class="text-xs text-dimmed">
                  Live tiers and active Square variations.
                </div>
              </div>
            </template>
            <div class="grid gap-3 lg:grid-cols-2">
              <div
                v-for="tier in filteredTiers"
                :key="tier.id"
                class="rounded-xl border border-default p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-semibold">
                      {{ tier.displayName }}
                    </div>
                    <p
                      v-if="tier.description"
                      class="mt-1 text-sm text-dimmed"
                    >
                      {{ tier.description }}
                    </p>
                  </div>
                  <div class="flex flex-wrap justify-end gap-1">
                    <UBadge
                      :color="tier.active ? 'success' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ tier.active ? 'Active' : 'Inactive' }}
                    </UBadge>
                    <UBadge
                      :color="tier.visible ? 'primary' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ tier.visible ? 'Visible' : 'Hidden' }}
                    </UBadge>
                  </div>
                </div>
                <div class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div
                    v-for="line in tierPlanLines(tier)"
                    :key="line"
                    class="rounded-lg bg-elevated/50 p-2"
                  >
                    {{ line }}
                  </div>
                </div>
                <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-dimmed">
                      Booking Window
                    </dt>
                    <dd>{{ tier.bookingWindowDays }} days</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-dimmed">
                      Peak Multiplier
                    </dt>
                    <dd>{{ tier.peakMultiplier }}x</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-dimmed">
                      Bank Cap
                    </dt>
                    <dd>{{ tier.maxBank ?? 'n/a' }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-dimmed">
                      Holds
                    </dt>
                    <dd>{{ tier.holdsIncluded }} included / {{ tier.activeHoldCap }} active</dd>
                  </div>
                </dl>
              </div>
            </div>
          </UCard>

          <div class="grid gap-4 lg:grid-cols-2">
            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Credit Top-Ups
                </div>
              </template>
              <div class="space-y-2">
                <div
                  v-for="option in filteredCreditOptions"
                  :key="option.key"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="font-medium">
                        {{ option.label }}
                      </div>
                      <div class="text-sm text-dimmed">
                        {{ option.credits }} credits - {{ money(option.salePriceCents ?? option.basePriceCents) }}
                      </div>
                      <p
                        v-if="option.description"
                        class="mt-1 text-xs text-dimmed"
                      >
                        {{ option.description }}
                      </p>
                    </div>
                    <UBadge
                      :color="option.active ? 'success' : 'neutral'"
                      variant="soft"
                      size="xs"
                    >
                      {{ option.active ? 'Active' : 'Inactive' }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard class="admin-panel-card border-0">
              <template #header>
                <div class="font-medium">
                  Referral Rewards
                </div>
              </template>
              <div class="space-y-2">
                <div
                  v-for="rule in filteredReferralRules"
                  :key="`${rule.tierId}-${rule.cadence}`"
                  class="rounded-lg border border-default p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="font-medium">
                        {{ rule.tierId }} - {{ titleCase(rule.cadence) }}
                      </div>
                      <div class="text-sm text-dimmed">
                        Referrer {{ rule.referrerCredits }} cr - New member {{ rule.referredCredits }} cr
                      </div>
                    </div>
                    <UBadge
                      color="primary"
                      variant="soft"
                      size="xs"
                    >
                      Referral
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <div
          v-else-if="activeTab === 'policies'"
          class="grid gap-4 lg:grid-cols-2"
        >
          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Guest Booking Policies
              </div>
            </template>
            <dl class="grid gap-3 text-sm sm:grid-cols-2">
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Booking window
                </dt>
                <dd>{{ handbook.policies.guest.bookingWindowDays }} days</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Hours
                </dt>
                <dd>{{ handbook.policies.guest.hoursLabel }}</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Minimum
                </dt>
                <dd>{{ handbook.policies.guest.minBookingHours }} hours</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Increment
                </dt>
                <dd>{{ handbook.policies.guest.bookingIncrementMinutes }} minutes</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Credit rate
                </dt>
                <dd>{{ money(handbook.policies.guest.ratePerCreditCents) }} / credit</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Credit expiry
                </dt>
                <dd>{{ handbook.policies.guest.creditExpiryDays }} days</dd>
              </div>
            </dl>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="font-medium">
                Standby, Workshop, Peak + Holds
              </div>
            </template>
            <dl class="grid gap-3 text-sm">
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Standby
                </dt>
                <dd>
                  {{ handbook.policies.standby.enabled ? 'Enabled' : 'Disabled' }} - {{ handbook.policies.standby.minOpenSlotHours }}h open slot minimum - {{ handbook.policies.standby.discountMultiplier }}x discount
                </dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Member standby window
                </dt>
                <dd>{{ handbook.policies.standby.memberWindowLabel }}</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Peak
                </dt>
                <dd>{{ handbook.policies.peak.daysLabel }} - {{ handbook.policies.peak.windowLabel }}</dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Holds
                </dt>
                <dd>
                  {{ handbook.policies.holds.holdCreditCost }} credits - {{ handbook.policies.holds.minHoldBookingHours }}h minimum - ends after {{ handbook.policies.holds.minEndLabel }}
                </dd>
              </div>
              <div class="rounded-lg bg-elevated/50 p-3">
                <dt class="text-xs uppercase tracking-wide text-dimmed">
                  Workshop
                </dt>
                <dd>{{ handbook.policies.credits.workshopCreditMultiplier }}x multiplier - liability acknowledgement required</dd>
              </div>
            </dl>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'flows'"
          class="grid gap-4 lg:grid-cols-2"
        >
          <UCard
            v-for="flow in filteredFlows"
            :key="flow.title"
            class="admin-panel-card border-0"
          >
            <template #header>
              <div class="font-medium">
                {{ flow.title }}
              </div>
            </template>
            <div class="space-y-4 text-sm">
              <div class="rounded-lg bg-elevated/50 p-3">
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Customer-safe answer
                </div>
                <p class="mt-1">
                  {{ flow.customerSafe }}
                </p>
              </div>
              <div class="rounded-lg border border-warning/30 p-3">
                <div class="text-xs uppercase tracking-wide text-warning">
                  Internal note
                </div>
                <p class="mt-1">
                  {{ flow.internal }}
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <div
          v-else-if="activeTab === 'door'"
          class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <UCard class="admin-panel-card border-0">
            <template #header>
              <div>
                <div class="font-medium">
                  Door Access Overview
                </div>
                <div class="text-xs text-dimmed">
                  Customer-facing explanation plus internal technical appendix.
                </div>
              </div>
            </template>
            <div class="space-y-3 text-sm">
              <div
                v-for="item in handbook.doorAccess.overview.filter(value => matches(value))"
                :key="item"
                class="rounded-lg bg-elevated/50 p-3"
              >
                {{ item }}
              </div>
            </div>
          </UCard>

          <UCard class="admin-panel-card border-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div class="font-medium">
                  Technical Status
                </div>
                <UBadge
                  color="warning"
                  variant="soft"
                >
                  Internal only
                </UBadge>
              </div>
            </template>
            <dl class="grid gap-2 text-sm">
              <div class="flex justify-between gap-3 rounded-lg border border-default p-2">
                <dt class="text-dimmed">
                  Member slots
                </dt>
                <dd>{{ handbook.doorAccess.technical.slotRanges.memberStart }}-{{ handbook.doorAccess.technical.slotRanges.memberEnd }}</dd>
              </div>
              <div class="flex justify-between gap-3 rounded-lg border border-default p-2">
                <dt class="text-dimmed">
                  Guest slots
                </dt>
                <dd>{{ handbook.doorAccess.technical.slotRanges.guestStart }}-{{ handbook.doorAccess.technical.slotRanges.guestEnd }}</dd>
              </div>
              <div
                v-for="(value, key) in handbook.doorAccess.technical.status"
                :key="key"
                class="flex justify-between gap-3 rounded-lg border border-default p-2"
              >
                <dt class="text-dimmed">
                  {{ titleCase(String(key)) }}
                </dt>
                <dd>{{ value }}</dd>
              </div>
            </dl>
          </UCard>

          <UCard class="admin-panel-card border-0 xl:col-span-2">
            <template #header>
              <div class="font-medium">
                Technical Appendix Notes
              </div>
            </template>
            <div class="grid gap-3 text-sm lg:grid-cols-2">
              <div
                v-for="note in handbook.doorAccess.technical.notes.filter(value => matches(value))"
                :key="note"
                class="rounded-lg border border-default p-3"
              >
                {{ note }}
              </div>
            </div>
          </UCard>
        </div>

        <div v-else-if="activeTab === 'equipment'">
          <UCard
            v-if="filteredEquipment"
            class="admin-panel-card border-0"
          >
            <template #header>
              <div>
                <div class="font-medium">
                  {{ filteredEquipment.heroTitle }}
                </div>
                <div class="text-xs text-dimmed">
                  From public equipment content, included here for staff reference.
                </div>
              </div>
            </template>
            <div class="space-y-6 text-sm">
              <p class="max-w-4xl text-dimmed">
                {{ filteredEquipment.heroBody }}
              </p>
              <section>
                <h3 class="font-medium">
                  {{ filteredEquipment.includedHeader }}
                </h3>
                <div class="mt-3 grid gap-2 lg:grid-cols-3">
                  <div
                    v-for="item in filteredEquipment.includedGear"
                    :key="item"
                    class="rounded-lg bg-elevated/50 p-3"
                  >
                    {{ item }}
                  </div>
                </div>
              </section>
              <section>
                <h3 class="font-medium">
                  {{ filteredEquipment.equipmentListHeader }}
                </h3>
                <div class="mt-3 grid gap-2 lg:grid-cols-2">
                  <div
                    v-for="item in filteredEquipment.equipmentList"
                    :key="item"
                    class="rounded-lg border border-default p-3"
                  >
                    {{ item }}
                  </div>
                </div>
              </section>
              <section>
                <h3 class="font-medium">
                  {{ filteredEquipment.guidelinesHeader }}
                </h3>
                <div class="mt-3 grid gap-2 lg:grid-cols-3">
                  <div
                    v-for="item in filteredEquipment.sessionGuidelines"
                    :key="item"
                    class="rounded-lg border border-default p-3"
                  >
                    {{ item }}
                  </div>
                </div>
              </section>
            </div>
          </UCard>
          <DashboardSectionState
            v-else
            state="empty"
            title="No equipment matches"
            description="Clear search to show the equipment list."
          />
        </div>

        <div
          v-else-if="activeTab === 'answers'"
          class="grid gap-4 lg:grid-cols-2"
        >
          <UCard
            v-for="answer in filteredAnswers"
            :key="answer.question"
            class="admin-panel-card border-0"
          >
            <template #header>
              <div>
                <div class="font-medium">
                  {{ answer.question }}
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <UBadge
                    v-for="tag in answer.tags"
                    :key="tag"
                    color="neutral"
                    variant="soft"
                    size="xs"
                  >
                    {{ tag }}
                  </UBadge>
                </div>
              </div>
            </template>
            <div class="space-y-4 text-sm">
              <div class="rounded-lg bg-elevated/50 p-3">
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Customer-safe answer
                </div>
                <p class="mt-1">
                  {{ answer.customerSafeAnswer }}
                </p>
              </div>
              <div class="rounded-lg border border-warning/30 p-3">
                <div class="text-xs uppercase tracking-wide text-warning">
                  Internal note / escalate if
                </div>
                <p class="mt-1">
                  {{ answer.internalNote }}
                </p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </AdminOpsShell>
  </DashboardPageScaffold>
</template>
