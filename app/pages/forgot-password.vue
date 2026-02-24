<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useSeoMeta({
  title: 'Forgot Password',
  description: 'Reset your FO Studio account password'
})

const supabase = useSupabaseClient()
const toast = useToast()
const loading = ref(false)
const sent = ref(false)

const schema = z.object({
  email: z.string().email('Invalid email address')
})

type Schema = z.output<typeof schema>

const fields = [{
  name: 'email',
  type: 'text' as const,
  label: 'Email',
  placeholder: 'Enter your email address',
  required: true
}]

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      payload.data.email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    )
    if (error) throw error

    sent.value = true
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e?.message ?? 'Failed to send reset email',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="sent" class="space-y-4 text-center py-4">
    <UIcon name="i-heroicons-envelope" class="mx-auto h-12 w-12 text-primary" />
    <h2 class="text-lg font-semibold">Check your email</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      We sent a password reset link to your email address.
      Check your inbox (and spam folder, just in case).
    </p>
    <UButton variant="soft" color="neutral" to="/login" class="mt-2">
      Back to login
    </UButton>
  </div>

  <UAuthForm
    v-else
    :fields="fields"
    :schema="schema"
    title="Forgot password?"
    icon="i-heroicons-lock-closed"
    submit-label="Send reset link"
    :loading="loading"
    @submit="onSubmit"
  >
    <template #description>
      Enter your email and we'll send you a link to reset your password.
    </template>

    <template #footer>
      Remember your password?
      <ULink to="/login" class="text-primary font-medium">Sign in</ULink>
    </template>
  </UAuthForm>
</template>
