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

type LandingVideo = {
  src: string
  poster?: string
}

type LandingLeadOverlay = {
  chapter: string
  section: string
  brand: string
  title: string
  subtitle: string
}

type LandingTierPreview = {
  id: string
  title: string
  body: string
  buttonLabel: string
}

type LandingDifferentiatorCard = {
  title: string
  body: string
  ctaLabel: string
  ctaTo: string
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
    campaignHint: string
  }
  infoCard: {
    title: string
    body: string
    affordabilityNote: string
    features: string[]
  }
  gallery: {
    title: string
    leadVideo?: LandingVideo
    leadOverlay?: LandingLeadOverlay
    images: LandingImage[]
  }
  spotlight: {
    label: string
    title: string
    body: string
    statValue: string
    statLabel: string
    cta: LandingCta
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
    chips: ['24/7 member access', 'Gear + consumables included', 'No startup fees'],
    campaignHint: 'Campaign: use NEWSITE for 5% off new memberships.'
  },
  infoCard: {
    title: 'FO Studio at a glance',
    body: 'We keep the workflow simple, the access flexible, and the monthly cost predictable so you and your crew can keep shooting without operational drag. Run production through a high-quality dashboard with live calendar visibility, rescheduling, booking extensions, and overnight holds.',
    affordabilityNote: 'Built to stay affordable for recurring production, with ground-floor loading and easier parking than the typical downtown studio run.',
    features: [
      '25x30 ft cyclorama with 20+ ft ceilings',
      'High-quality booking dashboard with live calendar, extensions, and holds',
      'Included equipment, backdrop paper, and baseline consumables',
      'Ground-floor access with straightforward loading and easier parking outside the dense downtown grid'
    ]
  },
  gallery: {
    title: 'Inside the studio',
    leadVideo: {
      src: '/videos/studio-example.mp4',
      poster: '/images/studio-hero-3.png'
    },
    leadOverlay: {
      chapter: 'CHAPTER',
      section: '/ PRACTICE',
      brand: 'FO STUDIO',
      title: 'Production-first booking flow',
      subtitle: 'Live calendar visibility, extensions, and holds without workflow friction.'
    },
    images: [
      { src: '/images/studio-hero-1.jpg', alt: 'Studio wide shot with cyc wall', loading: 'eager' },
      { src: '/images/studio-hero-2.jpg', alt: 'Backdrop and prep area', loading: 'lazy' },
      { src: '/images/studio-hero-3.png', alt: 'Lighting setup in the studio', loading: 'lazy' }
    ]
  },
  spotlight: {
    label: 'PRODUCTION-FIRST VALUE',
    title: 'A turnkey studio that keeps your shoots moving and your overhead in check.',
    body: 'Run production through a high-quality dashboard with live calendar visibility, rescheduling, extensions, and holds. Reserve in 30-minute increments and keep setup continuity without adding line-item friction to every session.',
    statValue: '30 min',
    statLabel: 'Booking increments available for members.',
    cta: { label: 'See Availability', to: '/calendar' }
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
  try {
    return await queryCollection('siteLanding').first()
  } catch (error) {
    console.warn('[site:landing] falling back to defaults because content query failed', error)
    return null
  }
})

function normalizeCta(input: unknown, fallback: LandingCta): LandingCta {
  if (!input || typeof input !== 'object') return fallback
  const value = input as Partial<LandingCta>
  const label = typeof value.label === 'string' && value.label.trim()
    ? value.label
    : fallback.label
  const to = typeof value.to === 'string' && value.to.trim()
    ? value.to
    : fallback.to
  return { label, to }
}

function normalizeStringArray(input: unknown, fallback: string[]) {
  if (!Array.isArray(input)) return fallback
  const values = input
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)
  return values.length ? values : fallback
}

function normalizeLeadOverlay(input: unknown, fallback: LandingLeadOverlay): LandingLeadOverlay {
  if (!input || typeof input !== 'object') return fallback
  const value = input as Partial<LandingLeadOverlay>
  return {
    chapter: typeof value.chapter === 'string' && value.chapter.trim() ? value.chapter : fallback.chapter,
    section: typeof value.section === 'string' && value.section.trim() ? value.section : fallback.section,
    brand: typeof value.brand === 'string' && value.brand.trim() ? value.brand : fallback.brand,
    title: typeof value.title === 'string' && value.title.trim() ? value.title : fallback.title,
    subtitle: typeof value.subtitle === 'string' && value.subtitle.trim() ? value.subtitle : fallback.subtitle
  }
}

