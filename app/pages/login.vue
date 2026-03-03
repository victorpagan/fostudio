<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const loading = ref(false)

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard'
})

const signupTo = computed(() =>
  `/signup?returnTo=${encodeURIComponent(returnTo.value)}`
)

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

const providers: Array<{ label: string; icon: string; onClick: () => void }> = []

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters')
})

type Schema = z.output<typeof schema>

// Ref to the UAuthForm so we can call submit() programmatically on Enter
const formRef = ref()

function handleEnter(e: KeyboardEvent) {
  // Only fire on Enter from an input (not from the submit button itself)
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT') {
    formRef.value?.$el?.querySelector('button[type="submit"]')?.click()
  }
}

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: payload.data.email.trim(),
      password: payload.data.password
    })
    if (error) throw error

    toast.add({ title: 'Welcome back', description: 'Signed in successfully' })
    await router.push(returnTo.value)
  } catch (e: any) {
    toast.add({ title: 'Login failed', description: e?.message ?? 'Unknown error', color: 'error' })
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
