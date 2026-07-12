<!-- File: pages/signup.vue -->
<script setup lang="ts">
definePageMeta({ auth: false })

useNoindexSeo({
  title: 'Create an FO Studio account',
  description: 'Create an account to continue a non-member booking or membership activation.',
  canonicalPath: '/signup'
})

type TierId = string
type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'

const route = useRoute()
const router = useRouter()

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const tierCatalog: Record<string, { name: string, credits: number, bookingWindowDays: number }> = {
  creator: { name: 'Creator', credits: 12, bookingWindowDays: 14 },
  pro: { name: 'Pro', credits: 26, bookingWindowDays: 21 },
  studio_plus: { name: 'Studio+', credits: 42, bookingWindowDays: 30 }
}

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/onboarding'
})
const loginTo = computed(() => `/login?returnTo=${encodeURIComponent(returnTo.value)}`)

const RETURN_TO_PARSE_BASE = 'https://fo.studio'

const selectedPlan = computed(() => {
  const selected = {
    tier: null as TierId | null,
    cadence: null as Cadence | null
  }

  try {
    const target = new URL(returnTo.value, RETURN_TO_PARSE_BASE)
    const tier = target.searchParams.get('tier')?.toLowerCase()
    const cadence = target.searchParams.get('cadence')?.toLowerCase()

    if (tier) selected.tier = tier

    if (cadence === 'daily' || cadence === 'weekly' || cadence === 'monthly' || cadence === 'quarterly' || cadence === 'annual') {
      selected.cadence = cadence
    }
  } catch {
    // Ignore malformed returnTo values and fall back to safe defaults.
  }

  return selected
})

const selectedBookingIntent = computed(() => {
  try {
    const target = new URL(returnTo.value, RETURN_TO_PARSE_BASE)
    if (target.pathname !== '/dashboard/book') return null

    const start = new Date(target.searchParams.get('start') ?? '')
    const end = new Date(target.searchParams.get('end') ?? '')
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null

    return {
      start,
      end,
      rateKind: target.searchParams.get('rateKind') === 'standby' ? 'standby' as const : 'standard' as const
    }
  } catch {
    return null
  }
})

const checkoutTokenFromReturnTo = computed(() => {
  try {
    const target = new URL(returnTo.value, RETURN_TO_PARSE_BASE)
    if (!target.pathname.startsWith('/checkout/success')) return null
    const token = target.searchParams.get('checkout')
    return token || null
  } catch {
    return null
  }
})

const hasCheckoutSuccessReturn = computed(() => {
  try {
    const target = new URL(returnTo.value, RETURN_TO_PARSE_BASE)
    return target.pathname.startsWith('/checkout/success')
  } catch {
    return false
  }
})
const missingCheckoutToken = computed(() => hasCheckoutSuccessReturn.value && !checkoutTokenFromReturnTo.value)

const { data: checkoutSessionInfo } = await useAsyncData('signup:checkout-session-info', async () => {
  if (!checkoutTokenFromReturnTo.value) return null
  const res = await $fetch<{
    session: {
      tier: string
      cadence: Cadence
      tierDisplayName: string
      credits: number
      bookingWindowDays: number
      contact?: {
        email?: string | null
        phone?: string | null
        firstName?: string | null
        lastName?: string | null
      } | null
    }
  }>('/api/checkout/session-info', {
    query: { token: checkoutTokenFromReturnTo.value }
  })
  return res.session
}, {
  watch: [checkoutTokenFromReturnTo]
})

const tier = computed<TierId | null>(() => {
  const direct = (route.query.tier as string | undefined)?.toLowerCase()
  if (direct) return direct
  if (checkoutSessionInfo.value?.tier) return checkoutSessionInfo.value.tier
  return selectedPlan.value.tier ?? null
})

const cadence = computed<Cadence | null>(() => checkoutSessionInfo.value?.cadence ?? selectedPlan.value.cadence ?? null)
const hasPlanContext = computed(() => Boolean(tier.value && cadence.value))
const isCheckoutLinkedSignup = computed(() => Boolean(checkoutTokenFromReturnTo.value && checkoutSessionInfo.value))

const tierInfo = computed(() => {
  if (!tier.value) {
    return {
      name: 'FO Studio account',
      credits: 0,
      bookingWindowDays: 0
    }
  }

  if (checkoutSessionInfo.value?.tier === tier.value) {
    return {
      name: checkoutSessionInfo.value.tierDisplayName,
      credits: Number(checkoutSessionInfo.value.credits ?? 0),
      bookingWindowDays: Number(checkoutSessionInfo.value.bookingWindowDays ?? 0)
    }
  }

  const known = tierCatalog[tier.value]
  if (known) return known
  const fallbackName = checkoutSessionInfo.value?.tierDisplayName ?? tier.value
  return {
    name: fallbackName,
    credits: 0,
    bookingWindowDays: 0
  }
})

const form = reactive({
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: ''
})

const loading = ref(false)
const errorMsg = ref<string | null>(null)
const successMsg = ref<string | null>(null)

