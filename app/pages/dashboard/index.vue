<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Database } from '~/types/supabase' // adjust

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const { isNotificationsSlideoverOpen } = useDashboard()

// Dropdown "+" actions
const actions = [[
  { label: 'Book studio', icon: 'i-lucide-calendar-plus', to: '/book' },
  { label: 'View calendar', icon: 'i-lucide-calendar', to: '/calendar' },
  { label: 'Manage membership', icon: 'i-lucide-badge-check', to: '/dashboard/membership' }
]] satisfies DropdownMenuItem[][]

const { data: membership, refresh: refreshMembership } = await useAsyncData('dashMembershipHome', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id,tier,cadence,status,created_at')
    .eq('user_id', user.value.id)
    .maybeSingle()

  if (error) throw error
  return data
})

// Placeholder credits until ledger is built. Keeps UI stable.
const credits = computed(() => ({
  balance: null as number | null,
  note: 'Credits will show here once your membership is active and credits are minted.'
}))

const membershipState = computed(() => {
  if (!membership.value) return 'none'
  const s = (membership.value.status || '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'pending_checkout') return 'pending_checkout'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'past_due') return 'past_due'
  return 'inactive'
})

const needsMembership = computed(() => membershipState.value !== 'active')

// Helper CTA:
// - If membership exists but not active, push to memberships (or to checkout if you store tier/cadence)
const membershipCta = computed(() => {
  if (membershipState.value === 'pending_checkout') {
    // if you want to send them directly to checkout, you could use stored tier/cadence.
    return { label: 'Finish checkout', to: '/memberships' }
  }
  if (membershipState.value === 'none' || membershipState.value === 'canceled' || membershipState.value === 'past_due' || membershipState.value === 'inactive') {
    return { label: 'Buy membership', to: '/memberships' }
  }
  return { label: 'Manage membership', to: '/dashboard/membership' }
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>

          <UDropdownMenu :items="actions">
            <UButton icon="i-lucide-plus" size="md" class="rounded-full" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <!-- Membership banner -->
          <div class="w-full">
            <UAlert
              v-if="needsMembership"
              color="amber"
              variant="soft"
              title="Membership required to book"
              description="Choose a plan (or finish checkout) to access booking and credits."
            >
              <template #actions>
                <UButton size="sm" :to="membershipCta.to">{{ membershipCta.label }}</UButton>
              </template>
            </UAlert>

            <UAlert
              v-else
              color="green"
              variant="soft"
              title="Membership active"
              :description="`Tier: ${membership?.tier || ''} · Cadence: ${membership?.cadence || ''}`"
            >
              <template #actions>
                <UButton size="sm" to="/book">Book studio</UButton>
              </template>
            </UAlert>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <div class="text-sm text-muted">Membership</div>
            <div class="mt-2 text-lg font-semibold">
              <span v-if="membership">{{ membership.tier }} · {{ membership.cadence }}</span>
              <span v-else>None</span>
            </div>
            <div class="mt-2">
              <UBadge :color="membershipState === 'active' ? 'green' : 'gray'" variant="soft">
                {{ membership?.status ?? 'none' }}
              </UBadge>
            </div>
            <div class="mt-4">
              <UButton size="sm" color="gray" variant="soft" :to="membershipCta.to">
                {{ membershipCta.label }}
              </UButton>
            </div>
          </UCard>

          <UCard>
            <div class="text-sm text-muted">Credits</div>
            <div class="mt-2 text-3xl font-semibold">
              <span v-if="credits.balance !== null">{{ credits.balance }}</span>
              <span v-else>—</span>
            </div>
            <div class="mt-2 text-sm text-dimmed">{{ credits.note }}</div>
            <div class="mt-4">
              <UButton size="sm" color="gray" variant="soft" to="/dashboard/credits">
                View history
              </UButton>
            </div>
          </UCard>

          <UCard>
            <div class="text-sm text-muted">Quick actions</div>
            <div class="mt-4 flex flex-col gap-2">
              <UButton :disabled="needsMembership" to="/book">Book studio</UButton>
              <UButton color="gray" variant="soft" to="/calendar">View calendar</UButton>
              <UButton color="gray" variant="soft" to="/dashboard/bookings">My bookings</UButton>
            </div>
          </UCard>
        </div>

        <UCard>
          <div class="text-sm text-muted">Next steps</div>
          <div class="mt-2 text-sm text-dimmed">
            We’ll add: booking history, credit ledger, holds, and membership management here.
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
