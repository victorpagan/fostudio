<script setup lang="ts">
import { toRenderableHtml } from '~~/app/utils/richText'

definePageMeta({ middleware: ['auth'] })

type WaiverStatus = 'current' | 'expired' | 'missing' | 'stale_version'

type WaiverCurrentResponse = {
  status: WaiverStatus
  renewalNeeded: boolean
  activeTemplate: {
    id: string
    version: number
    title: string
    body: string
    metadata: Record<string, unknown>
    publishedAt: string | null
    createdAt: string
  } | null
  latestSignature: {
    id: string
    signerName: string
    templateId: string
    templateVersion: number
    signedAt: string
    expiresAt: string
    consentFlags: Record<string, unknown>
  } | null
}

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const toast = useToast()

const signing = ref(false)
const form = reactive({
  signerName: '',
  accepted: false
})

const { data, pending, refresh } = await useAsyncData('waiver:current', async () => {
  return await $fetch<WaiverCurrentResponse>('/api/waiver/current')
})

onMounted(() => {
  void refresh()
})

const waiverStatus = computed<WaiverStatus>(() => data.value?.status ?? 'missing')
const activeTemplate = computed(() => data.value?.activeTemplate ?? null)
const latestSignature = computed(() => data.value?.latestSignature ?? null)
const isCurrent = computed(() => waiverStatus.value === 'current')
const canSign = computed(() => Boolean(activeTemplate.value && form.signerName.trim().length >= 2 && form.accepted))

const returnTo = computed(() => {
  const value = route.query.returnTo
  if (typeof value === 'string' && value.startsWith('/')) return value
  return '/dashboard/book'
})

watch(
  () => user.value,
  (value) => {
    if (!value || form.signerName.trim().length > 0) return
    const firstName = typeof value.user_metadata?.first_name === 'string' ? value.user_metadata.first_name : ''
    const lastName = typeof value.user_metadata?.last_name === 'string' ? value.user_metadata.last_name : ''
    const fullName = `${firstName} ${lastName}`.trim()
    if (fullName.length >= 2) {
      form.signerName = fullName
      return
    }
    if (typeof value.email === 'string' && value.email.length > 1) {
      form.signerName = value.email
    }
  },
  { immediate: true }
)

const statusLabel = (status: WaiverStatus) => {
  if (status === 'current') return 'Current'
  if (status === 'expired') return 'Expired'
  if (status === 'stale_version') return 'Needs re-sign'
  return 'Missing'
}

const statusColor = (status: WaiverStatus) => {
  if (status === 'current') return 'success'
  if (status === 'expired') return 'warning'
  return 'error'
}

const statusDescription = computed(() => {
  if (waiverStatus.value === 'current') return 'Your waiver is valid for booking.'
  if (waiverStatus.value === 'expired') return 'Your waiver expired. Sign again to continue booking.'
  if (waiverStatus.value === 'stale_version') return 'A new waiver version is active. Re-sign before booking.'
  return 'No waiver signature found for your account.'
})

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US')
}

function getErrorMessage(error: unknown) {
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

async function signWaiver() {
  if (!canSign.value || signing.value) return
  signing.value = true
  try {
    await $fetch('/api/waiver/sign', {
      method: 'POST',
      body: {
        signerName: form.signerName.trim(),
        accepted: form.accepted
      }
    })
    form.accepted = false
    await refresh()
    toast.add({ title: 'Waiver signed', color: 'success' })
  } catch (error: unknown) {
    toast.add({
      title: 'Could not sign waiver',
      description: getErrorMessage(error),
      color: 'error'
    })
  } finally {
    signing.value = false
  }
}
</script>

<template>
  <UDashboardPanel
    id="waiver"
    class="min-h-0 flex-1 admin-ops-panel"
    :ui="{ body: '!overflow-hidden !p-0 !gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        title="Member Waiver"
        class="admin-ops-navbar"
        :ui="{ root: 'border-b-0' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <AdminOpsShell>
        <div class="space-y-4 max-w-4xl">
          <UCard>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium">
                  Waiver status
                </div>
                <p class="text-sm text-dimmed mt-1">
                  {{ statusDescription }}
                </p>
              </div>
              <UBadge
                :color="statusColor(waiverStatus)"
                variant="soft"
              >
                {{ statusLabel(waiverStatus) }}
              </UBadge>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Signed at
                </div>
                <div class="mt-1">
                  {{ formatDate(latestSignature?.signedAt) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Expires at
                </div>
                <div class="mt-1">
                  {{ formatDate(latestSignature?.expiresAt) }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Signed version
                </div>
                <div class="mt-1">
                  {{ latestSignature?.templateVersion ?? '—' }}
                </div>
              </div>
              <div>
                <div class="text-xs uppercase tracking-wide text-dimmed">
                  Active version
                </div>
                <div class="mt-1">
                  {{ activeTemplate?.version ?? '—' }}
                </div>
              </div>
            </div>
          </UCard>

          <UCard v-if="activeTemplate">
            <template #header>
              <div>
                <div class="text-base font-semibold">
                  {{ activeTemplate.title }}
                </div>
                <div class="text-xs text-dimmed mt-1">
                  Version {{ activeTemplate.version }} · Published {{ formatDate(activeTemplate.publishedAt) }}
                </div>
              </div>
            </template>

            <div
              class="waiver-rich-content max-w-none rounded-md border border-default bg-white text-slate-900 p-4 text-sm leading-6 max-h-[50vh] overflow-y-auto"
              v-html="toRenderableHtml(activeTemplate.body)"
            />

            <div class="mt-4 space-y-3">
              <UFormField label="Legal full name">
                <UInput
                  v-model="form.signerName"
                  placeholder="Enter your legal full name"
                />
              </UFormField>

              <UCheckbox
                v-model="form.accepted"
                label="I have read and agree to the waiver terms and studio rules."
              />

              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  icon="i-lucide-pen-line"
                  :loading="signing"
                  :disabled="!canSign"
                  @click="signWaiver"
                >
                  {{ isCurrent ? 'Re-sign waiver' : 'Sign waiver' }}
                </UButton>

                <UButton
                  v-if="isCurrent"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-right"
                  @click="router.push(returnTo)"
                >
                  Continue
                </UButton>
              </div>
            </div>
          </UCard>

          <UAlert
            v-else-if="!pending"
            color="error"
            variant="soft"
            title="No active waiver template"
            description="An active waiver has not been published yet. Please contact support."
          />
        </div>
      </AdminOpsShell>
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
</style>