watchEffect(() => {
  const contact = checkoutSessionInfo.value?.contact
  if (!contact) return
  if (!form.email && contact.email) form.email = contact.email
  if (!form.phone && contact.phone) form.phone = contact.phone
  if (!form.firstName && contact.firstName) form.firstName = contact.firstName
  if (!form.lastName && contact.lastName) form.lastName = contact.lastName
})

watchEffect(() => {
  // If already logged in, send them onward
  if (user.value) router.replace(returnTo.value)
})

function cadenceLabel(value: Cadence | null) {
  if (!value) return 'Not set'
  if (value === 'daily') return 'Daily'
  if (value === 'weekly') return 'Weekly'
  if (value === 'monthly') return 'Monthly'
  if (value === 'quarterly') return 'Quarterly'
  return 'Annual'
}

function formatBookingIntent(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short'
  }).format(value)
}

function mapSignupError(error: unknown) {
  const maybe = error as { data?: { statusMessage?: string }, message?: string, status?: number, statusCode?: number }
  const rawMessage = maybe?.data?.statusMessage ?? maybe?.message ?? ''
  const message = String(rawMessage).toLowerCase()
  const statusCode = Number(maybe?.statusCode ?? maybe?.status ?? 0)

  if (statusCode === 429 || message.includes('too many requests') || message.includes('rate limit')) {
    return 'Email verification rate limit hit. If this email already has an account, log in to resume membership activation.'
  }
  if (message.includes('user already registered')) {
    return 'This email already has an account. Log in to resume membership activation.'
  }
  if (message.includes('confirmation email') || message.includes('sending confirmation')) {
    return 'Account created, but the confirmation email could not be sent. Try logging in, or contact support if this continues.'
  }
  return rawMessage || 'Signup failed.'
}

