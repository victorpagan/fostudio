<!-- File: pages/signup.vue -->
<script setup lang="ts">
definePageMeta({ auth: false })

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

const loginTo = computed(() =>
  `/login?returnTo=${encodeURIComponent(returnTo.value)}`
)

const selectedPlan = computed(() => {
  const selected = {
    tier: null as TierId | null,
    cadence: null as Cadence | null
  }

  try {
    const target = new URL(returnTo.value, 'https://fostudio.local')
    const tier = target.searchParams.get('tier')?.toLowerCase()
    const cadence = target.searchParams.get('cadence')?.toLowerCase()

    if (tier === 'creator' || tier === 'pro' || tier === 'studio_plus') {
      selected.tier = tier
    }

    if (cadence === 'daily' || cadence === 'weekly' || cadence === 'monthly' || cadence === 'quarterly' || cadence === 'annual') {
      selected.cadence = cadence
    }
  } catch {
    // Ignore malformed returnTo values and fall back to safe defaults.
  }

  return selected
})

const checkoutTokenFromReturnTo = computed(() => {
  try {
    const target = new URL(returnTo.value, 'https://fostudio.local')
    if (!target.pathname.startsWith('/checkout/success')) return null
    const token = target.searchParams.get('checkout')
    return token || null
  } catch {
    return null
  }
})

const { data: checkoutSessionInfo } = await useAsyncData('signup:checkout-session-info', async () => {
  if (!checkoutTokenFromReturnTo.value) return null
  const res = await $fetch<{
    session: {
      tier: string
      cadence: Cadence
      tierDisplayName: string
    }
  }>('/api/checkout/session-info', {
    query: { token: checkoutTokenFromReturnTo.value }
  })
  return res.session
}, {
  watch: [checkoutTokenFromReturnTo]
})

const tier = computed<TierId>(() => {
  const direct = (route.query.tier as string | undefined)?.toLowerCase()
  if (direct) return direct
  if (checkoutSessionInfo.value?.tier) return checkoutSessionInfo.value.tier
  return selectedPlan.value.tier ?? 'creator'
})

const cadence = computed<Cadence>(() => checkoutSessionInfo.value?.cadence ?? selectedPlan.value.cadence ?? 'monthly')

const tierInfo = computed(() => {
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
  // If already logged in, send them onward
  if (user.value) router.replace(returnTo.value)
})

function cadenceLabel(value: Cadence) {
  if (value === 'daily') return 'Daily'
  if (value === 'weekly') return 'Weekly'
  if (value === 'monthly') return 'Monthly'
  if (value === 'quarterly') return 'Quarterly'
  return 'Annual'
}

async function handleSignup() {
  errorMsg.value = null
  successMsg.value = null
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding?returnTo=${encodeURIComponent(returnTo.value)}`
      }
    })
    if (error) throw error
    if (!data.user) throw new Error('No user returned from signup.')

    // Link/create customer row + Square customer (server-side, service role)
    // If email confirmations are ON, data.session may be null.
    // That’s fine; bootstrap will run on first login/onboarding.
    if (data.session) {
      await $fetch('/api/account/bootstrap', {
        method: 'POST',
        body: {
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          first_name: form.firstName.trim() || undefined,
          last_name: form.lastName.trim() || undefined
        }
      })

      await router.push(returnTo.value)
      return
    }

    successMsg.value = 'Account created. Check your email to confirm your account, then log in to continue.'
  } catch (error: unknown) {
    const maybe = error as { message?: string }
    errorMsg.value = maybe?.message ?? 'Signup failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2 lg:items-start">
      <!-- Left: Tier summary -->
      <UCard>
        <div class="text-sm text-gray-500 dark:text-gray-400">You selected</div>
        <div class="mt-1 text-2xl font-semibold">{{ tierInfo.name }}</div>
        <div class="mt-1 text-sm text-gray-600 dark:text-gray-300">
          {{ cadenceLabel(cadence) }} billing
        </div>

        <div class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ cadenceLabel(cadence) }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">billing</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tierInfo.credits > 0 ? tierInfo.credits : '—' }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">credits</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tierInfo.bookingWindowDays > 0 ? `${tierInfo.bookingWindowDays}d` : '—' }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">booking</div>
          </div>
        </div>

        <div class="mt-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div class="font-medium">What happens next</div>
          <ul class="space-y-2">
            <li class="flex gap-2">
              <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
              <span>Create your account</span>
            </li>
            <li class="flex gap-2">
              <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
              <span>Complete onboarding (waiver + rules)</span>
            </li>
            <li class="flex gap-2">
              <span class="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
              <span>Complete secure checkout for your membership</span>
            </li>
          </ul>
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton color="neutral" variant="soft" to="/memberships">Change tier</UButton>
          <UButton color="neutral" variant="ghost" to="/calendar">View calendar</UButton>
        </div>
      </UCard>

      <!-- Right: Signup form -->
      <UCard>
        <template #header>
          <div class="text-lg font-semibold">Create your account</div>
        </template>

        <div class="space-y-4">
          <UAlert v-if="errorMsg" color="error" variant="soft" :title="errorMsg" />
          <UAlert v-if="successMsg" color="success" variant="soft" :title="successMsg" />

          <div class="grid gap-3 sm:grid-cols-2">
            <UInput v-model="form.firstName" placeholder="First name" />
            <UInput v-model="form.lastName" placeholder="Last name" />
          </div>

          <UInput v-model="form.phone" placeholder="Phone (optional)" />
          <UInput v-model="form.email" type="email" placeholder="Email" />
          <UInput v-model="form.password" type="password" placeholder="Password" />

          <div class="text-xs text-gray-500 dark:text-gray-400">
            By continuing, you agree to the studio rules and policies.
          </div>

          <div class="flex gap-2">
            <UButton :loading="loading" :disabled="loading" class="w-full" @click="handleSignup">
              Continue
            </UButton>
          </div>

          <div class="text-sm text-gray-600 dark:text-gray-300">
            Already have an account?
            <NuxtLink class="underline" :to="loginTo">Log in</NuxtLink>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
