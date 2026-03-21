<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type MailTemplateCategory = 'critical' | 'non_critical'

type AdminMailTemplate = {
  eventType: string
  sendgridTemplateId: string
  category: MailTemplateCategory
  active: boolean
  description: string
}

type AdminEmailSettingsResponse = {
  adminCopies: {
    criticalEnabled: boolean
    nonCriticalEnabled: boolean
    recipients: string[]
  }
  templates: AdminMailTemplate[]
}

const toast = useToast()
const saving = ref(false)
const recipientsInput = ref('')
const templates = ref<AdminMailTemplate[]>([])

const adminCopies = reactive({
  criticalEnabled: true,
  nonCriticalEnabled: false
})

const { pending, refresh } = await useAsyncData('admin:email:settings', async () => {
  const res = await $fetch<AdminEmailSettingsResponse>('/api/admin/email/settings')
  adminCopies.criticalEnabled = Boolean(res.adminCopies.criticalEnabled)
  adminCopies.nonCriticalEnabled = Boolean(res.adminCopies.nonCriticalEnabled)
  recipientsInput.value = (res.adminCopies.recipients ?? []).join('\n')
  templates.value = (res.templates ?? []).map(template => ({
    eventType: template.eventType,
    sendgridTemplateId: template.sendgridTemplateId,
    category: template.category,
    active: Boolean(template.active),
    description: template.description ?? ''
  }))
  return res
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function addTemplateRow() {
  templates.value.push({
    eventType: '',
    sendgridTemplateId: '',
    category: 'critical',
    active: true,
    description: ''
  })
}

function removeTemplateRow(index: number) {
  templates.value.splice(index, 1)
}

function parseRecipients(input: string) {
  return [...new Set(
    input
      .split(/[\n,]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]
}

async function saveSettings() {
  saving.value = true
  try {
    const payload = {
      adminCopies: {
        criticalEnabled: adminCopies.criticalEnabled,
        nonCriticalEnabled: adminCopies.nonCriticalEnabled,
        recipients: parseRecipients(recipientsInput.value)
      },
      templates: templates.value
        .map(template => ({
          eventType: template.eventType.trim(),
          sendgridTemplateId: template.sendgridTemplateId.trim(),
          category: template.category,
          active: Boolean(template.active),
          description: template.description.trim()
        }))
        .filter(template => template.eventType && template.sendgridTemplateId)
    }

    await $fetch('/api/admin/email/settings.upsert', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Email settings saved', color: 'success' })
    await refresh()
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save email settings',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="admin-email-settings">
    <template #header>
      <UDashboardNavbar title="Email Settings" :ui="{ right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-mail"
          title="Centralized mail controls"
          description="Configure admin copies and SendGrid template mapping by mail event type."
        />

        <UCard>
          <div class="space-y-4">
            <div class="text-sm font-medium">
              Admin copy preferences
            </div>

            <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
              <div>
                <div class="text-sm font-medium">Critical email copies</div>
                <div class="text-xs text-dimmed">Forward a copy of critical notifications to admin inboxes.</div>
              </div>
              <USwitch v-model="adminCopies.criticalEnabled" />
            </div>

            <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
              <div>
                <div class="text-sm font-medium">Non-critical email copies</div>
                <div class="text-xs text-dimmed">Keep disabled by default to reduce noise.</div>
              </div>
              <USwitch v-model="adminCopies.nonCriticalEnabled" />
            </div>

            <UFormField
              label="Admin copy recipients"
              description="One email per line or comma-separated."
            >
              <UTextarea
                v-model="recipientsInput"
                :rows="4"
                class="w-full"
                placeholder="ops@fostudio.com&#10;support@fostudio.com"
              />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-medium">SendGrid template registry</div>
              <UButton size="xs" color="neutral" variant="soft" @click="addTemplateRow">
                Add event mapping
              </UButton>
            </div>

            <div v-if="templates.length === 0" class="text-sm text-dimmed">
              No template mappings yet.
            </div>

            <div v-for="(template, index) in templates" :key="`${template.eventType}-${index}`" class="rounded-lg border border-default p-3 space-y-3">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Event type">
                  <UInput
                    v-model="template.eventType"
                    class="w-full"
                    placeholder="membership.waitlistInvite"
                  />
                </UFormField>
                <UFormField label="SendGrid template id">
                  <UInput
                    v-model="template.sendgridTemplateId"
                    class="w-full"
                    placeholder="d-xxxxxxxxxxxxxxxxxxxx"
                  />
                </UFormField>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Category">
                  <select
                    v-model="template.category"
                    class="w-full rounded-md border border-default bg-default px-2.5 py-2 text-sm"
                  >
                    <option value="critical">critical</option>
                    <option value="non_critical">non_critical</option>
                  </select>
                </UFormField>

                <UFormField label="Description">
                  <UInput
                    v-model="template.description"
                    class="w-full"
                    placeholder="Optional"
                  />
                </UFormField>
              </div>

              <div class="flex items-center justify-between">
                <UCheckbox v-model="template.active" label="Active" />
                <UButton size="xs" color="error" variant="soft" @click="removeTemplateRow(index)">
                  Remove
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <div class="flex justify-end">
          <UButton :loading="saving" @click="saveSettings">
            Save email settings
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
