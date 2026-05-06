<script setup lang="ts">
type EmailTemplateLookup = {
  templateId: string
  name: string
  resolvedFrom: 'active' | 'latest' | 'none'
  selectedVersion: {
    id: string
    name?: string
    active?: boolean
    subject: string
    updatedAt: string | null
  } | null
}

const props = withDefaults(defineProps<{
  html: string
  templateId: string
  lookup?: EmailTemplateLookup | null
  pending?: boolean
  error?: string | null
  title?: string
  refreshDisabled?: boolean
}>(), {
  lookup: null,
  pending: false,
  error: null,
  title: 'High-fidelity preview',
  refreshDisabled: false
})

const viewport = defineModel<'desktop' | 'mobile'>('viewport', { default: 'desktop' })
const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <section class="rounded-lg border border-default/80 bg-default/40 p-3 space-y-3">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="text-xs font-semibold uppercase tracking-wide text-dimmed">
          {{ props.title }}
        </div>
        <div class="mt-1 text-[11px] text-dimmed">
          Template id: <code>{{ props.templateId || '(not set)' }}</code>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          :loading="props.pending"
          :disabled="props.refreshDisabled || !props.templateId"
          @click="emit('refresh')"
        >
          Refresh now
        </UButton>
        <div class="flex items-center gap-1">
          <UButton
            size="xs"
            color="neutral"
            :variant="viewport === 'desktop' ? 'soft' : 'ghost'"
            icon="i-lucide-monitor"
            @click="viewport = 'desktop'"
          >
            Desktop
          </UButton>
          <UButton
            size="xs"
            color="neutral"
            :variant="viewport === 'mobile' ? 'soft' : 'ghost'"
            icon="i-lucide-smartphone"
            @click="viewport = 'mobile'"
          >
            Mobile
          </UButton>
        </div>
      </div>
    </div>

    <div
      v-if="props.error"
      class="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error"
    >
      {{ props.error }}
    </div>
    <div
      v-else-if="props.pending"
      class="rounded-md border border-default bg-default px-3 py-2 text-xs text-dimmed"
    >
      Fetching latest SendGrid template version...
    </div>
    <div
      v-else-if="props.lookup"
      class="space-y-1 rounded-md border border-default bg-default px-3 py-2 text-xs text-dimmed"
    >
      <div>
        Template: <code>{{ props.lookup.templateId }}</code>
        <template v-if="props.lookup.name">
          · {{ props.lookup.name }}
        </template>
      </div>
      <div>
        Version source: <strong>{{ props.lookup.resolvedFrom }}</strong>
        <template v-if="props.lookup.selectedVersion?.id">
          · version <code>{{ props.lookup.selectedVersion.id }}</code>
        </template>
      </div>
      <div>
        Subject: {{ props.lookup.selectedVersion?.subject || '(empty)' }}
      </div>
      <div v-if="props.lookup.selectedVersion?.updatedAt">
        Version updated {{ new Date(props.lookup.selectedVersion.updatedAt).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }) }}
      </div>
    </div>
    <div
      v-else
      class="rounded-md border border-default bg-default px-3 py-2 text-xs text-dimmed"
    >
      Set a SendGrid template id to fetch active/latest version details.
    </div>

    <div class="rounded-md border border-default bg-default p-2">
      <div
        class="mx-auto transition-all duration-150"
        :class="viewport === 'mobile' ? 'max-w-[390px]' : 'max-w-full'"
      >
        <iframe
          :srcdoc="props.html"
          class="w-full min-h-[560px] rounded-md border border-default/70 bg-white md:min-h-[760px]"
          sandbox="allow-scripts"
          title="Email preview"
        />
      </div>
    </div>

    <p class="text-xs text-dimmed">
      Preview uses fetched SendGrid template HTML when available.
      <template v-if="props.lookup?.selectedVersion">
        Version <code>{{ props.lookup.selectedVersion.id }}</code>
        <template v-if="props.lookup.selectedVersion.updatedAt">
          · updated {{ new Date(props.lookup.selectedVersion.updatedAt).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          }) }}
        </template>
      </template>
      <template v-else>
        Fallback shell is shown until a template version is available.
      </template>
    </p>
  </section>
</template>
