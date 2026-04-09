<script setup lang="ts">
definePageMeta({ auth: false })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

const checkoutToken = computed(() => {
  const value = route.query.checkout
  return typeof value === 'string' ? value : null
})

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/membership'
})

const successPath = computed(() => {
  const query = new URLSearchParams()
  if (checkoutToken.value) query.set('checkout', checkoutToken.value)
  query.set('returnTo', returnTo.value)
  return `/checkout/success?${query.toString()}`
})

const loginTo = computed(() => `/login?returnTo=${encodeURIComponent(successPath.value)}`)
const isTest = computed(() => route.query.test === '1')

const status = ref<string>('pending')
const claimLoading = ref(false)
const claimError = ref<string | null>(null)
const claimHint = ref<string | null>(null)
const claimedMembershipId = ref<string | null>(null)
const claimNewCustomer = ref<boolean | null>(null)
const claimComplete = ref(false)
const activationReminderTriggered = ref(false)
const bootstrapAttempted = ref(false)
const conversionTracked = ref(false)

let timer: ReturnType<typeof setInterval> | null = null
let claimRetryTimer: ReturnType<typeof setTimeout> | null = null

const GOOGLE_ADS_MEMBERSHIP_PURCHASE_SEND_TO = 'AW-18068877892/iTzKCP-r05ccEMTk9KdD'
const GOOGLE_ADS_CONVERSION_STORAGE_KEY_PREFIX = 'fo:ads-conversion:membership:'

type WindowWithGoogleAds = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  __foGoogleAdsMembershipPurchase?: (payload: {
    transaction_id?: string
    new_customer?: boolean
    event_callback?: () => void
    event_timeout?: number
  }) => boolean
}

useHead({
  script: [
    {
      key: 'google-ads-membership-conversion-helper',
      children: [
        'window.__foGoogleAdsMembershipPurchase = window.__foGoogleAdsMembershipPurchase || function(payload) {',
        '  if (typeof window === \'undefined\' || typeof window.gtag !== \'function\') return false;',
        '  var data = payload || {};',
        '  var eventPayload = {',
        `    'send_to': '${GOOGLE_ADS_MEMBERSHIP_PURCHASE_SEND_TO}',`,
        '    \'transaction_id\': data.transaction_id || \'\'',
        '  };',
        '  if (typeof data.new_customer === \'boolean\') eventPayload.new_customer = data.new_customer;',
        '  if (typeof data.event_callback === \'function\') eventPayload.event_callback = data.event_callback;',
        '  if (typeof data.event_timeout === \'number\') eventPayload.event_timeout = data.event_timeout;',
        '  window.gtag(\'event\', \'conversion\', eventPayload);',
        '  return true;',
        '};'
      ].join('\n')
    }
  ]
})

type ClaimErrorLike = {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}

const statusLabel = computed(() => {
  if (status.value === 'active') return 'Active'
  if (status.value === 'pending_checkout') return 'Activating'
  if (status.value === 'past_due') return 'Past due'
  if (status.value === 'canceled') return 'Canceled'
  if (status.value === 'completed') return 'Completed'
  return status.value
})

const statusColor = computed(() => {
  if (status.value === 'active') return 'success'
  if (status.value === 'pending_checkout') return 'warning'
  if (status.value === 'past_due' || status.value === 'canceled') return 'error'
  return 'neutral'
})

function startStatusPolling() {
  if (timer) clearInterval(timer)
  timer = setInterval(async () => {
    await pollLegacyMembershipStatus()
    if (status.value === 'active') {
      trackMembershipPurchaseConversion({
        membershipId: claimedMembershipId.value,
        newCustomer: claimNewCustomer.value
      })
      if (timer) clearInterval(timer)
      await navigateTo(returnTo.value)
    }
  }, 2500)
}

function scheduleClaimRetry() {
  if (claimRetryTimer) clearTimeout(claimRetryTimer)
  claimRetryTimer = setTimeout(() => {
    void claimCheckout()
  }, 2500)
}

