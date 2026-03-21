<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

type MailTemplateCategory = 'critical' | 'non_critical'

type AdminMailTemplate = {
  eventType: string
  sendgridTemplateId: string
  category: MailTemplateCategory
  active: boolean
  description: string
  subjectTemplate: string
  preheaderTemplate: string
  bodyTemplate: string
}

type AdminEmailSettingsResponse = {
  adminCopies: {
    criticalEnabled: boolean
    nonCriticalEnabled: boolean
    recipients: string[]
  }
  templates: AdminMailTemplate[]
  availableVariablesByEvent: Record<string, string[]>
}

const toast = useToast()
const saving = ref(false)
const recipientsInput = ref('')
const templates = ref<AdminMailTemplate[]>([])
const availableVariablesByEvent = ref<Record<string, string[]>>({ '*': [] })
const templateModalOpen = ref(false)
const editingTemplateIndex = ref<number | null>(null)
const templateDraft = ref<AdminMailTemplate | null>(null)

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
    description: template.description ?? '',
    subjectTemplate: template.subjectTemplate ?? '',
    preheaderTemplate: template.preheaderTemplate ?? '',
    bodyTemplate: template.bodyTemplate ?? ''
  }))
  availableVariablesByEvent.value = res.availableVariablesByEvent ?? { '*': [] }
  return res
})

const selectedTemplateVariables = computed(() => {
  const draft = templateDraft.value
  if (!draft) return [] as string[]

  const common = availableVariablesByEvent.value['*'] ?? []
  const specific = draft.eventType ? (availableVariablesByEvent.value[draft.eventType] ?? []) : []
  return [...new Set([...common, ...specific])]
})

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'Unknown error'
  const maybe = error as { data?: { statusMessage?: string }, message?: string }
  return maybe.data?.statusMessage ?? maybe.message ?? 'Unknown error'
}