async function handleSignup() {
  errorMsg.value = null
  successMsg.value = null
  const phone = form.phone.trim()
  if (!phone) {
    errorMsg.value = 'Phone is required to create an account.'
    return
  }

  loading.value = true
  try {
    if (isCheckoutLinkedSignup.value && checkoutTokenFromReturnTo.value) {
      const email = form.email.trim()
      await $fetch('/api/account/signup-from-checkout', {
        method: 'POST',
        body: {
          token: checkoutTokenFromReturnTo.value,
          password: form.password,
          first_name: form.firstName.trim() || undefined,
          last_name: form.lastName.trim() || undefined,
          phone,
          returnTo: returnTo.value
        }
      })

      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password: form.password
      })
      if (loginErr) throw loginErr

      await $fetch('/api/account/bootstrap', {
        method: 'POST',
        body: {
          email,
          phone,
          first_name: form.firstName.trim() || undefined,
          last_name: form.lastName.trim() || undefined,
          studioSource: 'studio_checkout_signup'
        }
      })

      if (checkoutTokenFromReturnTo.value) {
        await router.push(returnTo.value)
        return
      }

      const pending = await $fetch<{ pending: { token: string, returnTo: string } | null }>('/api/checkout/pending').catch(() => ({ pending: null }))
      if (pending.pending?.token) {
        const query = new URLSearchParams({
          checkout: pending.pending.token,
          returnTo: pending.pending.returnTo
        })
        await router.push(`/checkout/success?${query.toString()}`)
        return
      }

      await router.push(returnTo.value)
      return
    }

    const email = form.email.trim()
    await $fetch('/api/account/signup', {
      method: 'POST',
      body: {
        email,
        password: form.password,
        first_name: form.firstName.trim() || undefined,
        last_name: form.lastName.trim() || undefined,
        phone,
        returnTo: returnTo.value
      }
    })

    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email,
      password: form.password
    })
    if (loginErr) throw loginErr

    await $fetch('/api/account/bootstrap', {
      method: 'POST',
      body: {
        email,
        phone,
        first_name: form.firstName.trim() || undefined,
        last_name: form.lastName.trim() || undefined,
        studioSource: 'studio_signup'
      }
    })

    const pending = await $fetch<{ pending: { token: string, returnTo: string } | null }>('/api/checkout/pending').catch(() => ({ pending: null }))
    if (pending.pending?.token) {
      const query = new URLSearchParams({
        checkout: pending.pending.token,
        returnTo: pending.pending.returnTo
      })
      await router.push(`/checkout/success?${query.toString()}`)
      return
    }

    await router.push(returnTo.value)
  } catch (error: unknown) {
    errorMsg.value = mapSignupError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-3xl">
      <div class="mb-6 text-center">
        <div class="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          FO Studio account
        </div>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
          {{ isCheckoutLinkedSignup ? 'Finish your account' : 'Create your account' }}
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-6 text-dimmed">
          <template v-if="hasPlanContext">
            Create your login, finish onboarding, and we’ll route you back to complete membership activation.
          </template>
          <template v-else>
            Create an account to book as a non-member, manage credits, or choose a membership when you are ready.
          </template>
        </p>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="text-lg font-semibold">
                Account details
              </div>
            </div>
            <UBadge
              v-if="isCheckoutLinkedSignup"
              color="success"
              variant="soft"
            >
              Checkout linked
            </UBadge>
          </div>
        </template>

        <form
          class="space-y-5"
          @submit.prevent="handleSignup"
        >
          <AppAlert
            v-if="errorMsg"
            color="error"
            variant="soft"
            :title="errorMsg"
          />
          <AppAlert
            v-if="successMsg"
            color="success"
            variant="soft"
            :title="successMsg"
          />

          <div
            v-if="hasPlanContext"
            class="rounded-2xl border border-default bg-elevated/60 p-4"
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Selected membership
                </div>
                <div class="mt-1 text-xl font-semibold text-highlighted">
                  {{ tierInfo.name }}
                </div>
              </div>
              <UBadge
                color="neutral"
                variant="soft"
              >
                {{ cadenceLabel(cadence) }} billing
              </UBadge>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-3">
              <div class="rounded-xl border border-default bg-default/70 p-3">
                <div class="text-sm font-medium text-highlighted">
                  {{ cadenceLabel(cadence) }}
                </div>
                <div class="text-xs text-dimmed">
                  billing
                </div>
              </div>
              <div class="rounded-xl border border-default bg-default/70 p-3">
                <div class="text-sm font-medium text-highlighted">
                  {{ tierInfo.credits > 0 ? tierInfo.credits : '—' }}
                </div>
                <div class="text-xs text-dimmed">
                  monthly credits
                </div>
              </div>
              <div class="rounded-xl border border-default bg-default/70 p-3">
                <div class="text-sm font-medium text-highlighted">
                  {{ tierInfo.bookingWindowDays > 0 ? `${tierInfo.bookingWindowDays}d` : '—' }}
                </div>
                <div class="text-xs text-dimmed">
                  booking reach
                </div>
              </div>
            </div>
          </div>

          <div
            v-else-if="selectedBookingIntent"
            class="rounded-2xl border border-default bg-elevated/60 p-4"
          >
            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Selected {{ selectedBookingIntent.rateKind === 'standby' ? 'standby request' : 'non-member time' }}
            </div>
            <p class="mt-2 font-semibold text-highlighted">
              {{ formatBookingIntent(selectedBookingIntent.start) }} to {{ formatBookingIntent(selectedBookingIntent.end) }}
            </p>
            <p class="mt-2 text-xs leading-5 text-dimmed">
              The time remains in your booking return URL. The authenticated booking preview will recheck availability, eligibility, and price before confirmation.
            </p>
          </div>

          <AppAlert
            v-if="missingCheckoutToken"
            color="warning"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Missing checkout token"
            description="This signup link is missing checkout context. Complete checkout again or sign in to continue."
          />

          <div
            class="grid gap-3 sm:grid-cols-2"
          >
            <UFormField label="First name">
              <UInput
                v-model="form.firstName"
                placeholder="First name"
                name="first-name"
                autocomplete="given-name"
              />
            </UFormField>
            <UFormField label="Last name">
              <UInput
                v-model="form.lastName"
                placeholder="Last name"
                name="last-name"
                autocomplete="family-name"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              label="Email"
              required
              :hint="isCheckoutLinkedSignup ? 'From checkout' : undefined"
            >
              <UInput
                v-model="form.email"
                type="email"
                placeholder="Email"
                name="email"
                autocomplete="email"
                required
                :disabled="isCheckoutLinkedSignup"
              />
            </UFormField>
            <UFormField
              label="Phone"
              required
              :error="!form.phone.trim() && errorMsg?.includes('Phone') ? 'Phone is required' : undefined"
            >
              <UInput
                v-model="form.phone"
                type="tel"
                placeholder="Phone"
                name="phone"
                autocomplete="tel"
                required
              />
            </UFormField>
          </div>

          <UFormField
            label="Password"
            required
          >
            <UInput
              v-model="form.password"
              type="password"
              placeholder="Password"
              name="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
          </UFormField>

          <div class="text-xs text-gray-500 dark:text-gray-400">
            By continuing, you agree to the
            <NuxtLink
              to="/policies#terms"
              class="font-medium underline underline-offset-2"
            >terms</NuxtLink>
            and booking rules, and acknowledge the
            <NuxtLink
              to="/policies#privacy"
              class="font-medium underline underline-offset-2"
            >privacy notice</NuxtLink>.
          </div>

          <div class="flex gap-2">
            <UButton
              type="submit"
              :loading="loading"
              :disabled="loading"
              class="w-full"
            >
              Create account
            </UButton>
          </div>

          <p class="text-center text-sm text-dimmed">
            Already have an account?
            <NuxtLink
              :to="loginTo"
              class="font-medium text-primary underline underline-offset-2"
            >Log in and continue</NuxtLink>.
          </p>

          <div class="rounded-2xl border border-default bg-muted/40 p-4 text-sm text-dimmed">
            <div class="font-medium text-highlighted">
              What happens next
            </div>
            <div class="mt-2 grid gap-2 sm:grid-cols-3">
              <div>Create your login</div>
              <div>Complete waiver and rules</div>
              <div>{{ hasPlanContext ? 'Finish membership checkout' : 'Book as a non-member or join' }}</div>
            </div>
          </div>
        </form>
      </UCard>
    </div>
  </UContainer>
</template>
