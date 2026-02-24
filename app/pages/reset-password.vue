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
const toast = useToast()
const loading = ref(false)

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

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const { error } = await supabase.auth.updateUser({
      password: payload.data.password
    })
    if (error) throw error

    toast.add({ title: 'Password updated', description: 'You can now sign in with your new password.' })
    await router.push('/login')
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e?.message ?? 'Failed to update password',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
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
