<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const loading = ref(false)
const redirectingAuthenticatedUser = ref(false)

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard'
})

const signupTo = computed(() =>
  `/signup?returnTo=${encodeURIComponent(returnTo.value)}`
)

const RETURN_TO_PARSE_BASE = 'https://fo.studio'

const hasCheckoutSuccessReturn = computed(() => {
  try {
    const target = new URL(returnTo.value, RETURN_TO_PARSE_BASE)
    return target.pathname.startsWith('/checkout/success') && Boolean(target.searchParams.get('checkout'))
  } catch {
    return false
  }
})

// Keep the remember checkbox separate so it doesn't sit between password
// and the submit button — some browsers skip form submit on Enter when a
// checkbox is the last field before the button.
const fields = [{
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email',
  required: true
}, {
  name: 'password',
  label: 'Password',
  type: 'password' as const,
  placeholder: 'Enter your password'
}]

const providers: Array<{ label: string, icon: string, onClick: () => void }> = []

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters')
})

type Schema = z.output<typeof schema>

type AuthFormLike = {
  $el?: Element | null
}

// Ref to the UAuthForm so we can submit the underlying native form on Enter.
const formRef = ref<AuthFormLike | null>(null)

function handleEnter(e: KeyboardEvent) {
  // Only fire on Enter from an input-like control and submit the native form.
  // `requestSubmit` reliably triggers the component's submit flow.
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const form = formRef.value?.$el?.querySelector('form')
    if (form instanceof HTMLFormElement) {
      e.preventDefault()
      form.requestSubmit()
    }
  }
}

async function redirectIfAuthenticated() {
  if (import.meta.server || redirectingAuthenticatedUser.value || !user.value) return
  redirectingAuthenticatedUser.value = true
  try {
    await router.replace(returnTo.value)
  } finally {
    redirectingAuthenticatedUser.value = false
  }
}

onMounted(() => {
  void redirectIfAuthenticated()
})

watch(() => user.value?.id, () => {
  void redirectIfAuthenticated()
})

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: payload.data.email.trim(),
      password: payload.data.password
    })
    if (error) throw error

    if (hasCheckoutSuccessReturn.value) {
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

    toast.add({ title: 'Welcome back', description: 'Signed in successfully' })
    await router.push(returnTo.value)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    toast.add({ title: 'Login failed', description: message, color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div @keydown.enter="handleEnter">
    <UAuthForm
      ref="formRef"
      :fields="fields"
      :schema="schema"
      :providers="providers"
      title="Welcome back"
      icon="i-lucide-lock"
      :loading="loading"
      @submit="onSubmit"
    >
      <template #description>
        Don't have an account?
        <ULink :to="signupTo" class="text-primary font-medium">Sign up</ULink>.
      </template>

      <template #password-hint>
        <ULink to="/forgot-password" class="text-primary font-medium" tabindex="-1">
          Forgot password?
        </ULink>
      </template>

      <template #footer>
        By signing in, you agree to our
        <ULink to="/policies" class="text-primary font-medium">Terms of Service</ULink>.
      </template>
    </UAuthForm>
  </div>
</template>