function parseRecipients(input: string) {
  return [...new Set(
    input
      .split(/[\n,]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  )]
}

function formatVariableToken(variableName: string) {
  return `{{ ${variableName} }}`
}

function hasTemplateId(template: AdminMailTemplate) {
  return template.sendgridTemplateId.trim().length > 0
}

function openTemplateModal(index: number) {
  const selected = templates.value[index]
  if (!selected) return
  editingTemplateIndex.value = index
  templateDraft.value = { ...selected }
  templateModalOpen.value = true
}

function closeTemplateModal() {
  templateModalOpen.value = false
  editingTemplateIndex.value = null
  templateDraft.value = null
}

async function saveSettings(options: { closeModalOnSuccess?: boolean } = {}) {
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
          description: template.description.trim(),
          subjectTemplate: template.subjectTemplate,
          preheaderTemplate: template.preheaderTemplate,
          bodyTemplate: template.bodyTemplate
        }))
        .filter(template => template.eventType && template.sendgridTemplateId)
    }

    await $fetch('/api/admin/email/settings.upsert', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Email settings saved', color: 'success' })
    await refresh()
    if (options.closeModalOnSuccess) closeTemplateModal()
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

async function saveTemplateFromModal() {
  const index = editingTemplateIndex.value
  const draft = templateDraft.value
  if (index === null || !draft) return
  templates.value[index] = { ...draft }
  await saveSettings({ closeModalOnSuccess: true })
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
          description="Configure admin copies and SendGrid template mapping by event type. Supports {{ variableName }} interpolation for subject, preheader, and body (single-pass, unresolved variables render blank)."
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

            <div class="flex justify-end">
              <UButton :loading="saving" @click="saveSettings()">
                Save admin copy settings
              </UButton>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between gap-3">
              <div class="text-sm font-medium">SendGrid template registry</div>
              <div class="text-xs text-dimmed">
                Event list is preloaded. Open a row and set the template id.
              </div>
            </div>

            <div v-if="templates.length === 0" class="text-sm text-dimmed">
              No event mappings available.
            </div>

            <div
              v-for="(template, index) in templates"
              :key="`${template.eventType}-${index}`"
              class="rounded-lg border border-default p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="rounded bg-elevated px-2 py-0.5 text-xs">
                      {{ template.eventType }}
                    </code>
                    <UBadge
                      :color="template.category === 'critical' ? 'error' : 'neutral'"
                      variant="soft"
                      size="sm"
                    >
                      {{ template.category }}
                    </UBadge>
                    <UBadge
                      :color="template.active ? 'success' : 'neutral'"
                      variant="soft"
                      size="sm"
                    >
                      {{ template.active ? 'active' : 'inactive' }}
                    </UBadge>
                    <UBadge
                      :color="hasTemplateId(template) ? 'success' : 'warning'"
                      variant="soft"
                      size="sm"
                    >
                      {{ hasTemplateId(template) ? 'template id set' : 'template id needed' }}
                    </UBadge>
                  </div>
                  <div class="text-sm text-dimmed">
                    {{ template.description || 'No description provided.' }}
                  </div>
                  <div class="text-xs text-dimmed break-all">
                    Template ID: {{ template.sendgridTemplateId || 'Not configured' }}
                  </div>
                </div>
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-pencil"
                  @click="openTemplateModal(index)"
                >
                  Edit
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="templateModalOpen">
    <template #content>
      <UCard v-if="templateDraft" class="w-[calc(100vw-2rem)] max-w-5xl">
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-base font-semibold">
                Edit template mapping
              </div>
              <p class="mt-1 text-sm text-dimmed break-all">
                {{ templateDraft.eventType }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="closeTemplateModal"
            />
          </div>
        </template>

        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Event type">
              <UInput
                :model-value="templateDraft.eventType"
                class="w-full"
                disabled
                readonly
              />
            </UFormField>
            <UFormField label="SendGrid template id">
              <UInput
                v-model="templateDraft.sendgridTemplateId"
                class="w-full"
                placeholder="d-xxxxxxxxxxxxxxxxxxxx"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Category">
              <select
                v-model="templateDraft.category"
                class="w-full rounded-md border border-default bg-default px-2.5 py-2 text-sm"
              >
                <option value="critical">critical</option>
                <option value="non_critical">non_critical</option>
              </select>
            </UFormField>

            <UFormField label="Description">
              <UInput
                v-model="templateDraft.description"
                class="w-full"
                placeholder="Optional"
              />
            </UFormField>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <UFormField label="Subject template">
              <UInput
                v-model="templateDraft.subjectTemplate"
                class="w-full"
                placeholder="FO Studio: {{ tierName }} membership update"
              />
            </UFormField>

            <UFormField label="Preheader template">
              <UInput
                v-model="templateDraft.preheaderTemplate"
                class="w-full"
                placeholder="{{ cadenceLabel }} plan update and next steps"
              />
            </UFormField>
          </div>

          <UFormField
            label="Body template (HTML)"
            description="Use {{ variableName }} tokens. This value is passed to SendGrid as {{ body }}."
          >
            <UEditor
              v-model="templateDraft.bodyTemplate"
              content-type="html"
              class="w-full min-h-[34rem] rounded-md border border-default [&_.ProseMirror]:min-h-[30rem]"
              placeholder="Write HTML body content. Example: <p>Your {{ tierName }} membership is active.</p>"
            />
          </UFormField>

          <div class="text-xs text-dimmed rounded-md border border-default bg-elevated/30 p-2">
            <div class="font-medium text-highlighted mb-1">Available variables</div>
            <div class="leading-relaxed break-words">
              <span
                v-for="variableName in selectedTemplateVariables"
                :key="`${templateDraft.eventType}-${variableName}`"
                class="inline-block mr-2 mb-1"
              >
                <code>{{ formatVariableToken(variableName) }}</code>
              </span>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3">
            <UCheckbox v-model="templateDraft.active" label="Active" />
            <div class="flex items-center gap-2">
              <UButton color="neutral" variant="soft" @click="closeTemplateModal">
                Cancel
              </UButton>
              <UButton :loading="saving" @click="saveTemplateFromModal">
                Save template settings
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
