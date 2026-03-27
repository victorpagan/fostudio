<script setup lang="ts">
type LandingCta = {
  label: string
  to: string
}

type LandingImage = {
  src: string
  alt?: string
  loading?: 'lazy' | 'eager'
}

type LandingTierPreview = {
  id: string
  title: string
  body: string
  buttonLabel: string
}

type SiteLandingContent = {
  hero: {
    kicker: string
    headline: string
    subheadline: string
    primaryCta: LandingCta
    secondaryCta: LandingCta
    waitlistCtaLabel: string
    chips: string[]
  }
  infoCard: {
    title: string
    body: string
    features: string[]
  }
  gallery: {
    title: string
    images: LandingImage[]
  }
  tiersPreview: {
    title: string
    subtitle: string
    items: LandingTierPreview[]
  }
}

const fallbackLanding: SiteLandingContent = {
  hero: {
    kicker: 'Membership studio access',
    headline: 'Pick the studio membership that fits the way you actually work.',
    subheadline: 'This is a 24/7 turnkey studio built for photographers and small-to-mid crews. Book the plan that matches your volume, then use the space like it was made for production days, not paperwork.',
    primaryCta: { label: 'See Availability', to: '/calendar' },
    secondaryCta: { label: 'Explore Memberships', to: '/memberships' },
    waitlistCtaLabel: 'Join the waitlist',
    chips: ['24/7 member access', 'Gear + consumables included', 'No startup fees']
  },
  infoCard: {
    title: 'FO Studio at a glance',
    body: 'Built for production days, not logistics overhead.',
    features: [
      '25x30 ft cyclorama with 20+ ft ceilings',
      'Member-first calendar access and booking controls',
      'Included equipment, backdrop paper, and baseline consumables',
      'Secure access flow with 24/7 member entry'
    ]
  },
  gallery: {
    title: 'Inside the studio',
    images: [
      { src: '/images/studio-hero-1.jpg', alt: 'Studio wide shot with cyc wall', loading: 'eager' },
      { src: '/images/studio-hero-2.jpg', alt: 'Backdrop and prep area', loading: 'lazy' },
      { src: '/images/studio-hero-3.jpg', alt: 'Lighting setup in the studio', loading: 'lazy' }
    ]
  },
  tiersPreview: {
    title: 'Membership tier preview',
    subtitle: 'Start with the plan that matches your current volume. You can always move up as your schedule grows.',
    items: [
      {
        id: 'creator',
        title: 'Creator',
        body: 'A practical fit for lighter monthly volume, test sessions, and smaller recurring shoots.',
        buttonLabel: 'Explore Creator plan'
      },
      {
        id: 'pro',
        title: 'Pro',
        body: 'For repeat client production that needs stronger booking window and steadier weekly cadence.',
        buttonLabel: 'Explore Pro plan'
      },
      {
        id: 'studio_plus',
        title: 'Studio+',
        body: 'Priority-focused access for heavier production months and larger crew coordination.',
        buttonLabel: 'Explore Studio+ plan'
      }
    ]
  }
}

const { data: siteLanding } = await useAsyncData('site:landing', async () => {
  return await queryCollection('siteLanding').first()
})

const landingContent = computed<SiteLandingContent>(() => {
  return (siteLanding.value as SiteLandingContent | null) ?? fallbackLanding
})

const galleryImages = computed(() => landingContent.value.gallery.images ?? [])
const galleryLeadImage = computed(() => galleryImages.value[0] ?? null)
const gallerySecondaryImage = computed(() => galleryImages.value[1] ?? galleryImages.value[0] ?? null)
const planAccentClasses = ['editorial-plan-card--accent-a', 'editorial-plan-card--accent-b', 'editorial-plan-card--accent-c'] as const

function tierDetailsHref(tierId: string) {
  return `/memberships#plan-${encodeURIComponent(tierId)}`
}

