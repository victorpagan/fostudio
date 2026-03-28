<script setup lang="ts">
import { toRenderableHtml } from '~~/app/utils/richText'

definePageMeta({ middleware: ['admin'] })

type WaiverTemplate = {
  id: string
  version: number
  title: string
  body: string
  metadata: Record<string, unknown> | null
  is_active: boolean
  published_at: string | null
  created_at: string
}

const toast = useToast()

const loadingCreateDraft = ref(false)
const loadingSaveDraft = ref(false)
const loadingPublishDraft = ref(false)
const selectedTemplateId = ref<string | undefined>()

const form = reactive({
  title: '',
  body: '',
  metadataJson: '{}'
})

const waiverEditorToolbarItems = [[{
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
  kind: 'image',
  icon: 'i-lucide-image',
  tooltip: { text: 'Insert image URL' }
}, {
  kind: 'mention',
  icon: 'i-lucide-at-sign',
  tooltip: { text: 'Mention menu' }
}, {
  kind: 'emoji',
  icon: 'i-lucide-smile',
  tooltip: { text: 'Emoji menu' }
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

const waiverEditorBubbleToolbarItems = [[{
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
  kind: 'image',
  icon: 'i-lucide-image',
  tooltip: { text: 'Insert image URL' }
}, {
  kind: 'clearFormatting',
  icon: 'i-lucide-eraser',
  tooltip: { text: 'Clear formatting' }
}]]

const waiverSuggestionItems = [[
  {
    label: 'Paragraph',
    description: 'Start with plain text',
    icon: 'i-lucide-pilcrow',
    kind: 'paragraph'
  },
  {
    label: 'Heading 2',
    description: 'Section heading',
    icon: 'i-lucide-heading-2',
    kind: 'heading',
    level: 2
  },
  {
    label: 'Bullet List',
    description: 'Add list items',
    icon: 'i-lucide-list',
    kind: 'bulletList'
  },
  {
    label: 'Numbered List',
    description: 'Add ordered steps',
    icon: 'i-lucide-list-ordered',
    kind: 'orderedList'
  },
  {
    label: 'Quote',
    description: 'Insert blockquote',
    icon: 'i-lucide-text-quote',
    kind: 'blockquote'
  },
  {
    label: 'Divider',
    description: 'Insert horizontal rule',
    icon: 'i-lucide-separator-horizontal',
    kind: 'horizontalRule'
  },
  {
    label: 'Image (URL)',
    description: 'Insert image from URL',
    icon: 'i-lucide-image',
    kind: 'image'
  }
]]

const waiverMentionItems = [
  {
    id: 'member',
    label: 'Member',
    description: 'Registered studio member',
    icon: 'i-lucide-user-round'
  },
  {
    id: 'guest',
    label: 'Guest',
    description: 'Guest under member supervision',
    icon: 'i-lucide-user-round-plus'
  },
  {
    id: 'support',
    label: 'Studio Support',
    description: 'hello@lafilmlab.com',
    icon: 'i-lucide-mail'
  }
]

const waiverEmojiItems = [
  { name: 'Check', emoji: '✅', shortcodes: ['check'], tags: ['approved'] },
  { name: 'Warning', emoji: '⚠️', shortcodes: ['warning'], tags: ['risk'] },
  { name: 'No Entry', emoji: '⛔', shortcodes: ['no_entry'], tags: ['prohibited'] },
  { name: 'Camera', emoji: '📷', shortcodes: ['camera'], tags: ['studio'] },
  { name: 'Clipboard', emoji: '📋', shortcodes: ['clipboard'], tags: ['rules'] },
  { name: 'Lock', emoji: '🔒', shortcodes: ['lock'], tags: ['security'] }
]

const { data, pending, refresh } = await useAsyncData('admin:waiver:templates', async () => {
  return await $fetch<{
    templates: WaiverTemplate[]
    activeTemplate: WaiverTemplate | null
  }>('/api/admin/waiver/templates')
})

onMounted(() => {
  void refresh()
})

const templates = computed(() => data.value?.templates ?? [])
const activeTemplate = computed(() => data.value?.activeTemplate ?? null)

const templateItems = computed(() =>
  templates.value.map(template => ({
    label: `v${template.version} · ${template.title}${template.is_active ? ' (active)' : ''}`,
    value: template.id
  }))
)

const selectedTemplate = computed(() =>
  templates.value.find(template => template.id === selectedTemplateId.value) ?? null
)

const canEditSelected = computed(() => Boolean(selectedTemplate.value && !selectedTemplate.value.is_active))
const firstDraftTemplate = computed(() => templates.value.find(template => !template.is_active) ?? null)
const canPublishAnyDraft = computed(() => Boolean(firstDraftTemplate.value))

function toMetadataJson(metadata: Record<string, unknown> | null | undefined) {
  return JSON.stringify(metadata ?? {}, null, 2)
}

function hydrateForm(template: WaiverTemplate | null) {
  if (!template) {
    form.title = ''
    form.body = ''
    form.metadataJson = '{}'
    return
  }

  form.title = template.title
  form.body = template.body
  form.metadataJson = toMetadataJson(template.metadata)
}

function ensureSelectionFromData() {
  if (!templates.value.length) {
    selectedTemplateId.value = undefined
    hydrateForm(null)
    return
  }

  if (selectedTemplateId.value && templates.value.some(template => template.id === selectedTemplateId.value)) {
    hydrateForm(selectedTemplate.value)
    return
  }

  const draftTemplate = templates.value.find(template => !template.is_active) ?? null
  const nextTemplate = draftTemplate ?? activeTemplate.value ?? templates.value[0] ?? null
  selectedTemplateId.value = nextTemplate?.id
  hydrateForm(nextTemplate)
}

watch(templates, () => {
  ensureSelectionFromData()
}, { immediate: true })

watch(selectedTemplateId, () => {
  hydrateForm(selectedTemplate.value)
})

function parseMetadataJson() {
  try {
    const parsed = JSON.parse(form.metadataJson || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Metadata must be a JSON object.')
    }
    return parsed as Record<string, unknown>
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid metadata JSON.'
    throw new Error(message)
  }
}

function getBodyHtml(value: unknown) {
  return toRenderableHtml(value)
}

const getErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return 'Request failed.'
  if ('data' in error && error.data && typeof error.data === 'object') {
    const data = error.data as { statusMessage?: string, message?: string }
    if (typeof data.statusMessage === 'string') return data.statusMessage
    if (typeof data.message === 'string') return data.message
  }
  if ('statusMessage' in error && typeof error.statusMessage === 'string') return error.statusMessage
  if ('message' in error && typeof error.message === 'string') return error.message
  return 'Request failed.'
}

async function createDraft() {
  loadingCreateDraft.value = true
  try {
    const bodyHtml = getBodyHtml(form.body).trim()
    const metadata = parseMetadataJson()
    const response = await $fetch<{ template: WaiverTemplate }>('/api/admin/waiver/templates', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        body: bodyHtml,
        metadata
      }
    })
    await refresh()
    selectedTemplateId.value = response.template.id
    toast.add({ title: 'Waiver draft created', color: 'success' })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not create draft',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    loadingCreateDraft.value = false
  }
}

