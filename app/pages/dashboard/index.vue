<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: ['auth'] })

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { isNotificationsSlideoverOpen } = useDashboard()
const { isAdmin } = useCurrentUser()

const actions = [[
  { label: 'Book studio', icon: 'i-lucide-calendar-plus', to: '/dashboard/book' },
  { label: 'View calendar', icon: 'i-lucide-calendar', to: '/calendar' },
  { label: 'Manage membership', icon: 'i-lucide-badge-check', to: '/dashboard/membership' }
]] satisfies DropdownMenuItem[][]

// Membership
const { data: membership, refresh: refreshMembership } = await useAsyncData('dash:home:membership', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('memberships')
    .select('id, tier, cadence, status, created_at')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data
})

// Real credit balance from the credit_balance view
const { data: creditBalance, refresh: refreshBalance } = await useAsyncData('dash:home:credits', async () => {
  if (!user.value) return null
  const { data, error } = await supabase
    .from('credit_balance')
    .select('balance')
    .eq('user_id', user.value.sub)
    .maybeSingle()
  if (error) throw error
  return data?.balance ?? null
})

// Upcoming bookings count for quick display
const { data: upcomingCount } = await useAsyncData('dash:home:upcoming', async () => {
  if (!user.value) return 0
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.value.sub)
    .gte('start_time', new Date().toISOString())
    .in('status', ['confirmed', 'requested'])
  if (error) return 0
  return count ?? 0
})

const membershipState = computed(() => {
  if (!membership.value) return 'none'
  const s = (membership.value.status || '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'pending_checkout') return 'pending_checkout'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'past_due') return 'past_due'
  return 'inactive'
})

const needsMembership = computed(() => membershipState.value !== 'active' && !isAdmin.value)

const membershipCta = computed(() => {
  if (membershipState.value === 'pending_checkout') return { label: 'Finish checkout', to: '/memberships' }
  if (['none', 'canceled', 'past_due', 'inactive'].includes(membershipState.value)) return { label: 'Buy membership', to: '/memberships' }
  return { label: 'Manage membership', to: '/dashboard/membership' }
})

const tierLabel = computed(() => {
  if (!membership.value) return null
  return [membership.value.tier, membership.value.cadence].filter(Boolean).join(' · ')
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton color="neutral" variant="ghost" square @click="isNotificationsSlideoverOpen = true">
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
          <div class="w-full">
            <!-- Admin bypass notice -->
            <UAlert
              v-if="isAdmin"
              color="primary"
              variant="soft"
              title="Admin access"
              description="You are viewing the dashboard as an admin. Membership guards are bypassed."
            />
            <!-- Membership CTA for non-members -->
            <UAlert
              v-else-if="needsMembership"
              color="warning"
              variant="soft"
              title="Membership required to book"
              description="Choose a plan (or finish checkout) to access booking and credits."
            >
              <template #actions>
                <UButton size="sm" :to="membershipCta.to">{{ membershipCta.label }}</UButton>
              </template>
            </UAlert>
            <!-- Active member welcome -->
            <UAlert
              v-else
              color="success"
              variant="soft"
              title="Membership active"
              :description="tierLabel ? `Plan: ${tierLabel}` : 'Welcome back!'"
            >
              <template #actions>
                <UButton size="sm" to="/dashboard/book">Book studio</UButton>
              </template>
            </UAlert>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <!-- Stat cards -->
        <div class="grid gap-4 sm:grid-cols-3">
          <!-- Membership card -->
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">Membership</div>
            <div class="mt-2 text-lg font-semibold truncate">
              <span v-if="membership">{{ membership.tier }}</span>
              <span v-else class="text-dimmed">None</span>
            </div>
            <div class="mt-1.5">
              <UBadge
                :color="membershipState === 'active' ? 'success' : membershipState === 'past_due' ? 'error' : membershipState === 'pending_checkout' ? 'warning' : 'neutral'"
                variant="soft"
                size="sm"
              >
                {{ membership?.status ?? 'none' }}
              </UBadge>
            </div>
            <div class="mt-4">
              <UButton size="sm" color="neutral" variant="soft" :to="membershipCta.to">
                {{ membershipCta.label }}
              </UButton>
            </div>
          </UCard>

          <!-- Credits card -->
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">Credits</div>
            <div class="mt-2 text-4xl font-semibold tabular-nums">
              <span v-if="creditBalance !== null">{{ creditBalance }}</span>
              <span v-else class="text-dimmed text-2xl">—</span>
            </div>
            <div class="mt-1.5 text-xs text-dimmed">
              <template v-if="creditBalance === null">Credits appear once your first invoice is paid.</template>
              <template v-else>Available studio hours (off-peak)</template>
            </div>
            <div class="mt-4">
              <UButton size="sm" color="neutral" variant="soft" to="/dashboard/credits">View history</UButton>
            </div>
          </UCard>

          <!-- Upcoming bookings card -->
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide">Upcoming</div>
            <div class="mt-2 text-4xl font-semibold tabular-nums">
              {{ upcomingCount ?? 0 }}
            </div>
            <div class="mt-1.5 text-xs text-dimmed">
              {{ upcomingCount === 1 ? 'upcoming booking' : 'upcoming bookings' }}
            </div>
            <div class="mt-4 flex flex-col gap-2">
              <UButton :disabled="needsMembership" to="/dashboard/book" size="sm">Book studio</UButton>
              <UButton color="neutral" variant="soft" to="/dashboard/bookings" size="sm">My bookings</UButton>
            </div>
          </UCard>
        </div>

        <!-- Quick actions row -->
        <div class="grid gap-3 sm:grid-cols-2">
          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide mb-3">Quick actions</div>
            <div class="flex flex-col gap-2">
              <UButton
                :disabled="needsMembership"
                to="/dashboard/book"
                icon="i-lucide-calendar-plus"
                class="justify-start"
              >
                Book studio time
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/calendar"
                icon="i-lucide-calendar"
                class="justify-start"
              >
                View public calendar
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/dashboard/credits"
                icon="i-lucide-coins"
                class="justify-start"
              >
                Credit history
              </UButton>
            </div>
          </UCard>

          <UCard>
            <div class="text-xs text-dimmed uppercase tracking-wide mb-3">Account</div>
            <div class="flex flex-col gap-2">
              <UButton
                color="neutral"
                variant="soft"
                to="/dashboard/membership"
                icon="i-lucide-badge-check"
                class="justify-start"
              >
                Membership details
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                to="/dashboard/profile"
                icon="i-lucide-user"
                class="justify-start"
              >
                Edit profile
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
