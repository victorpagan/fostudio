<script setup lang="ts">
definePageMeta({ layout: 'default' })

type SiteEquipmentContent = {
  heroTitle: string
  heroBody: string
  includedHeader: string
  includedGear: string[]
  equipmentListHeader: string
  equipmentList: string[]
  guidelinesHeader: string
  sessionGuidelines: string[]
  cta: {
    title: string
    body: string
    primaryCta: { label: string, to: string }
    secondaryCta: { label: string, to: string }
  }
}

const fallbackContent: SiteEquipmentContent = {
  heroTitle: 'Studio Setup',
  heroBody: 'FO Studio is built for fast, reliable sessions. Memberships include the in-house gear and consumables, so your main focus is choosing the right plan and getting on set quickly.',
  includedHeader: 'What members can expect',
  includedGear: [
    'All in-house lighting, grip, and core studio equipment are included for member sessions.',
    'Backdrop paper and day-to-day consumables are included, so you can arrive ready to shoot.',
    'Membership keeps production simple: book, pay, and show up without separate equipment rentals.'
  ],
  equipmentListHeader: 'Equipment list',
  equipmentList: [
    'Profoto monolights and wireless triggers (strobe setup ready).',
    'Softboxes, umbrellas, strip modifiers, and beauty-dish style light shaping options.',
    'C-stands, combo stands, boom arm support, sandbags, and core grip hardware.',
    'V-flats, apple boxes, clamps, extension runs, and common on-set support tools.',
    'Seamless backdrop paper system with studio-ready color rolls.',
    'Styling tables, stools, and practical props for product and portrait setups.'
  ],
  guidelinesHeader: 'Before you book',
  sessionGuidelines: [
    'Bring any specialty gear, props, or production-specific tools your session depends on.',
    'Plan extra setup time for larger sets, multi-subject sessions, or custom lighting diagrams.',
    'Compare membership tiers before booking so your lead time and hold access match the way you work.'
  ],
  cta: {
    title: 'Ready to book?',
    body: 'Use the memberships page to compare access levels, then check the public calendar before you reserve your next session.',
    primaryCta: { label: 'Compare memberships', to: '/memberships' },
    secondaryCta: { label: 'View calendar', to: '/calendar' }
  }
}

const { data: siteEquipment } = await useAsyncData('site:equipment', async () => {
  return await queryCollection('siteEquipment').first()
})

const content = computed<SiteEquipmentContent>(() => {
  return (siteEquipment.value as SiteEquipmentContent | null) ?? fallbackContent
})
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mx-auto max-w-5xl space-y-10">
      <div class="max-w-3xl">
        <h1 class="text-3xl font-semibold tracking-tight sm:text-5xl">
          {{ content.heroTitle }}
        </h1>
        <p class="mt-4 text-base text-gray-600 dark:text-gray-300 sm:text-lg">
          {{ content.heroBody }}
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <UCard>
          <template #header>
            <div class="text-lg font-semibold">
              {{ content.includedHeader }}
            </div>
          </template>

          <ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <li
              v-for="item in content.includedGear"
              :key="item"
              class="flex gap-3"
            >
              <UIcon
                name="i-lucide-check"
                class="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <div class="text-lg font-semibold">
              {{ content.equipmentListHeader }}
            </div>
          </template>

          <ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <li
              v-for="item in content.equipmentList"
              :key="item"
              class="flex gap-3"
            >
              <UIcon
                name="i-lucide-camera"
                class="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <div class="text-lg font-semibold">
              {{ content.guidelinesHeader }}
            </div>
          </template>

          <ul class="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <li
              v-for="item in content.sessionGuidelines"
              :key="item"
              class="flex gap-3"
            >
              <UIcon
                name="i-lucide-arrow-right"
                class="mt-0.5 size-4 shrink-0 text-gray-500 dark:text-gray-400"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </UCard>
      </div>

      <UCard>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-sm font-medium">
              {{ content.cta.title }}
            </div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {{ content.cta.body }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton :to="content.cta.primaryCta.to">
              {{ content.cta.primaryCta.label }}
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              :to="content.cta.secondaryCta.to"
            >
              {{ content.cta.secondaryCta.label }}
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
