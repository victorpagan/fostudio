<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Reset Password',
  description: 'Set a new password for your FO Studio account'
})

const supabase = useSupabaseClient()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const loading = ref(false)
const verifying = ref(true)
const ready = ref(false)
const recoveryError = ref<string | null>(null)

const schema = z.object({
  password: z.string().min(8, 'Must be at least 8 characters'),
  confirm: z.string()
}).refine(d => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm']
})

type Schema = z.output<typeof schema>

const fields = [
  {
    name: 'password',
    type: 'password' as const,
    label: 'New Password',
    placeholder: 'At least 8 characters',
    required: true
  },
  {
    name: 'confirm',
    type: 'password' as const,
    label: 'Confirm Password',
    placeholder: 'Repeat your new password',
    required: true
  }
]

function readQueryStringParam(name: string) {
  const value = route.query[name]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function initializeRecoverySession() {
  verifying.value = true
  recoveryError.value = null
  ready.value = false

  try {
    // Newer Supabase recovery links can use ?token_hash=...&type=recovery.
    const tokenHash = readQueryStringParam('token_hash')
    const recoveryType = readQueryStringParam('type')
    if (tokenHash && recoveryType === 'recovery') {
      const { error } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: tokenHash
      })
      if (error) throw error
    }

    // PKCE / code flow fallback.
    const code = readQueryStringParam('code')
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) throw error
    }

    // Hash-based links can carry tokens directly; setSession if needed.
    if (import.meta.client && window.location.hash.includes('access_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        if (error) throw error
      }
    }

    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session) {
      throw new Error('This reset link is invalid or expired. Please request a new one.')
    }

    ready.value = true
  } catch (error) {
    recoveryError.value = error instanceof Error
      ? error.message
      : 'This reset link is invalid or expired. Please request a new one.'
  } finally {
    verifying.value = false
  }
}

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  if (!ready.value) return

  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({
      password: payload.data.password
    })
    if (error) throw error

    toast.add({ title: 'Password updated', description: 'You can now sign in with your new password.' })
    await router.push('/login')
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to update password'
    toast.add({
      title: 'Error',
      description: message,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void initializeRecoverySession()
})
</script>

<template>
  <div v-if="verifying" class="space-y-4 text-center py-4">
    <UIcon name="i-lucide-loader-circle" class="mx-auto h-10 w-10 animate-spin text-primary" />
    <p class="text-sm text-gray-600 dark:text-gray-400">
      Verifying your reset link...
    </p>
  </div>

  <div v-else-if="recoveryError" class="space-y-4 text-center py-4">
    <UIcon name="i-lucide-circle-alert" class="mx-auto h-10 w-10 text-red-500" />
    <h2 class="text-lg font-semibold">
      Reset link issue
    </h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ recoveryError }}
    </p>
    <UButton color="neutral" variant="soft" to="/forgot-password">
      Request a new reset link
    </UButton>
  </div>

  <UAuthForm
    v-else
    :fields="fields"
    :schema="schema"
    title="Set new password"
    icon="i-heroicons-key"
    submit-label="Update password"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #description>
      Choose a strong password for your account.
    </template>

    <template #footer>
      <ULink to="/login" class="text-primary font-medium">Back to login</ULink>
    </template>
  </UAuthForm>
</template>
