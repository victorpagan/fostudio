<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { Notification } from '~/types'

const { isNotificationsSlideoverOpen } = useDashboard()

const { data: notifications } = await useFetch<Notification[]>('/api/notifications', {
  default: () => []
})
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <template #body>
      <div v-if="!notifications?.length" class="text-sm text-muted">
        No notifications yet.
      </div>

      <NuxtLink
        v-for="n in notifications"
        :key="n.id"
        :to="n.action?.to || '#'"
        class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
      >
        <UChip color="error" :show="!!n.unread" inset>
          <UAvatar
            :src="n.sender?.avatar?.src"
            :alt="n.sender?.avatar?.alt || n.sender?.name || 'Notification'"
            size="md"
          />
        </UChip>

        <div class="text-sm flex-1">
          <p class="flex items-center justify-between gap-2">
            <span class="text-highlighted font-medium">{{ n.title }}</span>

            <time
              :datetime="n.date"
              class="text-muted text-xs"
              v-text="formatTimeAgo(new Date(n.date))"
            />
          </p>

          <p class="text-dimmed">
            {{ n.body }}
          </p>

          <div v-if="n.action?.label" class="mt-1 text-xs text-primary">
            {{ n.action.label }}
          </div>
        </div>
      </NuxtLink>
    </template>
  </USlideover>
</template>