function tierAccentClass(tierId: string, index: number) {
  const normalized = tierId.toLowerCase()
  if (normalized.includes('creator')) return 'editorial-plan-card--accent-a'
  if (normalized.includes('pro')) return 'editorial-plan-card--accent-b'
  if (normalized.includes('studio')) return 'editorial-plan-card--accent-c'
  return planAccentClasses[index % planAccentClasses.length]
}
</script>

<template>
  <div class="space-y-12 pb-12 sm:space-y-16 sm:pb-16">
    <section class="landing-hero">
      <img
        src="/images/sky.png"
        alt="Sky background"
        loading="eager"
        class="landing-hero-image landing-hero-image-sky"
      >
      <div class="landing-hero-scrim" />
      <div class="landing-hero-wordmark">
        <span class="landing-hero-wordmark-fo">FO</span>
        <span class="landing-hero-wordmark-studio">STUDIO</span>
      </div>
      <img
        src="/images/william.png"
        alt="William portrait"
        loading="eager"
        class="landing-hero-william"
      >

      <div class="landing-hero-badges">
        <UBadge
          v-for="chip in landingContent.hero.chips"
          :key="chip"
          color="neutral"
          variant="soft"
          class="landing-hero-badge"
        >
          {{ chip }}
        </UBadge>
      </div>

      <div class="landing-hero-content">
        <NuxtLink
          :to="landingContent.hero.secondaryCta.to"
          class="landing-hero-cta"
        >
          {{ landingContent.hero.secondaryCta.label }}
        </NuxtLink>
      </div>

      <div class="landing-hero-note">
        (Image taken in our studio!)
      </div>
    </section>

    <section class="editorial-section">
      <div class="editorial-frame">
        <div class="editorial-grid editorial-grid-intro">
          <div class="editorial-cell editorial-meta">
            <p class="editorial-label">INTRO / STUDIO</p>
          </div>

          <div class="editorial-cell editorial-copy editorial-copy-texture">
            <h2 class="editorial-title">
              {{ landingContent.infoCard.title }}
            </h2>
            <p class="editorial-body">
              {{ landingContent.infoCard.body }}
            </p>
          </div>

          <div class="editorial-cell editorial-image-large">
            <img
              v-if="galleryLeadImage"
              :src="galleryLeadImage.src"
              :alt="galleryLeadImage.alt || 'Studio image'"
              :loading="galleryLeadImage.loading || 'lazy'"
              class="editorial-image"
            >
          </div>

          <div class="editorial-cell editorial-image-side">
            <img
              v-if="gallerySecondaryImage"
              :src="gallerySecondaryImage.src"
              :alt="gallerySecondaryImage.alt || 'Studio image'"
              :loading="gallerySecondaryImage.loading || 'lazy'"
              class="editorial-image"
            >
            <div class="editorial-side-mark">/</div>
          </div>
        </div>
      </div>
    </section>

    <section class="editorial-section">
      <div class="editorial-frame">
        <div class="editorial-grid editorial-grid-plans">
          <div class="editorial-cell editorial-meta">
            <p class="editorial-label">MEMBERSHIP / TIERS</p>
          </div>

          <div class="editorial-cell editorial-copy editorial-copy-texture">
            <h2 class="editorial-title">
              {{ landingContent.tiersPreview.title }}
            </h2>
            <p class="editorial-body">
              {{ landingContent.tiersPreview.subtitle }}
            </p>
          </div>

          <div class="editorial-cell editorial-plan-list">
            <div
              v-for="(tier, index) in landingContent.tiersPreview.items"
              :key="tier.id"
              class="editorial-plan-card"
              :class="tierAccentClass(tier.id, index)"
            >
              <div class="editorial-plan-title">
                {{ tier.title }}
              </div>
              <p class="editorial-plan-body">
                {{ tier.body }}
              </p>
              <UButton
                color="neutral"
                variant="soft"
                :to="tierDetailsHref(tier.id)"
              >
                {{ tier.buttonLabel }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
