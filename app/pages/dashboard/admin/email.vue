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
const sendingTest = ref(false)
const pending = ref(false)
const recipientsInput = ref('')
const testRecipient = ref('')
const templates = ref<AdminMailTemplate[]>([])
const availableVariablesByEvent = ref<Record<string, string[]>>({ '*': [] })
const templateModalOpen = ref(false)
const editingTemplateIndex = ref<number | null>(null)
const templateDraft = ref<AdminMailTemplate | null>(null)

const adminCopies = reactive({
  criticalEnabled: true,
  nonCriticalEnabled: false
})

function applySettings(res: AdminEmailSettingsResponse) {
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
}

async function loadSettings(options: { silent?: boolean } = {}) {
  pending.value = true
  try {
    const res = await $fetch<AdminEmailSettingsResponse>('/api/admin/email/settings')
    applySettings(res)
  } catch (error: unknown) {
    if (!options.silent) {
      toast.add({
        title: 'Could not load email settings',
        description: readErrorMessage(error),
        color: 'error'
      })
    }
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  void loadSettings({ silent: true })
})

const selectedTemplateVariables = computed(() => {
  const draft = templateDraft.value
  if (!draft) return [] as string[]

  const common = availableVariablesByEvent.value['*'] ?? []
  const specific = draft.eventType ? (availableVariablesByEvent.value[draft.eventType] ?? []) : []
  return [...new Set([...common, ...specific])]
})

const emailEditorToolbarItems = [[{
  kind: 'undo',
  icon: 'i-lucide-undo',
  tooltip: { text: 'Undo' }
}, {
  kind: 'redo',
  icon: 'i-lucide-redo',
  tooltip: { text: 'Redo' }
}], [{
  icon: 'i-lucide-heading',
  tooltip: { text: 'Headings' },
  content: { align: 'start' },
  items: [{
    kind: 'paragraph',
    label: 'Paragraph',
    icon: 'i-lucide-pilcrow'
  }, {
    kind: 'heading',
    level: 1,
    icon: 'i-lucide-heading-1',
    label: 'Heading 1'
  }, {
    kind: 'heading',
    level: 2,
    icon: 'i-lucide-heading-2',
    label: 'Heading 2'
  }, {
    kind: 'heading',
    level: 3,
    icon: 'i-lucide-heading-3',
    label: 'Heading 3'
  }, {
    kind: 'heading',
    level: 4,
    icon: 'i-lucide-heading-4',
    label: 'Heading 4'
  }]
}, {
  icon: 'i-lucide-list',
  tooltip: { text: 'Lists' },
  content: { align: 'start' },
  items: [{
    kind: 'bulletList',
    icon: 'i-lucide-list',
    label: 'Bullet list'
  }, {
    kind: 'orderedList',
    icon: 'i-lucide-list-ordered',
    label: 'Ordered list'
  }]
}, {
  kind: 'blockquote',
  icon: 'i-lucide-text-quote',
  tooltip: { text: 'Blockquote' }
}, {
  kind: 'codeBlock',
  icon: 'i-lucide-square-code',
  tooltip: { text: 'Code block' }
}], [{
  kind: 'mark',
  mark: 'bold',
  icon: 'i-lucide-bold',
  tooltip: { text: 'Bold' }
}, {
  kind: 'mark',
  mark: 'italic',
  icon: 'i-lucide-italic',
  tooltip: { text: 'Italic' }
}, {
  kind: 'mark',
  mark: 'underline',
  icon: 'i-lucide-underline',
  tooltip: { text: 'Underline' }
}, {
  kind: 'mark',
  mark: 'strike',
  icon: 'i-lucide-strikethrough',
  tooltip: { text: 'Strikethrough' }
}, {
  kind: 'mark',
  mark: 'code',
  icon: 'i-lucide-code',
  tooltip: { text: 'Inline code' }
}], [{
  kind: 'link',
  icon: 'i-lucide-link',
  tooltip: { text: 'Link' }
}, {
  kind: 'horizontalRule',
  icon: 'i-lucide-separator-horizontal',
  tooltip: { text: 'Horizontal rule' }
}, {
  icon: 'i-lucide-align-justify',
  tooltip: { text: 'Text align' },
  content: { align: 'end' },
  items: [{
    kind: 'textAlign',
    align: 'left',
    icon: 'i-lucide-align-left',
    label: 'Align left'
  }, {
    kind: 'textAlign',
    align: 'center',
    icon: 'i-lucide-align-center',
    label: 'Align center'
  }, {
    kind: 'textAlign',
    align: 'right',
    icon: 'i-lucide-align-right',
    label: 'Align right'
  }, {
    kind: 'textAlign',
    align: 'justify',
    icon: 'i-lucide-align-justify',
    label: 'Align justify'
  }]
}, {
  kind: 'clearFormatting',
  icon: 'i-lucide-eraser',
  tooltip: { text: 'Clear formatting' }
}]]

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
  const fallbackRecipient = parseRecipients(recipientsInput.value)[0] ?? ''
  testRecipient.value = fallbackRecipient
  templateModalOpen.value = true
}