function isRetryableClaimError(error: unknown) {
  const e = (error ?? {}) as ClaimErrorLike
  const statusCode = e.data?.statusCode ?? e.statusCode
  if (typeof statusCode === 'number' && [408, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true
  }

  const haystack = [
    e.data?.statusMessage,
    e.data?.message,
    e.statusMessage,
    e.message
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()

  return [
    '<no response>',
    'load failed',
    'fetch failed',
    'networkerror',
    'network error',
    'timeout',
    'timed out',
    'econnreset',
    'econnrefused',
    'etimedout',
    'eai_again',
    'enotfound'
  ].some(marker => haystack.includes(marker))
}

function conversionStorageKey(membershipId: string | null, checkout: string | null) {
  const target = (membershipId ?? checkout ?? '').trim()
  if (!target) return null
  return `${GOOGLE_ADS_CONVERSION_STORAGE_KEY_PREFIX}${target}`
}

function hasTrackedConversion(key: string) {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markTrackedConversion(key: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // no-op
  }
}

async function trackMembershipPurchaseConversion(input: { membershipId: string | null, newCustomer: boolean | null }) {
  if (isTest.value || conversionTracked.value) return

  const dedupeKey = conversionStorageKey(input.membershipId, checkoutToken.value)
  if (!dedupeKey) return
  if (hasTrackedConversion(dedupeKey)) {
    conversionTracked.value = true
    return
  }

  const transactionId = (input.membershipId ?? checkoutToken.value ?? '').trim()
  if (!transactionId) return

  if (typeof window === 'undefined') return
  const win = window as WindowWithGoogleAds

  if (typeof win.gtag !== 'function') {
    if (!Array.isArray(win.dataLayer)) {
      win.dataLayer = []
    }
    win.gtag = (...args: unknown[]) => {
      win.dataLayer?.push(args)
    }
  }

  const payload: {
    transaction_id: string
    new_customer?: boolean
    event_callback?: () => void
    event_timeout?: number
  } = {
    transaction_id: transactionId
  }
  if (typeof input.newCustomer === 'boolean') {
    payload.new_customer = input.newCustomer
  }

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }

    payload.event_callback = finish
    payload.event_timeout = 900
    const timeout = setTimeout(finish, 1000)
    payload.event_callback = () => {
      clearTimeout(timeout)
      finish()
    }

    const invoked = typeof win.__foGoogleAdsMembershipPurchase === 'function'
      ? win.__foGoogleAdsMembershipPurchase(payload)
      : false

    if (!invoked && typeof win.gtag === 'function') {
      win.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_MEMBERSHIP_PURCHASE_SEND_TO,
        transaction_id: payload.transaction_id,
        new_customer: payload.new_customer,
        event_callback: payload.event_callback,
        event_timeout: payload.event_timeout
      })
    }
  })

  markTrackedConversion(dedupeKey)
  conversionTracked.value = true
}

async function pollLegacyMembershipStatus() {
  if (!user.value) return

  const { data } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.value.sub)
    .maybeSingle()

  status.value = data?.status ?? (isTest.value ? 'active' : 'pending')
}

async function triggerActivationReminder() {
  if (!checkoutToken.value || activationReminderTriggered.value) return
  activationReminderTriggered.value = true
  try {
    await $fetch('/api/checkout/remind-activation', {
      method: 'POST',
      body: { token: checkoutToken.value }
    })
  } catch {
    // Best-effort notification only; no UI interruption.
  }
}

async function ensureBootstrap() {
  if (!user.value || bootstrapAttempted.value) return
  bootstrapAttempted.value = true

  try {
    await $fetch('/api/account/bootstrap', {
      method: 'POST',
      body: {
        email: user.value.email ?? undefined
      }
    })
  } catch {
    // Keep checkout claim flow resilient; claim may still succeed without bootstrap.
  }
}

