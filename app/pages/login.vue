<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
//import type { Database } from '~/types/supabase' // adjust path

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Login',
  description: 'Login to your account to continue'
})

const supabase = useSupabaseClient()
const router = useRouter()
const toast = useToast()
const loading = ref(false)

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
}, {
  name: 'remember',
  label: 'Remember me',
  type: 'checkbox' as const
}]

const providers: Array<{ label: string; icon: string; onClick: () => void }> = [/*{
  label: 'Google',
  icon: 'i-simple-icons-google',
  onClick: () => toast.add({ title: 'Google', description: 'OAuth not wired yet' })
}*/]

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Must be at least 8 characters')
})

type Schema = z.output<typeof schema>

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.data.email.trim(),
      password: payload.data.password
    })
    if (error) throw error

    // Link/sync customers row + Square customer
    await $fetch('/api/account/bootstrap', {
      method: 'POST',
      body: { email: payload.data.email.trim() }
    })

    toast.add({ title: 'Welcome back', description: 'Signed in successfully' })
    await router.push('/dashboard')
  } catch (e: any) {
    toast.add({ title: 'Login failed', description: e?.message ?? 'Unknown error', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
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
      <ULink to="/signup" class="text-primary font-medium">Sign up</ULink>.
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
</template>
