<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

type CustomerRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
}

const { data: customer, refresh } = await useAsyncData('dash:profile', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .eq('user_id', user.value.id)
    .maybeSingle()
  if (error) throw error
  return data as CustomerRow | null
})

// Editable form — synced from customer data
const form = reactive({
  first_name: '',
  last_name: '',
  phone: ''
})

watch(customer, (c) => {
  if (!c) return
  form.first_name = c.first_name ?? ''
  form.last_name = c.last_name ?? ''
  form.phone = c.phone ?? ''
}, { immediate: true })

const saving = ref(false)
const saved = ref(false)

async function saveProfile() {
  if (!customer.value?.id) return
  saving.value = true
  saved.value = false
  try {
    const { error } = await supabase
      .from('customers')
      .update({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null
      })
      .eq('id', customer.value.id)

    if (error) throw error
    saved.value = true
    toast.add({ title: 'Profile saved', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.message ?? 'Error', color: 'error' })
  } finally {
    saving.value = false
  }
}

// Password change
const pwForm = reactive({ current: '', next: '', confirm: '' })
const pwSaving = ref(false)
const pwError = ref<string | null>(null)

async function changePassword() {
  pwError.value = null
  if (pwForm.next !== pwForm.confirm) {
    pwError.value = 'New passwords do not match'
    return
  }
  if (pwForm.next.length < 8) {
    pwError.value = 'Password must be at least 8 characters'
    return
  }
  pwSaving.value = true
  try {
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) throw error
    toast.add({ title: 'Password updated', color: 'success' })
    pwForm.current = ''
    pwForm.next = ''
    pwForm.confirm = ''
  } catch (e: any) {
    pwError.value = e?.message ?? 'Failed to update password'
  } finally {
    pwSaving.value = false
  }
}

const isDirty = computed(() =>
  form.first_name !== (customer.value?.first_name ?? '') ||
  form.last_name !== (customer.value?.last_name ?? '') ||
  form.phone !== (customer.value?.phone ?? '')
)
</script>

<template>
  <UDashboardPanel id="profile">
    <template #header>
      <UDashboardNavbar title="Profile">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4 max-w-xl">
        <!-- Account info -->
        <UCard>
          <div class="space-y-4">
            <div class="text-sm font-medium">Account</div>

            <div class="space-y-1">
              <div class="text-xs text-dimmed">Email</div>
              <div class="text-sm font-medium">{{ user?.email ?? '—' }}</div>
              <p class="text-xs text-dimmed">Email cannot be changed here. Contact support if needed.</p>
            </div>

            <div class="border-t border-default pt-4 grid grid-cols-2 gap-3">
              <UFormField label="First name">
                <UInput v-model="form.first_name" placeholder="Jane" class="w-full" />
              </UFormField>
              <UFormField label="Last name">
                <UInput v-model="form.last_name" placeholder="Smith" class="w-full" />
              </UFormField>
            </div>

            <UFormField label="Phone number">
              <UInput v-model="form.phone" type="tel" placeholder="+1 555 000 0000" class="w-full" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                :loading="saving"
                :disabled="!isDirty"
                @click="saveProfile"
              >
                Save changes
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Change password -->
        <UCard>
          <div class="space-y-4">
            <div class="text-sm font-medium">Change password</div>

            <UFormField label="New password">
              <UInput v-model="pwForm.next" type="password" placeholder="••••••••" class="w-full" />
            </UFormField>
            <UFormField label="Confirm new password">
              <UInput v-model="pwForm.confirm" type="password" placeholder="••••••••" class="w-full" />
            </UFormField>

            <UAlert v-if="pwError" color="error" variant="soft" :title="pwError" />

            <div class="flex justify-end">
              <UButton
                :loading="pwSaving"
                :disabled="!pwForm.next || !pwForm.confirm"
                color="neutral"
                variant="soft"
                @click="changePassword"
              >
                Update password
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Danger zone -->
        <UCard>
          <div class="space-y-3">
            <div class="text-sm font-medium text-red-600 dark:text-red-400">Danger zone</div>
            <p class="text-sm text-dimmed">
              To cancel your membership or delete your account, please contact us directly.
              Active memberships are managed through Square and must be cancelled before account deletion.
            </p>
            <UButton color="error" variant="soft" size="sm" disabled>
              Delete account (contact support)
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