function normalizeTierItems(input: unknown, fallback: LandingTierPreview[]) {
  if (!Array.isArray(input)) return fallback

  const values = input
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const source = item as Partial<LandingTierPreview>
      const fallbackItem = fallback[index] ?? fallback[0]!
      const id = typeof source.id === 'string' && source.id.trim() ? source.id : fallbackItem.id
      const title = typeof source.title === 'string' && source.title.trim() ? source.title : fallbackItem.title
      const body = typeof source.body === 'string' && source.body.trim() ? source.body : fallbackItem.body
      const buttonLabel = typeof source.buttonLabel === 'string' && source.buttonLabel.trim()
        ? source.buttonLabel
        : fallbackItem.buttonLabel
      return { id, title, body, buttonLabel }
    })

  return values.length ? values : fallback
}

const landingContent = computed<SiteLandingContent>(() => {
  const source = (siteLanding.value as Partial<SiteLandingContent> | null) ?? {}
  const fallback = fallbackLanding

  const sourceHero = (source.hero ?? {}) as Partial<SiteLandingContent['hero']>
  const sourceInfoCard = (source.infoCard ?? {}) as Partial<SiteLandingContent['infoCard']>
  const sourceGallery = (source.gallery ?? {}) as Partial<SiteLandingContent['gallery']>
  const sourceSpotlight = (source.spotlight ?? {}) as Partial<SiteLandingContent['spotlight']>
  const sourceTiers = (source.tiersPreview ?? {}) as Partial<SiteLandingContent['tiersPreview']>

  return {
    hero: {
      kicker: typeof sourceHero.kicker === 'string' && sourceHero.kicker.trim() ? sourceHero.kicker : fallback.hero.kicker,
      headline: typeof sourceHero.headline === 'string' && sourceHero.headline.trim() ? sourceHero.headline : fallback.hero.headline,
      subheadline: typeof sourceHero.subheadline === 'string' && sourceHero.subheadline.trim() ? sourceHero.subheadline : fallback.hero.subheadline,
      primaryCta: normalizeCta(sourceHero.primaryCta, fallback.hero.primaryCta),
      secondaryCta: normalizeCta(sourceHero.secondaryCta, fallback.hero.secondaryCta),
      waitlistCtaLabel: typeof sourceHero.waitlistCtaLabel === 'string' && sourceHero.waitlistCtaLabel.trim()
        ? sourceHero.waitlistCtaLabel
        : fallback.hero.waitlistCtaLabel,
      chips: normalizeStringArray(sourceHero.chips, fallback.hero.chips),
      campaignHint: typeof sourceHero.campaignHint === 'string' && sourceHero.campaignHint.trim()
        ? sourceHero.campaignHint
        : fallback.hero.campaignHint
    },
    infoCard: {
      title: typeof sourceInfoCard.title === 'string' && sourceInfoCard.title.trim() ? sourceInfoCard.title : fallback.infoCard.title,
      body: typeof sourceInfoCard.body === 'string' && sourceInfoCard.body.trim() ? sourceInfoCard.body : fallback.infoCard.body,
      affordabilityNote: typeof sourceInfoCard.affordabilityNote === 'string' && sourceInfoCard.affordabilityNote.trim()
        ? sourceInfoCard.affordabilityNote
        : fallback.infoCard.affordabilityNote,
      features: normalizeStringArray(sourceInfoCard.features, fallback.infoCard.features)
    },
    gallery: {
      title: typeof sourceGallery.title === 'string' && sourceGallery.title.trim() ? sourceGallery.title : fallback.gallery.title,
      leadVideo: sourceGallery.leadVideo && typeof sourceGallery.leadVideo === 'object'
        ? {
            src: typeof sourceGallery.leadVideo.src === 'string' && sourceGallery.leadVideo.src.trim()
              ? sourceGallery.leadVideo.src
              : fallback.gallery.leadVideo?.src ?? '',
            poster: typeof sourceGallery.leadVideo.poster === 'string' && sourceGallery.leadVideo.poster.trim()
              ? sourceGallery.leadVideo.poster
              : fallback.gallery.leadVideo?.poster
          }
        : fallback.gallery.leadVideo,
      leadOverlay: normalizeLeadOverlay(sourceGallery.leadOverlay, fallback.gallery.leadOverlay!),
      images: Array.isArray(sourceGallery.images) && sourceGallery.images.length
        ? sourceGallery.images as LandingImage[]
        : fallback.gallery.images
    },
    spotlight: {
      label: typeof sourceSpotlight.label === 'string' && sourceSpotlight.label.trim() ? sourceSpotlight.label : fallback.spotlight.label,
      title: typeof sourceSpotlight.title === 'string' && sourceSpotlight.title.trim() ? sourceSpotlight.title : fallback.spotlight.title,
      body: typeof sourceSpotlight.body === 'string' && sourceSpotlight.body.trim() ? sourceSpotlight.body : fallback.spotlight.body,
      statValue: typeof sourceSpotlight.statValue === 'string' && sourceSpotlight.statValue.trim() ? sourceSpotlight.statValue : fallback.spotlight.statValue,
      statLabel: typeof sourceSpotlight.statLabel === 'string' && sourceSpotlight.statLabel.trim() ? sourceSpotlight.statLabel : fallback.spotlight.statLabel,
      cta: normalizeCta(sourceSpotlight.cta, fallback.spotlight.cta)
    },
    tiersPreview: {
      title: typeof sourceTiers.title === 'string' && sourceTiers.title.trim() ? sourceTiers.title : fallback.tiersPreview.title,
      subtitle: typeof sourceTiers.subtitle === 'string' && sourceTiers.subtitle.trim() ? sourceTiers.subtitle : fallback.tiersPreview.subtitle,
      items: normalizeTierItems(sourceTiers.items, fallback.tiersPreview.items)
    }
  }
})

