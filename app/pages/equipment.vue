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
  <UContainer class="equipment-page py-10 sm:py-14">
    <div class="equipment-layout">
      <div class="equipment-hero">
        <h1 class="equipment-hero-title">
          {{ content.heroTitle }}
        </h1>
        <p class="equipment-hero-body">
          {{ content.heroBody }}
        </p>
      </div>

      <div class="equipment-cards-frame">
        <div class="equipment-card-grid lg:grid-cols-3">
          <UCard class="equipment-card">
            <template #header>
              <div class="equipment-card-title">
                {{ content.includedHeader }}
              </div>
            </template>

            <ul class="equipment-list">
              <li
                v-for="item in content.includedGear"
                :key="item"
                class="equipment-list-item"
              >
                <UIcon
                  name="i-lucide-check"
                  class="equipment-list-icon equipment-list-icon--success"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </UCard>

          <UCard class="equipment-card">
            <template #header>
              <div class="equipment-card-title">
                {{ content.equipmentListHeader }}
              </div>
            </template>

            <ul class="equipment-list">
              <li
                v-for="item in content.equipmentList"
                :key="item"
                class="equipment-list-item"
              >
                <UIcon
                  name="i-lucide-camera"
                  class="equipment-list-icon"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </UCard>

          <UCard class="equipment-card">
            <template #header>
              <div class="equipment-card-title">
                {{ content.guidelinesHeader }}
              </div>
            </template>

            <ul class="equipment-list">
              <li
                v-for="item in content.sessionGuidelines"
                :key="item"
                class="equipment-list-item"
              >
                <UIcon
                  name="i-lucide-arrow-right"
                  class="equipment-list-icon"
                />
                <span>{{ item }}</span>
              </li>
            </ul>
          </UCard>
        </div>

        <UCard class="equipment-card equipment-cta-card">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="equipment-cta-title">
                {{ content.cta.title }}
              </div>
              <p class="equipment-cta-body">
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
    </div>
  </UContainer>
</template>
