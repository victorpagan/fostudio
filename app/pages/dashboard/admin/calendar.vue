<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type CalendarSettings = {
  peakDays: number[]
  peakStartHour: number
  peakEndHour: number
  guestPeakMultiplier: number
  guestBookingRatePerCreditCents: number
  guestBookingWindowDays: number
  guestBookingStartHour: number
  guestBookingEndHour: number
  guestMinBookingHours: number
  guestBookingIncrementMinutes: number
  guestCreditExpiryDays: number
  guestPendingPaymentHoldMinutes: number
  standbyEnabled: boolean
  standbyMinOpenSlotHours: number
  standbyDiscountMultiplier: number
  memberStandbyStartHour: number
  memberStandbyWindowHours: number
  guestStandbyWindowHours: number
  memberRescheduleNoticeHours: number
}

type PeakDayOption = {
  label: string
  value: number
}

const toast = useToast()
const savingSettings = ref(false)

const calendarSettings = reactive<CalendarSettings>({
  peakDays: [1, 2, 3, 4],
  peakStartHour: 11,
  peakEndHour: 16,
  guestPeakMultiplier: 2.5,
  guestBookingRatePerCreditCents: 3500,
  guestBookingWindowDays: 20,
  guestBookingStartHour: 11,
  guestBookingEndHour: 19,
  guestMinBookingHours: 2,
  guestBookingIncrementMinutes: 60,
  guestCreditExpiryDays: 30,
  guestPendingPaymentHoldMinutes: 15,
  standbyEnabled: true,
  standbyMinOpenSlotHours: 4,
  standbyDiscountMultiplier: 0.5,
  memberStandbyStartHour: 8,
  memberStandbyWindowHours: 10,
  guestStandbyWindowHours: 6,
  memberRescheduleNoticeHours: 24
})

const peakDayItems: PeakDayOption[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 7 }
]

const selectedPeakDays = computed<PeakDayOption[]>({
  get() {
    return peakDayItems.filter(item => calendarSettings.peakDays.includes(item.value))
  },
  set(value) {
    calendarSettings.peakDays = (value ?? []).map(item => item.value)
  }
})

const guestBookingRatePerCreditDollars = computed<number>({
  get() {
    const cents = Number(calendarSettings.guestBookingRatePerCreditCents ?? 0)
    if (!Number.isFinite(cents)) return 0
    return cents / 100
  },
  set(value) {
    const normalized = Number(value)
    if (!Number.isFinite(normalized)) return
    calendarSettings.guestBookingRatePerCreditCents = Math.max(100, Math.round(normalized * 100))
  }
})

const { pending, refresh } = await useAsyncData('admin:calendar:settings', async () => {
  const res = await $fetch<{ settings: CalendarSettings }>('/api/admin/calendar/settings')
  calendarSettings.peakDays = Array.isArray(res.settings.peakDays) ? res.settings.peakDays : [1, 2, 3, 4]
  calendarSettings.peakStartHour = Number(res.settings.peakStartHour ?? 11)
  calendarSettings.peakEndHour = Number(res.settings.peakEndHour ?? 16)
  calendarSettings.guestPeakMultiplier = Number(res.settings.guestPeakMultiplier ?? 2.5)
  calendarSettings.guestBookingRatePerCreditCents = Number(res.settings.guestBookingRatePerCreditCents ?? 3500)
  calendarSettings.guestBookingWindowDays = Number(res.settings.guestBookingWindowDays ?? 20)
  calendarSettings.guestBookingStartHour = Number(res.settings.guestBookingStartHour ?? 11)
  calendarSettings.guestBookingEndHour = Number(res.settings.guestBookingEndHour ?? 19)
  calendarSettings.guestMinBookingHours = Number(res.settings.guestMinBookingHours ?? 2)
  calendarSettings.guestBookingIncrementMinutes = Number(res.settings.guestBookingIncrementMinutes ?? 60)
  calendarSettings.guestCreditExpiryDays = Number(res.settings.guestCreditExpiryDays ?? 30)
  calendarSettings.guestPendingPaymentHoldMinutes = Number(res.settings.guestPendingPaymentHoldMinutes ?? 15)
  calendarSettings.standbyEnabled = Boolean(res.settings.standbyEnabled ?? true)
  calendarSettings.standbyMinOpenSlotHours = Number(res.settings.standbyMinOpenSlotHours ?? 4)
  calendarSettings.standbyDiscountMultiplier = Number(res.settings.standbyDiscountMultiplier ?? 0.5)
  calendarSettings.memberStandbyStartHour = Number(res.settings.memberStandbyStartHour ?? 8)
  calendarSettings.memberStandbyWindowHours = Number(res.settings.memberStandbyWindowHours ?? 10)
  calendarSettings.guestStandbyWindowHours = Number(res.settings.guestStandbyWindowHours ?? 6)
  calendarSettings.memberRescheduleNoticeHours = Number(res.settings.memberRescheduleNoticeHours ?? 24)
  return res.settings
})

