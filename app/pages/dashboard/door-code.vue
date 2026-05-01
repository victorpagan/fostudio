<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

type DoorCodeState = {
  doorCode: string | null
  doorCodeUpdatedAt: string | null
  canRequestChange: boolean
  cooldownEndsAt: string | null
  latestRequest: {
    id: string
    status: string | null
    requestedAt: string
    resolvedAt: string | null
  } | null
}

const toast = useToast()
const dashboardHydrated = ref(false)
const doorCodeRequestLoading = ref(false)

const { data: doorCodeState, pending, refresh } = await useAsyncData('dash:door-code', async () => {
  return await $fetch<DoorCodeState>('/api/membership/door-code')
})

onMounted(() => {
  dashboardHydrated.value = true
})

const hasPendingRequest = computed(() =>
  String(doorCodeState.value?.latestRequest?.status ?? '').toLowerCase() === 'pending'
)

function parseDate(value: string | null | undefined) {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function formatDateLabel(value: string | null | undefined) {
  const dt = parseDate(value)
  if (!dt) return null
  if (!dashboardHydrated.value) return dt.toISOString().slice(0, 10)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return maybe.data?.statusMessage ?? maybe.statusMessage ?? maybe.message ?? 'Unknown error'
}

async function requestDoorCodeChange() {
  if (doorCodeRequestLoading.value || !doorCodeState.value?.canRequestChange) return

  doorCodeRequestLoading.value = true
  try {
    await $fetch('/api/membership/door-code-request', { method: 'POST' })
    toast.add({
      title: 'Door code change requested',
      description: 'Your request was sent to the admin team for manual update.',
      color: 'success'
    })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not request code change',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    doorCodeRequestLoading.value = false
  }
}
</script>

<template>
  <DashboardPageScaffold
    panel-id="door-code"
    title="Door Code"
  >
    <template #right>
      <DashboardActionGroup
        :primary="{
          label: 'Book studio',
          to: '/dashboard/book',
          icon: 'i-lucide-calendar-plus'
        }"
        :secondary="[{
          label: 'Refresh',
          icon: 'i-lucide-refresh-cw',
          onSelect: () => { refresh() }
        }]"
      />
    </template>

    <div class="grid gap-4 xl:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
      <UCard>
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Account door code
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <span class="font-mono text-4xl font-semibold tracking-[0.18em]">
                <template v-if="pending && !doorCodeState?.doorCode">------</template>
                <template v-else>{{ doorCodeState?.doorCode ?? 'Not assigned' }}</template>
              </span>
              <UBadge
                v-if="hasPendingRequest"
                color="warning"
                variant="soft"
              >
                Change requested
              </UBadge>
            </div>
          </div>
          <UIcon
            name="i-lucide-key-round"
            class="size-8 text-dimmed"
          />
        </div>

        <p class="mt-4 text-sm text-dimmed">
          This is your account-level studio door code. It stays with your account as a member or guest and is only activated during eligible booking access windows.
        </p>

        <dl class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-default bg-elevated/45 p-3">
            <dt class="text-[11px] uppercase tracking-wide text-dimmed">
              Last updated
            </dt>
            <dd class="mt-1 text-sm font-medium">
              {{ formatDateLabel(doorCodeState?.doorCodeUpdatedAt) ?? 'Not available' }}
            </dd>
          </div>
          <div class="rounded-lg border border-default bg-elevated/45 p-3">
            <dt class="text-[11px] uppercase tracking-wide text-dimmed">
              Change request
            </dt>
            <dd class="mt-1 text-sm font-medium">
              <template v-if="hasPendingRequest">
                Pending admin update
              </template>
              <template v-else-if="doorCodeState?.canRequestChange">
                Available
              </template>
              <template v-else>
                Cooldown active
              </template>
            </dd>
          </div>
        </dl>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <UButton
            color="neutral"
            variant="soft"
            :loading="doorCodeRequestLoading"
            :disabled="!doorCodeState?.canRequestChange || doorCodeRequestLoading"
            @click="requestDoorCodeChange"
          >
            Request code change
          </UButton>
          <span
            v-if="doorCodeState?.cooldownEndsAt && !doorCodeState?.canRequestChange"
            class="text-xs text-dimmed"
          >
            Next request: {{ formatDateLabel(doorCodeState.cooldownEndsAt) ?? doorCodeState.cooldownEndsAt }}
          </span>
        </div>
      </UCard>

      <UCard>
        <div class="text-xs text-dimmed uppercase tracking-wide">
          How access works
        </div>
        <div class="mt-3 space-y-3 text-sm text-dimmed">
          <p>
            The code is unique to your account, but the lock only accepts it during approved booking windows.
          </p>
          <p>
            Admins review manual code-change requests. Requests are limited to once every 30 days.
          </p>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            to="/dashboard/book"
            size="sm"
          >
            Book studio
          </UButton>
          <UButton
            to="/dashboard/profile"
            size="sm"
            color="neutral"
            variant="soft"
          >
            Review profile
          </UButton>
        </div>
      </UCard>
    </div>
  </DashboardPageScaffold>
</template>