const galleryImages = computed(() => landingContent.value.gallery.images ?? [])
const galleryLeadVideo = computed(() => {
  const video = landingContent.value.gallery.leadVideo
  if (!video?.src) return null
  return video
})
const galleryLeadImage = computed(() => galleryImages.value[0] ?? null)
const gallerySpotlightImage = computed(() => galleryImages.value[2] ?? galleryImages.value[0] ?? null)
const planAccentClasses = ['editorial-plan-card--accent-a', 'editorial-plan-card--accent-b', 'editorial-plan-card--accent-c'] as const
const differentiatorCtaMap = [
  { ctaLabel: 'View equipment', ctaTo: '/equipment' },
  { ctaLabel: 'See calendar', ctaTo: '/calendar' },
  { ctaLabel: 'Compare tiers', ctaTo: '/memberships' },
  { ctaLabel: 'Ask a question', ctaTo: '/contact' }
] as const

const differentiatorCards = computed<LandingDifferentiatorCard[]>(() => {
  return landingContent.value.infoCard.features
    .slice(0, 4)
    .map((feature, index) => {
      const safeIndex = Math.min(index, differentiatorCtaMap.length - 1)
      const action = differentiatorCtaMap[safeIndex]!
      return {
        title: `0${index + 1}`,
        body: feature,
        ctaLabel: action.ctaLabel,
        ctaTo: action.ctaTo
      }
    })
})

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
  <div class="pb-12 sm:pb-16">
    <section class="landing-hero">
      <img
        src="/images/sky.webp"
        alt="Sky background"
        loading="eager"
        class="landing-hero-image landing-hero-image-sky dark:hidden"
      >
      <img
        src="/images/studiobg.webp"
        alt="Studio background"
        loading="eager"
        class="landing-hero-image landing-hero-image-studiobg hidden dark:block"
      >
      <div class="landing-hero-scrim" />
      <div class="landing-hero-wordmark">
        <span class="landing-hero-wordmark-fo">FO</span>
        <span class="landing-hero-wordmark-studio">STUDIO</span>
      </div>
      <img
        src="/images/william.webp"
        alt="William portrait"
        loading="eager"
        class="landing-hero-william dark:hidden"
      >
      <img
        src="/images/amanda.webp"
        alt="Amanda portrait"
        loading="eager"
        class="landing-hero-amanda hidden dark:block"
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
        <div class="landing-hero-cta-wrap">
          <NuxtLink
            :to="landingContent.hero.secondaryCta.to"
            class="landing-hero-cta"
          >
            {{ landingContent.hero.secondaryCta.label }}
          </NuxtLink>
          <span class="landing-hero-cta-arrow">↗</span>
        </div>
        <p class="landing-hero-campaign-hint">
          {{ landingContent.hero.campaignHint }}
        </p>
      </div>

      <div class="landing-hero-note">
        (Image taken in our studio!)
      </div>
    </section>

    <div class="mx-auto mt-12 w-full max-w-[1520px] space-y-12 px-3 sm:mt-16 sm:space-y-16 sm:px-5 lg:px-8">
      <section
        class="editorial-section landing-differentiator-section"
        data-reveal
      >
        <div class="editorial-frame">
          <div class="landing-differentiator-grid">
            <div class="landing-differentiator-left">
              <div class="landing-differentiator-copy editorial-copy-texture">
                <p class="editorial-label">
                  WHAT SETS FO STUDIO APART
                </p>
                <h2 class="editorial-title landing-accent-title">
                  {{ landingContent.infoCard.title }}
                </h2>
                <p class="editorial-body">
                  {{ landingContent.infoCard.body }}
                </p>
                <p class="landing-differentiator-affordability landing-accent-note">
                  {{ landingContent.infoCard.affordabilityNote }}
                </p>
              </div>
              <div class="landing-differentiator-cards">
                <article
                  v-for="card in differentiatorCards"
                  :key="card.title + card.body"
                  class="landing-differentiator-card"
                >
                  <p class="landing-differentiator-card-index">
                    {{ card.title }}
                  </p>
                  <p class="landing-differentiator-card-body">
                    {{ card.body }}
                  </p>
                  <NuxtLink
                    :to="card.ctaTo"
                    class="landing-differentiator-card-link"
                  >
                    {{ card.ctaLabel }}
                  </NuxtLink>
                </article>
              </div>
            </div>

            <div class="landing-differentiator-media">
              <video
                v-if="galleryLeadVideo"
                :src="galleryLeadVideo.src"
                :poster="galleryLeadVideo.poster"
                class="landing-differentiator-media-video"
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
              />
              <img
                v-else-if="galleryLeadImage"
                :src="galleryLeadImage.src"
                :alt="galleryLeadImage.alt || 'Studio image'"
                :loading="galleryLeadImage.loading || 'lazy'"
                class="landing-differentiator-media-image"
              >
              <div class="landing-lead-overlay">
                <div class="landing-lead-overlay-grid" />
                <div class="landing-lead-overlay-brand">
                  {{ landingContent.gallery.leadOverlay?.brand }}
                </div>
                <div class="landing-lead-overlay-copy">
                  <p class="landing-lead-overlay-title">
                    {{ landingContent.gallery.leadOverlay?.title }}
                  </p>
                  <p class="landing-lead-overlay-subtitle">
                    {{ landingContent.gallery.leadOverlay?.subtitle }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section
      class="landing-spotlight-section"
      data-reveal
      data-reveal-delay="90ms"
    >
      <div class="landing-spotlight-shell">
        <img
          v-if="gallerySpotlightImage"
          :src="gallerySpotlightImage.src"
          :alt="gallerySpotlightImage.alt || 'Studio spotlight image'"
          :loading="gallerySpotlightImage.loading || 'lazy'"
          class="landing-spotlight-image"
        >
        <div class="landing-spotlight-overlay">
          <p class="editorial-label">
            {{ landingContent.spotlight.label }}
          </p>
          <h2 class="landing-spotlight-title">
            {{ landingContent.spotlight.title }}
          </h2>
          <p class="landing-spotlight-body">
            {{ landingContent.spotlight.body }}
          </p>
          <UButton
            color="neutral"
            variant="solid"
            :to="landingContent.spotlight.cta.to"
          >
            {{ landingContent.spotlight.cta.label }}
          </UButton>
        </div>
        <div class="landing-spotlight-stat">
          <p class="landing-spotlight-stat-value">
            {{ landingContent.spotlight.statValue }}
          </p>
          <p class="landing-spotlight-stat-label">
            {{ landingContent.spotlight.statLabel }}
          </p>
        </div>
      </div>
    </section>

    <div class="mx-auto mt-12 w-full max-w-[1520px] space-y-12 px-3 sm:mt-16 sm:space-y-16 sm:px-5 lg:px-8">
      <section
        class="editorial-section landing-tiers-section"
        data-reveal
      >
        <div class="editorial-frame">
          <div class="editorial-grid editorial-grid-plans">
            <div class="editorial-cell editorial-meta">
              <p class="editorial-label">
                MEMBERSHIP / TIERS
              </p>
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
  </div>
</template>
