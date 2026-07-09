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
  errorMessage?: string | null
}>(), {
  description: null,
  currency: 'USD',
  confirmLabel: 'Pay now',
  busy: false,
  instanceKey: 'default',
  errorMessage: null
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [payload: { sourceId: string }]
  'clear-error': []
}>()

const localOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const loadingCardForm = ref(false)
const submitLoading = ref(false)
const awaitingPayment = ref(false)
const changingCard = ref(false)
const formError = ref<string | null>(null)
const cardReady = ref(false)
const cardContainer = ref<HTMLElement | null>(null)
const errorAlert = ref<HTMLElement | null>(null)

const containerId = computed(() => `square-card-container-${props.instanceKey}`)
const submitting = computed(() => submitLoading.value || awaitingPayment.value || props.busy)
const activeError = computed(() => formError.value ?? props.errorMessage)
const submitLabel = computed(() => activeError.value && cardReady.value ? 'Try payment again' : props.confirmLabel)

let cardHandle: {
  tokenize: () => Promise<{ status: string, token?: string, errors?: Array<{ code?: string, message?: string, detail?: string }> }>
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
  if (submitting.value || changingCard.value) return
  if (!cardHandle) {
    formError.value = 'Card form is not ready. Try again.'
    return
  }

  submitLoading.value = true
  formError.value = null
  if (props.errorMessage) emit('clear-error')
  try {
    const result = await cardHandle.tokenize()
    if (result.status !== 'OK' || !result.token) {
      const details = (result.errors ?? [])
        .map((entry) => {
          const code = entry.code?.trim() || 'UNKNOWN'
          const message = entry.detail?.trim() || entry.message?.trim() || 'No message'
          return `${code}: ${message}`
        })
        .join(' | ')

      console.error('[square/tokenize] failed', {
        status: result.status,
        errors: result.errors ?? []
      })

      formError.value = details || `Card tokenization failed (${result.status}).`
      return
    }
    awaitingPayment.value = true
    emit('confirm', { sourceId: result.token })
    await nextTick()
    if (!props.busy && localOpen.value) awaitingPayment.value = false
  } catch (error: unknown) {
    console.error('[square/tokenize] exception', error)
    formError.value = error instanceof Error ? error.message : 'Payment failed.'
  } finally {
    submitLoading.value = false
  }
}

async function changeCard() {
  if (submitting.value || changingCard.value) return

  changingCard.value = true
  formError.value = null
  if (props.errorMessage) emit('clear-error')
  try {
    await unmountCardForm()
    await mountCardForm()
    await nextTick()
    const focusTarget = cardContainer.value?.querySelector<HTMLElement>('iframe') ?? cardContainer.value
    focusTarget?.focus({ preventScroll: true })
  } finally {
    changingCard.value = false
  }
}

async function focusActiveError() {
  if (!localOpen.value || !activeError.value) return
  await nextTick()
  errorAlert.value?.focus({ preventScroll: true })
}

watch(() => localOpen.value, async (next) => {
  if (next) {
    await mountCardForm()
    await focusActiveError()
  } else {
    await unmountCardForm()
    formError.value = null
    awaitingPayment.value = false
  }
})

watch(activeError, async (next) => {
  if (next) await focusActiveError()
})

watch(() => props.busy, (next, previous) => {
  if (!next && previous) awaitingPayment.value = false
})

onBeforeUnmount(async () => {
  await unmountCardForm()
})
</script>

<template>
  <UModal
    v-model:open="localOpen"
    :dismissible="!submitting && !changingCard"
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
              aria-label="Close payment dialog"
              :disabled="submitting || changingCard"
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
              ref="cardContainer"
              class="rounded-lg border border-default bg-default p-3 min-h-16"
              tabindex="-1"
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
          <div
            v-if="activeError"
            ref="errorAlert"
            class="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            tabindex="-1"
          >
            <UAlert
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              title="Payment could not be completed"
              :description="activeError"
            />
            <p
              v-if="errorMessage && !formError"
              class="mt-2 text-sm text-dimmed"
            >
              Review or change the card details above, then try the payment again.
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              color="neutral"
              variant="soft"
              :disabled="submitting || changingCard"
              @click="localOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              v-if="errorMessage && cardReady"
              color="neutral"
              variant="soft"
              :loading="changingCard"
              :disabled="submitting || loadingCardForm"
              @click="changeCard"
            >
              Enter a different card
            </UButton>
            <UButton
              :loading="submitting"
              :disabled="!cardReady || loadingCardForm || changingCard"
              @click="submit"
            >
              {{ submitLabel }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
