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

const openWaitlist = ref(false)

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
const galleryShowcaseImages = computed(() => galleryImages.value)

function tierDetailsHref(tierId: string) {
  return `/memberships#plan-${encodeURIComponent(tierId)}`
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

      <div class="landing-hero-content">
        <p class="max-w-2xl text-sm leading-7 text-white/92 sm:text-base sm:leading-8">
          {{ landingContent.hero.subheadline }}
        </p>

        <div class="flex flex-wrap gap-3">
          <UButton
            :to="landingContent.hero.primaryCta.to"
            size="xl"
          >
            {{ landingContent.hero.primaryCta.label }}
          </UButton>
          <UButton
            :to="landingContent.hero.secondaryCta.to"
            color="neutral"
            variant="soft"
            size="xl"
          >
            {{ landingContent.hero.secondaryCta.label }}
          </UButton>

          <UModal v-model:open="openWaitlist">
            <UButton
              color="neutral"
              variant="ghost"
              size="xl"
              @click="openWaitlist = true"
            >
              {{ landingContent.hero.waitlistCtaLabel }}
            </UButton>

            <template #content>
              <UCard class="studio-panel">
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="studio-display text-3xl text-[color:var(--gruv-ink-0)]">
                        Join the waitlist
                      </div>
                      <p class="mt-1 text-sm text-[color:var(--gruv-ink-2)]">
                        We keep membership counts limited so booking stays usable.
                      </p>
                    </div>
                    <UButton
                      icon="i-heroicons-x-mark"
                      color="neutral"
                      variant="ghost"
                      @click="openWaitlist = false"
                    />
                  </div>
                </template>

                <div class="space-y-3">
                  <UInput placeholder="Email" />
                  <UInput placeholder="Phone (optional)" />
                  <USelect
                    :options="[
                      { label: 'Creator', value: 'creator' },
                      { label: 'Pro', value: 'pro' },
                      { label: 'Studio+', value: 'studio_plus' }
                    ]"
                    placeholder="Plan you are watching"
                  />
                </div>

                <template #footer>
                  <div class="flex justify-end gap-2">
                    <UButton
                      color="neutral"
                      variant="soft"
                      @click="openWaitlist = false"
                    >
                      Close
                    </UButton>
                    <UButton @click="openWaitlist = false">
                      Notify me
                    </UButton>
                  </div>
                </template>
              </UCard>
            </template>
          </UModal>
        </div>

        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="chip in landingContent.hero.chips"
            :key="chip"
            color="neutral"
            variant="soft"
          >
            {{ chip }}
          </UBadge>
        </div>
      </div>
    </section>

    <section>
      <UContainer>
        <div class="flex items-end justify-between gap-4">
          <div>
            <span class="studio-kicker">Studio preview</span>
            <h2 class="mt-2 studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-6xl">
              {{ landingContent.gallery.title }}
            </h2>
          </div>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <UBadge
            v-for="feature in landingContent.infoCard.features"
            :key="feature"
            color="neutral"
            variant="soft"
            class="px-3 py-1 text-xs sm:text-sm"
          >
            {{ feature }}
          </UBadge>
        </div>

        <div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <img
            v-for="image in galleryShowcaseImages"
            :key="image.src"
            :src="image.src"
            :alt="image.alt || 'Studio image'"
            :loading="image.loading || 'lazy'"
            class="h-[240px] w-full rounded-3xl object-cover"
          >
        </div>
      </UContainer>
    </section>

    <section>
      <UContainer>
        <div class="max-w-3xl">
          <span class="studio-kicker">Plans</span>
          <h2 class="mt-2 studio-display text-5xl leading-none text-[color:var(--gruv-ink-0)] sm:text-6xl">
            {{ landingContent.tiersPreview.title }}
          </h2>
          <p class="mt-3 text-base leading-8 text-[color:var(--gruv-ink-2)]">
            {{ landingContent.tiersPreview.subtitle }}
          </p>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-3">
          <UCard
            v-for="tier in landingContent.tiersPreview.items"
            :key="tier.id"
            class="studio-panel h-full"
          >
            <div class="studio-display text-4xl text-[color:var(--gruv-ink-0)]">
              {{ tier.title }}
            </div>
            <p class="mt-4 text-sm leading-7 text-[color:var(--gruv-ink-2)]">
              {{ tier.body }}
            </p>
            <UButton
              class="mt-6"
              color="neutral"
              variant="soft"
              :to="tierDetailsHref(tier.id)"
            >
              {{ tier.buttonLabel }}
            </UButton>
          </UCard>
        </div>
      </UContainer>
    </section>
  </div>
</template>
