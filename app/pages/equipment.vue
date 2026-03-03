<script setup lang="ts">
definePageMeta({ layout: 'default' })

const includedGear = [
  'Lighting, grip, and core studio support are available for member sessions.',
  'The setup is designed for efficient portrait, product, and lightweight content shoots.',
  'Membership is the cleanest way to keep your sessions predictable without piecing together outside rentals first.'
]

const sessionGuidelines = [
  'Bring any specialty gear, props, or production-specific tools your session depends on.',
  'Plan extra setup time for larger sets, multi-subject sessions, or custom lighting diagrams.',
  'Compare membership tiers before booking so your lead time and hold access match the way you work.'
]
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-5xl space-y-10">
      <div class="max-w-3xl">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">Studio Setup</h1>
        <p class="mt-4 text-base text-gray-600 dark:text-gray-300 sm:text-lg">
          FO Studio is built for fast, reliable sessions. The details that matter most are your booking window,
          included access, and how quickly you can get on set and start shooting.
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <UCard>
          <template #header>
            <div class="text-lg font-semibold">What members can expect</div>
          </template>

          <ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <li v-for="item in includedGear" :key="item" class="flex gap-3">
              <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <div class="text-lg font-semibold">Before you book</div>
          </template>

          <ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <li v-for="item in sessionGuidelines" :key="item" class="flex gap-3">
              <UIcon name="i-lucide-arrow-right" class="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </UCard>
      </div>

      <UCard>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-sm font-medium">Ready to book?</div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Use the memberships page to compare access levels, then check the public calendar before you reserve your next session.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton to="/memberships">Compare memberships</UButton>
            <UButton color="neutral" variant="soft" to="/calendar">View calendar</UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