function formatHourLabel(value: number) {
  const normalized = Math.max(0, Math.min(23, Math.round(Number(value) || 0)))
  const period = normalized >= 12 ? 'PM' : 'AM'
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12
  return `${hour12}:00 ${period}`
}

const calendarPolicySummary = computed(() => {
  const uniquePeakDays = [...new Set(calendarSettings.peakDays)]
    .map(value => Math.round(Number(value) || 0))
    .filter(value => value >= 1 && value <= 7)
    .sort((a, b) => a - b)
  const peakDayLabel = uniquePeakDays.length
    ? uniquePeakDays.map(day => peakDayItems.find(item => item.value === day)?.label ?? String(day)).join(', ')
    : 'None'

  return {
    peakDayLabel,
    peakWindowLabel: `${formatHourLabel(calendarSettings.peakStartHour)} to ${formatHourLabel(calendarSettings.peakEndHour)}`,
    guestRateLabel: `$${(Math.max(0, Number(calendarSettings.guestBookingRatePerCreditCents) || 0) / 100).toFixed(2)} per credit`,
    guestWindowLabel: `${Math.max(1, Math.round(Number(calendarSettings.guestBookingWindowDays) || 1))} day booking window`,
    guestHoursLabel: `${formatHourLabel(calendarSettings.guestBookingStartHour)} to ${formatHourLabel(calendarSettings.guestBookingEndHour)}`,
    guestMinimumLabel: `${calendarSettings.guestMinBookingHours}h minimum · ${calendarSettings.guestBookingIncrementMinutes}m increments`,
    guestExpiryLabel: `${calendarSettings.guestCreditExpiryDays} day credit expiry`,
    standbyLabel: calendarSettings.standbyEnabled
      ? `${calendarSettings.standbyMinOpenSlotHours}h minimum · ${Math.round(calendarSettings.standbyDiscountMultiplier * 100)}% rate`
      : 'Disabled',
    memberNoticeLabel: `${Math.max(1, Math.round(Number(calendarSettings.memberRescheduleNoticeHours) || 1))} hour notice`
  }
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function saveCalendarSettings() {
  savingSettings.value = true
  try {
    await $fetch('/api/admin/calendar/settings.upsert', {
      method: 'POST',
      body: {
        peakDays: calendarSettings.peakDays,
        peakStartHour: calendarSettings.peakStartHour,
        peakEndHour: calendarSettings.peakEndHour,
        guestPeakMultiplier: calendarSettings.guestPeakMultiplier,
        guestBookingRatePerCreditCents: calendarSettings.guestBookingRatePerCreditCents,
        guestBookingWindowDays: calendarSettings.guestBookingWindowDays,
        guestBookingStartHour: calendarSettings.guestBookingStartHour,
        guestBookingEndHour: calendarSettings.guestBookingEndHour,
        guestMinBookingHours: calendarSettings.guestMinBookingHours,
        guestBookingIncrementMinutes: calendarSettings.guestBookingIncrementMinutes,
        guestCreditExpiryDays: calendarSettings.guestCreditExpiryDays,
        guestPendingPaymentHoldMinutes: calendarSettings.guestPendingPaymentHoldMinutes,
        standbyEnabled: calendarSettings.standbyEnabled,
        standbyMinOpenSlotHours: calendarSettings.standbyMinOpenSlotHours,
        standbyDiscountMultiplier: calendarSettings.standbyDiscountMultiplier,
        memberStandbyStartHour: calendarSettings.memberStandbyStartHour,
        memberStandbyWindowHours: calendarSettings.memberStandbyWindowHours,
        guestStandbyWindowHours: calendarSettings.guestStandbyWindowHours,
        memberRescheduleNoticeHours: calendarSettings.memberRescheduleNoticeHours
      }
    })
    toast.add({ title: 'Calendar settings saved' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save calendar settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    savingSettings.value = false
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="admin-calendar-settings"
    title="Calendar Settings"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'Save settings',
          icon: 'i-lucide-save',
          loading: savingSettings,
          onSelect: () => { void saveCalendarSettings() }
        }"
        :secondary="[
          {
            label: 'Refresh',
            icon: 'i-lucide-refresh-cw',
            color: 'neutral',
            variant: 'soft',
            loading: pending,
            onSelect: () => { void refresh() }
          }
        ]"
      />
    </template>
    <UAlert
      color="warning"
      variant="soft"
      icon="i-lucide-calendar-clock"
      title="Calendar controls"
      description="Configure LA peak windows, guest behavior, and member reschedule policy."
    />

    <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="space-y-4">
        <UCard>
          <div class="space-y-4">
            <div>
              <div class="font-medium">
                Peak window and pricing
              </div>
              <div class="text-sm text-dimmed">
                Defines when peak multipliers apply for guest booking estimates.
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Peak days">
                <USelectMenu
                  v-model="selectedPeakDays"
                  multiple
                  :items="peakDayItems"
                />
              </UFormField>
              <UFormField label="Guest peak multiplier">
                <UInput
                  v-model.number="calendarSettings.guestPeakMultiplier"
                  type="number"
                  step="0.25"
                  min="1"
                />
              </UFormField>
              <UFormField label="Peak start hour (LA)">
                <UInput
                  v-model.number="calendarSettings.peakStartHour"
                  type="number"
                  min="0"
                  max="23"
                />
              </UFormField>
              <UFormField label="Peak end hour (LA)">
                <UInput
                  v-model.number="calendarSettings.peakEndHour"
                  type="number"
                  min="1"
                  max="24"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div>
              <div class="font-medium">
                Guest access window
              </div>
              <div class="text-sm text-dimmed">
                Controls guest visibility, hourly access range, and base credit pricing.
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Guest rate per credit ($)">
                <UInput
                  v-model.number="guestBookingRatePerCreditDollars"
                  type="number"
                  min="1"
                  step="0.01"
                />
              </UFormField>
              <UFormField label="Guest booking window (days)">
                <UInput
                  v-model.number="calendarSettings.guestBookingWindowDays"
                  type="number"
                  min="1"
                  max="60"
                />
              </UFormField>
              <UFormField label="Guest start hour (LA)">
                <UInput
                  v-model.number="calendarSettings.guestBookingStartHour"
                  type="number"
                  min="0"
                  max="23"
                />
              </UFormField>
              <UFormField label="Guest end hour (LA)">
                <UInput
                  v-model.number="calendarSettings.guestBookingEndHour"
                  type="number"
                  min="1"
                  max="24"
                />
              </UFormField>
              <UFormField label="Guest minimum booking (hours)">
                <UInput
                  v-model.number="calendarSettings.guestMinBookingHours"
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                />
              </UFormField>
              <UFormField label="Guest increment (minutes)">
                <UInput
                  v-model.number="calendarSettings.guestBookingIncrementMinutes"
                  type="number"
                  min="15"
                  max="240"
                  step="15"
                />
              </UFormField>
              <UFormField label="Guest credit expiry (days)">
                <UInput
                  v-model.number="calendarSettings.guestCreditExpiryDays"
                  type="number"
                  min="1"
                  max="365"
                />
              </UFormField>
              <UFormField label="Payment reservation (minutes)">
                <UInput
                  v-model.number="calendarSettings.guestPendingPaymentHoldMinutes"
                  type="number"
                  min="1"
                  max="120"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-medium">
                  Standby booking
                </div>
                <div class="text-sm text-dimmed">
                  Same-day discounted bookings for qualifying open slots.
                </div>
              </div>
              <USwitch
                v-model="calendarSettings.standbyEnabled"
                label="Enabled"
              />
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Minimum open slot (hours)">
                <UInput
                  v-model.number="calendarSettings.standbyMinOpenSlotHours"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                />
              </UFormField>
              <UFormField label="Standby multiplier">
                <UInput
                  v-model.number="calendarSettings.standbyDiscountMultiplier"
                  type="number"
                  min="0.05"
                  max="1"
                  step="0.05"
                />
              </UFormField>
              <UFormField label="Member standby start hour">
                <UInput
                  v-model.number="calendarSettings.memberStandbyStartHour"
                  type="number"
                  min="0"
                  max="23"
                />
              </UFormField>
              <UFormField label="Member standby reach (hours)">
                <UInput
                  v-model.number="calendarSettings.memberStandbyWindowHours"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                />
              </UFormField>
              <UFormField label="Guest standby reach (hours)">
                <UInput
                  v-model.number="calendarSettings.guestStandbyWindowHours"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div>
              <div class="font-medium">
                Member reschedule policy
              </div>
              <div class="text-sm text-dimmed">
                Sets required lead time before members can reschedule existing bookings.
              </div>
            </div>

            <UFormField
              label="Member reschedule notice (hours)"
              class="max-w-sm"
            >
              <UInput
                v-model.number="calendarSettings.memberRescheduleNoticeHours"
                type="number"
                min="1"
                max="240"
              />
            </UFormField>
          </div>
        </UCard>
      </div>

      <aside class="space-y-4 xl:sticky xl:top-4 self-start">
        <UCard>
          <div class="text-sm font-medium">
            Policy summary
          </div>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Peak days
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.peakDayLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Peak window
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.peakWindowLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Guest pricing
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.guestRateLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Guest booking window
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.guestWindowLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Guest access hours
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.guestHoursLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Guest duration
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.guestMinimumLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Guest expiry
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.guestExpiryLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Standby
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.standbyLabel }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-3">
              <dt class="text-dimmed">
                Member notice
              </dt>
              <dd class="font-medium text-right">
                {{ calendarPolicySummary.memberNoticeLabel }}
              </dd>
            </div>
          </dl>
        </UCard>
      </aside>
    </div>
  </DashboardPageScaffold>
</template>
