<script setup lang="ts">
import { createSquareCardHandle } from '~~/app/composables/useSquareWebPayments'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string | null
  amountCents: number
  currency?: string
  confirmLabel?: string
  busy?: boolean
  instanceKey?: string
}>(), {
  description: null,
  currency: 'USD',
  confirmLabel: 'Pay now',
  busy: false,
  instanceKey: 'default'
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [payload: { sourceId: string }]
}>()

const localOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const loadingCardForm = ref(false)
const submitLoading = ref(false)
const formError = ref<string | null>(null)
const cardReady = ref(false)

const containerId = computed(() => `square-card-container-${props.instanceKey}`)

let cardHandle: {
  tokenize: () => Promise<{ status: string, token?: string, errors?: Array<{ message?: string }> }>
  destroy?: () => Promise<void> | void
} | null = null

const formattedAmount = computed(() => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: props.currency }).format((props.amountCents || 0) / 100)
})

async function mountCardForm() {
  if (!localOpen.value || cardHandle || import.meta.server) return
  loadingCardForm.value = true
  formError.value = null
  cardReady.value = false
  try {
    await nextTick()
    cardHandle = await createSquareCardHandle(`#${containerId.value}`)
    cardReady.value = true
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initialize card entry.'
    formError.value = message
  } finally {
    loadingCardForm.value = false
  }
}

async function unmountCardForm() {
  if (!cardHandle) return
  try {
    await cardHandle.destroy?.()
  } catch {
    // no-op
  } finally {
    cardHandle = null
    cardReady.value = false
  }
}

async function submit() {
  if (submitLoading.value || props.busy) return
  if (!cardHandle) {
    formError.value = 'Card form is not ready. Try again.'
    return
  }

  submitLoading.value = true
  formError.value = null
  try {
    const result = await cardHandle.tokenize()
    if (result.status !== 'OK' || !result.token) {
      const firstError = result.errors?.[0]?.message ?? 'Card tokenization failed.'
      formError.value = firstError
      return
    }
    emit('confirm', { sourceId: result.token })
  } catch (error: unknown) {
    formError.value = error instanceof Error ? error.message : 'Payment failed.'
  } finally {
    submitLoading.value = false
  }
}

watch(() => localOpen.value, async (next) => {
  if (next) {
    await mountCardForm()
  } else {
    await unmountCardForm()
    formError.value = null
  }
})

onBeforeUnmount(async () => {
  await unmountCardForm()
})
</script>

<template>
  <UModal
    v-model:open="localOpen"
    :dismissible="!submitLoading && !busy"
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-base font-semibold">
                {{ title }}
              </div>
              <p
                v-if="description"
                class="mt-1 text-sm text-dimmed"
              >
                {{ description }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="submitLoading || busy"
              @click="localOpen = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <div class="rounded-lg border border-default bg-muted/20 p-3">
            <div class="text-xs uppercase tracking-wide text-dimmed">
              Amount
            </div>
            <div class="mt-1 text-lg font-semibold">
              {{ formattedAmount }}
            </div>
          </div>

          <div>
            <div class="mb-2 text-xs uppercase tracking-wide text-dimmed">
              Card details
            </div>
            <div
              :id="containerId"
              class="rounded-lg border border-default bg-default p-3 min-h-16"
            />
          </div>

          <UAlert
            v-if="loadingCardForm"
            color="neutral"
            variant="soft"
            icon="i-lucide-loader-circle"
            title="Loading secure card form..."
          />
          <UAlert
            v-else-if="!cardReady"
            color="warning"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Card form not ready yet."
          />
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :title="formError"
          />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="submitLoading || busy"
              @click="localOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              :loading="submitLoading || busy"
              :disabled="!cardReady || loadingCardForm"
              @click="submit"
            >
              {{ confirmLabel }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
