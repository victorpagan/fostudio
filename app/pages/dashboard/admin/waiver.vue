<script setup lang="ts">
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

const { data, pending, refresh } = await useAsyncData('admin:waiver:templates', async () => {
  return await $fetch<{
    templates: WaiverTemplate[]
    activeTemplate: WaiverTemplate | null
  }>('/api/admin/waiver/templates')
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
const canPublishSelected = computed(() => Boolean(selectedTemplate.value && !selectedTemplate.value.is_active))

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

const getErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return 'Request failed.'
  if ('data' in error && error.data && typeof error.data === 'object') {
    const data = error.data as { statusMessage?: string; message?: string }
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
    const metadata = parseMetadataJson()
    const response = await $fetch<{ template: WaiverTemplate }>('/api/admin/waiver/templates', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        body: form.body.trim(),
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
    const metadata = parseMetadataJson()
    await $fetch<{ template: WaiverTemplate }>(`/api/admin/waiver/templates/${selectedTemplate.value.id}`, {
      method: 'PATCH',
      body: {
        title: form.title.trim(),
        body: form.body.trim(),
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
  if (!selectedTemplate.value) return
  if (!canPublishSelected.value) {
    toast.add({
      title: 'Select a draft to publish',
      description: 'The selected template is already active.',
      color: 'warning'
    })
    return
  }

  loadingPublishDraft.value = true
  try {
    await $fetch<{ template: WaiverTemplate }>(`/api/admin/waiver/templates/${selectedTemplate.value.id}/publish`, {
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
</script>

<template>
  <UDashboardPanel id="admin-waiver">
    <template #header>
      <UDashboardNavbar title="Waiver Templates" :ui="{ right: 'gap-2' }">
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
              <div class="text-xs uppercase tracking-wide text-dimmed">Active version</div>
              <div class="mt-1 font-medium">{{ activeTemplate ? `v${activeTemplate.version}` : '—' }}</div>
            </div>
            <div>
              <div class="text-xs uppercase tracking-wide text-dimmed">Published</div>
              <div class="mt-1">{{ formatDate(activeTemplate?.published_at ?? null) }}</div>
            </div>
            <div class="sm:col-span-2">
              <div class="text-xs uppercase tracking-wide text-dimmed">Title</div>
              <div class="mt-1 font-medium truncate">{{ activeTemplate?.title ?? 'No active template' }}</div>
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
              :disabled="!selectedTemplateId || !canPublishSelected"
              @click="publishDraft"
            >
              Publish Draft
            </UButton>
          </div>

          <div class="mt-4 grid gap-4">
            <UFormField label="Title">
              <UInput v-model="form.title" placeholder="Film Objektiv Member Waiver and Studio Rules" />
            </UFormField>

            <UFormField label="Waiver Body">
              <UTextarea
                v-model="form.body"
                :rows="18"
                autoresize
                placeholder="Paste waiver body text..."
              />
            </UFormField>

            <UFormField label="Metadata (JSON)">
              <UTextarea
                v-model="form.metadataJson"
                :rows="8"
                autoresize
                placeholder='{"documentKey":"member_waiver_v1"}'
              />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <div class="text-sm font-medium">Preview</div>
          <div class="mt-3 rounded-md border border-default p-4 whitespace-pre-wrap text-sm leading-6">
            {{ form.body || 'No waiver body content yet.' }}
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