function closeTemplateModal() {
  templateModalOpen.value = false
  editingTemplateIndex.value = null
  templateDraft.value = null
  testRecipient.value = ''
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
    await loadSettings({ silent: true })
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

async function sendTemplateTest() {
  const draft = templateDraft.value
  if (!draft) return

  sendingTest.value = true
  try {
    const res = await $fetch<{
      recipient: string
      mailer?: { skipped_reason?: string }
      isActive: boolean
    }>('/api/admin/email/test', {
      method: 'POST',
      body: {
        eventType: draft.eventType,
        recipient: testRecipient.value.trim() || undefined
      }
    })

    const skippedReason = res.mailer?.skipped_reason
    if (skippedReason) {
      toast.add({
        title: 'Test send skipped',
        description: `Reason: ${skippedReason}. ${res.isActive ? '' : 'This registry event is inactive.'}`.trim(),
        color: 'warning'
      })
      return
    }

    toast.add({
      title: 'Test email sent',
      description: `Sent to ${res.recipient}`,
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not send test email',
      description: readErrorMessage(error),
      color: 'error'
    })
  } finally {
    sendingTest.value = false
  }
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="admin-email-settings">
      <template #header>
        <UDashboardNavbar
          title="Email Settings"
          :ui="{ right: 'gap-2' }"
        >
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
              @click="() => loadSettings()"
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
                  <div class="text-sm font-medium">
                    Critical email copies
                  </div>
                  <div class="text-xs text-dimmed">
                    Forward a copy of critical notifications to admin inboxes.
                  </div>
                </div>
                <USwitch v-model="adminCopies.criticalEnabled" />
              </div>

              <div class="flex items-center justify-between gap-3 rounded-lg border border-default px-3 py-2">
                <div>
                  <div class="text-sm font-medium">
                    Non-critical email copies
                  </div>
                  <div class="text-xs text-dimmed">
                    Keep disabled by default to reduce noise.
                  </div>
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
                <UButton
                  :loading="saving"
                  @click="saveSettings()"
                >
                  Save admin copy settings
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="space-y-4">
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-medium">
                  SendGrid template registry
                </div>
                <div class="text-xs text-dimmed">
                  Event list is preloaded. Open a row and set the template id.
                </div>
              </div>

              <div
                v-if="templates.length === 0"
                class="text-sm text-dimmed"
              >
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

    <UModal
      v-model:open="templateModalOpen"
      title="Edit template mapping"
      description="Configure SendGrid mapping, copy templates, and tokens."
      :ui="{ content: 'sm:max-w-5xl' }"
    >
      <template #content>
        <UCard
          v-if="templateDraft"
          class="w-[calc(100vw-2rem)] max-w-5xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] overflow-hidden ring-1 ring-primary/25"
          :ui="{ body: 'space-y-4 overflow-y-auto max-h-[calc(100dvh-14rem)] bg-elevated/20' }"
        >
          <template #header>
            <div class="flex items-start justify-between gap-3 rounded-md border border-primary/20 bg-primary/8 px-3 py-2">
              <div class="min-w-0">
                <div class="text-base font-semibold text-highlighted">
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

          <div class="space-y-3">
            <div class="rounded-lg border border-primary/20 bg-default/80 p-3">
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
            </div>

            <div class="rounded-lg border border-info/25 bg-info/8 p-3">
              <div class="grid gap-3 md:grid-cols-2">
                <UFormField label="Category">
                  <select
                    v-model="templateDraft.category"
                    class="w-full rounded-md border border-default bg-elevated px-2.5 py-2 text-sm"
                  >
                    <option value="critical">
                      critical
                    </option>
                    <option value="non_critical">
                      non_critical
                    </option>
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
            </div>

            <div class="rounded-lg border border-success/25 bg-success/8 p-3">
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
            </div>

            <div class="rounded-lg border border-info/25 bg-info/8 p-3">
              <UFormField
                label="Test recipient"
                description="Optional. If blank, this sends to your admin account email."
              >
                <UInput
                  v-model="testRecipient"
                  class="w-full"
                  placeholder="name@example.com"
                />
              </UFormField>
            </div>

            <div class="rounded-lg border border-warning/25 bg-warning/7 p-3">
              <UFormField label="Event type">
                <template #label>
                  <span class="text-warning-700 dark:text-warning-300">Body template (HTML)</span>
                </template>
                <template #description>
                  Use <code v-pre>{{ variableName }}</code> tokens. This value is passed to SendGrid as <code v-pre>{{ body }}</code>.
                </template>
                <UEditor
                  v-model="templateDraft.bodyTemplate"
                  content-type="html"
                  class="w-full rounded-md border border-warning/30 bg-default [&_.ProseMirror]:min-h-[24rem] [&_.tiptap.ProseMirror]:min-h-[24rem]"
                  placeholder="Write HTML body content. Example: <p>Your {{ tierName }} membership is active.</p>"
                >
                  <template #default="{ editor }">
                    <UEditorToolbar
                      :editor="editor"
                      :items="emailEditorToolbarItems"
                      class="border-b border-warning/25 sticky top-0 inset-x-0 p-1.5 z-10 bg-warning/8 backdrop-blur overflow-x-auto"
                    />
                  </template>
                </UEditor>
              </UFormField>
            </div>

            <div class="text-xs text-dimmed rounded-md border border-primary/25 bg-primary/8 p-2.5">
              <div class="font-medium text-highlighted mb-1.5">
                Available variables
              </div>
              <div class="leading-relaxed break-words">
                <span
                  v-for="variableName in selectedTemplateVariables"
                  :key="`${templateDraft.eventType}-${variableName}`"
                  class="inline-block mr-2 mb-1 rounded bg-default/90 px-1.5 py-0.5 ring-1 ring-primary/20"
                >
                  <code>{{ formatVariableToken(variableName) }}</code>
                </span>
              </div>
            </div>

            <div>
              <UCheckbox
                v-model="templateDraft.active"
                label="Active"
              />
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="soft"
                @click="closeTemplateModal"
              >
                Cancel
              </UButton>
              <UButton
                color="info"
                variant="soft"
                icon="i-lucide-send"
                :loading="sendingTest"
                :disabled="!templateDraft || !hasTemplateId(templateDraft)"
                @click="sendTemplateTest"
              >
                Send test email
              </UButton>
              <UButton
                :loading="saving"
                @click="saveTemplateFromModal"
              >
                Save template settings
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