async function saveDraft() {
  if (!selectedTemplate.value) return
  if (!canEditSelected.value) {
    toast.add({
      title: 'Active template is immutable',
      description: 'Create a new draft to make changes.',
      color: 'warning'
    })
    return
  }

  loadingSaveDraft.value = true
  try {
    const bodyHtml = getBodyHtml(form.body).trim()
    const metadata = parseMetadataJson()
    await $fetch<{ template: WaiverTemplate }>(`/api/admin/waiver/templates/${selectedTemplate.value.id}`, {
      method: 'PATCH',
      body: {
        title: form.title.trim(),
        body: bodyHtml,
        metadata
      }
    })
    await refresh()
    toast.add({ title: 'Waiver draft saved', color: 'success' })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not save draft',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    loadingSaveDraft.value = false
  }
}

async function publishDraft() {
  const draftToPublish = selectedTemplate.value && !selectedTemplate.value.is_active
    ? selectedTemplate.value
    : firstDraftTemplate.value

  if (!draftToPublish) {
    toast.add({
      title: 'Select a draft to publish',
      description: 'Create a new draft before publishing.',
      color: 'warning'
    })
    return
  }

  loadingPublishDraft.value = true
  try {
    await $fetch<{ template: WaiverTemplate }>(`/api/admin/waiver/templates/${draftToPublish.id}/publish`, {
      method: 'POST'
    })
    await refresh()
    toast.add({
      title: 'Waiver template published',
      description: 'Members must re-sign before booking on the new version.',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not publish template',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    loadingPublishDraft.value = false
  }
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US')
}

function normalizeWaiverBodyHtml(value: unknown) {
  return toRenderableHtml(value)
}

const previewBodyHtml = computed(() => normalizeWaiverBodyHtml(form.body))

function hasPreviewBody(value: unknown) {
  return getBodyHtml(value).trim().length > 0
}
</script>

<template>
  <UDashboardPanel id="admin-waiver">
    <template #header>
      <UDashboardNavbar
        title="Waiver Templates"
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
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-file-signature"
          title="Publishing invalidates prior signatures"
          description="When a new waiver version is published, all members must re-sign before booking."
        />

        <UCard>
          <div class="grid gap-3 sm:grid-cols-4 text-sm">
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Active version
              </div>
              <div class="mt-1 font-medium">
                {{ activeTemplate ? `v${activeTemplate.version}` : '—' }}
              </div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Published
              </div>
              <div class="mt-1">
                {{ formatDate(activeTemplate?.published_at ?? null) }}
              </div>
            </div>
            <div class="sm:col-span-2">
              <div class="text-xs uppercase tracking-wide text-dimmed">
                Title
              </div>
              <div class="mt-1 font-medium truncate">
                {{ activeTemplate?.title ?? 'No active template' }}
              </div>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <UFormField label="Template">
              <USelect
                v-model="selectedTemplateId"
                :items="templateItems"
                placeholder="Select template"
              />
            </UFormField>

            <UButton
              icon="i-lucide-save"
              :loading="loadingSaveDraft"
              :disabled="!selectedTemplateId || !canEditSelected"
              @click="saveDraft"
            >
              Save Draft
            </UButton>

            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="soft"
              :loading="loadingCreateDraft"
              @click="createDraft"
            >
              Create New Draft
            </UButton>

            <UButton
              icon="i-lucide-upload"
              color="warning"
              :loading="loadingPublishDraft"
              :disabled="!canPublishAnyDraft"
              @click="publishDraft"
            >
              Publish Draft
            </UButton>
          </div>

          <div class="mt-4 grid gap-4">
            <UFormField
              label="Title"
              class="w-full"
            >
              <UInput
                v-model="form.title"
                class="w-full max-w-none"
                placeholder="Film Objektiv Member Waiver and Studio Rules"
              />
            </UFormField>

            <UFormField
              label="Waiver Body"
              class="w-full"
            >
              <template #description>
                Rich text/HTML supported for member-facing waiver copy.
              </template>
              <UEditor
                v-slot="{ editor }"
                v-model="form.body"
                content-type="html"
                :image="{ allowBase64: false }"
                :mention="{ HTMLAttributes: { class: 'mention' } }"
                :ui="{ base: 'px-4 py-4 md:px-5 md:py-5' }"
                class="waiver-editor-shell w-full max-w-none rounded-md border border-default bg-default overflow-hidden"
                placeholder="Write waiver content..."
              >
                <UEditorToolbar
                  :editor="editor"
                  :items="waiverEditorToolbarItems"
                  class="sticky top-0 inset-x-0 z-10 border-b border-default bg-default/95 p-1.5 backdrop-blur overflow-x-auto"
                />
                <UEditorToolbar
                  :editor="editor"
                  :items="waiverEditorBubbleToolbarItems"
                  layout="bubble"
                />
                <UEditorDragHandle :editor="editor" />
                <UEditorSuggestionMenu
                  :editor="editor"
                  :items="waiverSuggestionItems"
                />
                <UEditorMentionMenu
                  :editor="editor"
                  :items="waiverMentionItems"
                />
                <UEditorEmojiMenu
                  :editor="editor"
                  :items="waiverEmojiItems"
                />
              </UEditor>
              <p class="mt-2 text-xs text-dimmed">
                Enter creates a new paragraph. Use Shift+Enter for a single line break.
              </p>
            </UFormField>

            <UFormField label="Metadata (JSON)">
              <UTextarea
                v-model="form.metadataJson"
                :rows="8"
                autoresize
                placeholder="{&quot;documentKey&quot;:&quot;member_waiver_v1&quot;}"
              />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <div class="text-sm font-medium">
            Preview
          </div>
          <div
            class="waiver-rich-content mt-3 max-w-none rounded-md border border-default p-4 text-sm leading-6"
            v-html="previewBodyHtml"
          />
          <div
            v-if="!hasPreviewBody(form.body)"
            class="mt-2 text-xs text-dimmed"
          >
            No waiver body content yet.
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.waiver-rich-content :deep(p) {
  margin: 0 0 0.9rem;
}

.waiver-rich-content :deep(ul) {
  list-style: disc;
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.waiver-rich-content :deep(ol) {
  list-style: decimal;
  margin: 0 0 1rem;
  padding-left: 1.25rem;
}

.waiver-rich-content :deep(li) {
  margin: 0.2rem 0;
}

.waiver-rich-content :deep(h1),
.waiver-rich-content :deep(h2),
.waiver-rich-content :deep(h3),
.waiver-rich-content :deep(h4),
.waiver-rich-content :deep(h5),
.waiver-rich-content :deep(h6) {
  font-weight: 600;
  line-height: 1.25;
  margin: 1rem 0 0.6rem;
}

.waiver-rich-content :deep(h1) {
  font-size: 1.5rem;
}

.waiver-rich-content :deep(h2) {
  font-size: 1.25rem;
}

.waiver-rich-content :deep(h3) {
  font-size: 1.125rem;
}

.waiver-rich-content :deep(h4) {
  font-size: 1rem;
}

.waiver-rich-content :deep(h5) {
  font-size: 0.925rem;
}

.waiver-rich-content :deep(h6) {
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.waiver-rich-content :deep(blockquote) {
  border-left: 3px solid var(--ui-border-muted);
  margin: 0 0 1rem;
  padding-left: 0.85rem;
  color: var(--ui-text-muted);
}

.waiver-rich-content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}

.waiver-rich-content :deep(pre) {
  overflow-x: auto;
  border-radius: 0.375rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  padding: 0.75rem;
  margin: 0 0 1rem;
}

.waiver-rich-content :deep(hr) {
  border: 0;
  border-top: 1px solid var(--ui-border);
  margin: 1rem 0;
}

.waiver-rich-content :deep(p:last-child),
.waiver-rich-content :deep(ul:last-child),
.waiver-rich-content :deep(ol:last-child),
.waiver-rich-content :deep(blockquote:last-child),
.waiver-rich-content :deep(pre:last-child) {
  margin-bottom: 0;
}

.waiver-editor-shell :deep(.tiptap.ProseMirror),
.waiver-editor-shell :deep(.ProseMirror) {
  min-height: 20rem;
  max-height: 34rem;
  overflow-y: auto;
  padding: 0.85rem;
}
</style>
