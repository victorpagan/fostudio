<script setup lang="ts">
import { resolveMembershipUiState } from '~~/app/utils/membershipStatus'

definePageMeta({ middleware: ['auth'] })

type MembershipRow = {
  status: string | null
  current_period_end: string | null
  canceled_at: string | null
}

type ReferralSummaryResponse = {
  code: string
  active: boolean
  stats: {
    awardedCount: number
    pendingCount: number
    rejectedCount: number
    totalCreditsAwarded: number
  }
  recent: Array<{
    id: string
    status: string
    rejectionReason: string | null
    referredUserId: string | null
    referrerCreditsAwarded: number
    createdAt: string
    awardedAt: string | null
  }>
}

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const toast = useToast()

const copyingReferralCode = ref(false)

const { data: membership } = await useAsyncData('dash:referrals:membership', async () => {
  if (!user.value?.sub) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('status,current_period_end,canceled_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data as MembershipRow | null
}, { watch: [() => user.value?.sub] })

const membershipState = computed(() => resolveMembershipUiState(membership.value))
const hasActiveMembership = computed(() => membershipState.value === 'active')

const { data: referralSummary, refresh, pending } = await useAsyncData('dash:referrals:summary', async () => {
  if (!user.value?.sub) return null
  return await $fetch<ReferralSummaryResponse>('/api/referrals/me')
}, { watch: [() => user.value?.sub], server: false })

function formatCredits(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function referralStatusColor(status: string) {
  if (status === 'awarded') return 'success'
  if (status === 'rejected') return 'error'
  return 'neutral'
}

async function copyReferralCode() {
  if (!referralSummary.value?.code || copyingReferralCode.value) return
  copyingReferralCode.value = true
  try {
    await navigator.clipboard.writeText(referralSummary.value.code)
    toast.add({
      title: 'Referral code copied',
      description: `${referralSummary.value.code} is ready to share.`,
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Could not copy code',
      description: 'Clipboard access failed. Copy it manually.',
      color: 'warning'
    })
  } finally {
    copyingReferralCode.value = false
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <DashboardPageScaffold
      panel-id="referrals"
      title="Referrals"
    >
      <template #right>
        <DashboardActionGroup
          :secondary="[
            {
              label: 'Refresh',
              icon: 'i-lucide-refresh-cw',
              color: 'neutral',
              variant: 'soft',
              onSelect: () => refresh()
            }
          ]"
        />
      </template>

      <div class="space-y-4">
        <DashboardDismissibleIntro
          storage-key="referrals-intro"
          color="info"
          icon="i-lucide-gift"
          title="How referrals work"
          :description="hasActiveMembership
            ? 'Share your referral code with someone joining FO Studio. Rewards are credited after their first successful membership activation.'
            : 'You can share your code now, but referral rewards are awarded when your account has an active membership at reward time. Guests can still book from 11am to 7pm with premium credits.'"
        >
          <template #actions>
            <UButton
              size="xs"
              to="/dashboard/membership"
            >
              {{ hasActiveMembership ? 'Manage membership' : 'Compare memberships' }}
            </UButton>
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              to="/dashboard/book"
            >
              Book studio
            </UButton>
          </template>
        </DashboardDismissibleIntro>

        <UCard>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs text-dimmed uppercase tracking-wide">
                Your referral code
              </div>
              <div class="mt-2 text-3xl font-semibold tracking-wide">
                {{ pending ? 'Loading…' : referralSummary?.code ?? '—' }}
              </div>
              <p class="mt-2 text-sm text-dimmed">
                Send this code before checkout. Both sides receive credits after the new member's first successful membership purchase.
              </p>
            </div>
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-copy"
              :loading="copyingReferralCode"
              :disabled="!referralSummary?.code"
              @click="copyReferralCode"
            >
              Copy code
            </UButton>
          </div>
        </UCard>

        <div class="grid gap-3 sm:grid-cols-4">
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Awarded
            </div>
            <div class="mt-2 text-2xl font-semibold">
              {{ referralSummary?.stats.awardedCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Pending
            </div>
            <div class="mt-2 text-2xl font-semibold">
              {{ referralSummary?.stats.pendingCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Rejected
            </div>
            <div class="mt-2 text-2xl font-semibold">
              {{ referralSummary?.stats.rejectedCount ?? 0 }}
            </div>
          </UCard>
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">
              Credits earned
            </div>
            <div class="mt-2 text-2xl font-semibold">
              {{ formatCredits(referralSummary?.stats.totalCreditsAwarded ?? 0) }}
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-semibold">
                  Recent referrals
                </div>
                <div class="text-sm text-dimmed">
                  Status updates for people who used your code.
                </div>
              </div>
            </div>
          </template>

          <div
            v-if="pending"
            class="py-8 text-center text-sm text-dimmed"
          >
            Loading referrals…
          </div>
          <div
            v-else-if="!referralSummary?.recent?.length"
            class="py-8 text-center text-sm text-dimmed"
          >
            No referral activity yet.
          </div>
          <div
            v-else
            class="divide-y divide-default"
          >
            <div
              v-for="item in referralSummary.recent"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="referralStatusColor(item.status)"
                    variant="soft"
                  >
                    {{ item.status }}
                  </UBadge>
                  <span class="text-sm text-dimmed">{{ formatDate(item.awardedAt ?? item.createdAt) }}</span>
                </div>
                <div
                  v-if="item.rejectionReason"
                  class="mt-1 text-xs text-dimmed"
                >
                  {{ item.rejectionReason.replace(/_/g, ' ') }}
                </div>
              </div>
              <div class="text-sm font-medium">
                {{ formatCredits(item.referrerCreditsAwarded) }} cr
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </DashboardPageScaffold>
  </div>
</template>
