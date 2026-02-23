<!-- File: pages/signup.vue -->
<script setup lang="ts">
definePageMeta({ auth: false })

type TierId = 'creator' | 'pro' | 'studio_plus'
const route = useRoute()
const router = useRouter()

const supabase = useSupabaseClient()
const user = useSupabaseUser()

const tierCatalog: Record<TierId, { name: string; price: number; credits: number; bookingWindowDays: number }> = {
  creator: { name: 'Creator', price: 350, credits: 12, bookingWindowDays: 14 },
  pro: { name: 'Pro', price: 650, credits: 26, bookingWindowDays: 21 },
  studio_plus: { name: 'Studio+', price: 950, credits: 42, bookingWindowDays: 30 }
}

const tier = computed<TierId>(() => {
  const t = (route.query.tier as string | undefined)?.toLowerCase()
  if (t === 'creator' || t === 'pro' || t === 'studio_plus') return t
  return 'creator'
})

const tierInfo = computed(() => tierCatalog[tier.value])

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
  if (user.value) router.replace('/onboarding')
})

async function handleSignup() {
  errorMsg.value = null
  successMsg.value = null
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`
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
    }

    // Create membership row (pending checkout)
    // (If you prefer, we can move this to a server endpoint too.)
    const { error: memErr } = await supabase
      .from('memberships')
      .insert({
        user_id: data.user.id,
        tier: tier.value,
        cadence: 'monthly',
        status: 'pending_checkout'
      } as any)
    if (memErr) throw memErr

    successMsg.value = 'Account created. Check your email if confirmation is required. Redirecting…'
    await router.push('/onboarding')
  } catch (e: any) {
    errorMsg.value = e?.message ?? 'Signup failed.'
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

        <div class="mt-4 grid grid-cols-3 gap-2">
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">${{ tierInfo.price }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">per month</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tierInfo.credits }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">credits</div>
          </div>
          <div class="rounded-xl border border-gray-200/60 p-3 text-center dark:border-gray-800/60">
            <div class="text-sm font-medium">{{ tierInfo.bookingWindowDays }}d</div>
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
              <span>Checkout (we’ll wire billing next)</span>
            </li>
          </ul>
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton color="gray" variant="soft" to="/memberships">Change tier</UButton>
          <UButton color="gray" variant="ghost" to="/calendar">View calendar</UButton>
        </div>
      </UCard>

      <!-- Right: Signup form -->
      <UCard>
        <template #header>
          <div class="text-lg font-semibold">Create your account</div>
        </template>

        <div class="space-y-4">
          <UAlert v-if="errorMsg" color="red" variant="soft" :title="errorMsg" />
          <UAlert v-if="successMsg" color="green" variant="soft" :title="successMsg" />

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
            <NuxtLink class="underline" to="/login">Log in</NuxtLink>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