async function claimCheckout() {
  if (!checkoutToken.value || !user.value) return

  claimLoading.value = true
  claimError.value = null

  try {
    await ensureBootstrap()

    const res = await $fetch<{
      ok: boolean
      pending?: boolean
      message?: string
      membershipId?: string
      membershipStatus: string
      returnTo?: string
      newCustomer?: boolean
    }>('/api/checkout/claim', {
      method: 'POST',
      body: { token: checkoutToken.value },
      timeout: 20000
    })

    status.value = res.membershipStatus || 'pending_checkout'
    claimHint.value = res.message ?? null
    if (res.membershipId) {
      claimedMembershipId.value = res.membershipId
    }
    if (typeof res.newCustomer === 'boolean') {
      claimNewCustomer.value = res.newCustomer
    }

    if (!res.ok && res.pending) {
      claimComplete.value = false
      claimError.value = null
      scheduleClaimRetry()
      return
    }

    if (!res.ok) {
      claimError.value = res.message ?? 'Could not finish account linking.'
      claimComplete.value = false
      return
    }

    claimComplete.value = true

    if (status.value === 'active') {
      trackMembershipPurchaseConversion({
        membershipId: claimedMembershipId.value,
        newCustomer: claimNewCustomer.value
      })
      await navigateTo(res.returnTo ?? returnTo.value)
    }
  } catch (error: unknown) {
    const e = error as ClaimErrorLike
    if (isRetryableClaimError(error)) {
      claimComplete.value = false
      claimError.value = null
      claimHint.value = 'Connection issue while finalizing membership. Retrying automatically.'
      scheduleClaimRetry()
      return
    }
    claimError.value = e.data?.statusMessage ?? e.statusMessage ?? e.message ?? 'Could not finish account linking.'
  } finally {
    claimLoading.value = false
  }
}

onMounted(async () => {
  if (checkoutToken.value) {
    if (user.value) {
      await ensureBootstrap()
      await claimCheckout()
      if (status.value !== 'active' && !claimError.value) {
        startStatusPolling()
      }
    } else {
      status.value = 'pending_checkout'
      await triggerActivationReminder()
      await navigateTo(loginTo.value)
    }
    return
  }

  if (!user.value) {
    await navigateTo(loginTo.value)
    return
  }

  await pollLegacyMembershipStatus()
  if (status.value === 'active') {
    await navigateTo(returnTo.value)
    return
  }

  startStatusPolling()
})

watch(() => user.value?.sub, async (nextUserId) => {
  if (checkoutToken.value && nextUserId && !claimLoading.value && !claimComplete.value) {
    await ensureBootstrap()
    await claimCheckout()
  }
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (claimRetryTimer) clearTimeout(claimRetryTimer)
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <section class="studio-grid overflow-hidden rounded-[2rem] border border-[color:var(--gruv-line)] px-5 py-6 sm:px-8 sm:py-8">
      <div class="mx-auto max-w-2xl space-y-6">
        <div class="max-w-3xl space-y-4">
          <span class="studio-kicker">Checkout complete</span>
          <h1 class="studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-7xl">
            <span v-if="isTest">Your test membership is active.</span>
            <span v-else>Setting up your account.</span>
          </h1>
          <p class="text-base leading-8 text-[color:var(--gruv-ink-2)] sm:text-lg">
            <span v-if="checkoutToken && !user">Redirecting to sign in so we can finish setup.</span>
            <span v-else-if="isTest">No live charge was created. This flow is safe for internal checkout testing.</span>
            <span v-else>We are finalizing membership setup now. You will be redirected automatically.</span>
          </p>
        </div>

        <UAlert
          v-if="claimError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="claimError"
        />
        <UAlert
          v-else-if="claimHint"
          color="warning"
          variant="soft"
          icon="i-lucide-loader-circle"
          :title="claimHint"
        />

        <div class="studio-panel p-5 sm:p-6">
          <div class="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--gruv-ink-2)]">
            Current status
          </div>
          <div class="mt-3 flex items-center gap-3">
            <UBadge
              :color="statusColor"
              variant="soft"
              size="lg"
            >
              {{ statusLabel }}
            </UBadge>
            <span class="text-sm text-[color:var(--gruv-ink-2)]">
              <span v-if="claimLoading">Setting up account.</span>
              <span v-else-if="status === 'active'">Setup complete. Redirecting to dashboard.</span>
              <span v-else-if="status === 'pending_checkout'">Payment received. Finishing setup.</span>
              <span v-else>Sync in progress.</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  </UContainer>
</template>
