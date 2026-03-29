import { defineCollection, defineContentConfig, z } from '@nuxt/content'

const createImageSchema = () => z.object({
  src: z.string().nonempty().editor({ input: 'media' }),
  alt: z.string().optional(),
  loading: z.enum(['lazy', 'eager']).optional(),
  srcset: z.string().optional()
})

const createSimpleCtaSchema = () => z.object({
  label: z.string().nonempty(),
  to: z.string().nonempty()
})

const createLandingSchema = () => z.object({
  hero: z.object({
    kicker: z.string().nonempty(),
    headline: z.string().nonempty(),
    subheadline: z.string().nonempty(),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema(),
    waitlistCtaLabel: z.string().nonempty(),
    chips: z.array(z.string().nonempty()),
    campaignHint: z.string().nonempty().optional()
  }),
  infoCard: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    affordabilityNote: z.string().nonempty().optional(),
    features: z.array(z.string().nonempty())
  }),
  gallery: z.object({
    title: z.string().nonempty(),
    leadVideo: z.object({
      src: z.string().nonempty().editor({ input: 'media' }),
      poster: z.string().nonempty().editor({ input: 'media' }).optional()
    }).optional(),
    images: z.array(createImageSchema()).min(1)
  }),
  spotlight: z.object({
    label: z.string().nonempty(),
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    statValue: z.string().nonempty(),
    statLabel: z.string().nonempty(),
    cta: createSimpleCtaSchema()
  }).optional(),
  tiersPreview: z.object({
    title: z.string().nonempty(),
    subtitle: z.string().nonempty(),
    items: z.array(
      z.object({
        id: z.string().nonempty(),
        title: z.string().nonempty(),
        body: z.string().nonempty(),
        buttonLabel: z.string().nonempty()
      })
    )
  }),
})

const createFaqSchema = () => z.object({
  hero: z.object({
    kicker: z.string().nonempty(),
    title: z.string().nonempty(),
    description: z.string().nonempty()
  }),
  sidePanel: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema()
  }),
  items: z.array(
    z.object({
      q: z.string().nonempty(),
      a: z.string().nonempty()
    })
  )
})

const createMembershipsSiteSchema = () => z.object({
  hero: z.object({
    kicker: z.string().nonempty(),
    title: z.string().nonempty(),
    description: z.string().nonempty(),
    badges: z.array(z.string().nonempty())
  }),
  infoPanel: z.object({
    title: z.string().nonempty(),
    paragraphs: z.array(z.string().nonempty())
  }),
  creditsExplainer: z.object({
    title: z.string().nonempty(),
    description: z.string().nonempty(),
    bullets: z.array(z.string().nonempty())
  }),
  plans: z.array(
    z.object({
      id: z.string().nonempty(),
      lead: z.string().nonempty(),
      highlights: z.array(z.string().nonempty()),
      detail: z.string().nonempty()
    })
  )
})

const createEquipmentSchema = () => z.object({
  heroTitle: z.string().nonempty(),
  heroBody: z.string().nonempty(),
  includedHeader: z.string().nonempty(),
  equipmentListHeader: z.string().nonempty(),
  guidelinesHeader: z.string().nonempty(),
  includedGear: z.array(z.string().nonempty()),
  equipmentList: z.array(z.string().nonempty()),
  sessionGuidelines: z.array(z.string().nonempty()),
  cta: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema()
  })
})

const createContactSchema = () => z.object({
  hero: z.object({
    kicker: z.string().nonempty(),
    title: z.string().nonempty(),
    description: z.string().nonempty()
  }),
  reasonsPanel: z.object({
    title: z.string().nonempty(),
    items: z.array(z.string().nonempty())
  }),
  detailsPanel: z.object({
    title: z.string().nonempty(),
    intro: z.string().nonempty()
  }),
  mapPanel: z.object({
    title: z.string().nonempty(),
    description: z.string().nonempty()
  }),
  followupPanel: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty()
  }),
  formPanel: z.object({
    title: z.string().nonempty(),
    description: z.string().nonempty(),
    submittedTitle: z.string().nonempty(),
    submittedBody: z.string().nonempty(),
    submitLabel: z.string().nonempty()
  })
})

const createCalendarSchema = () => z.object({
  hero: z.object({
    kicker: z.string().nonempty(),
    title: z.string().nonempty(),
    description: z.string().nonempty()
  }),
  readingPanel: z.object({
    title: z.string().nonempty(),
    points: z.array(z.string().nonempty())
  }),
  nextMovePanel: z.object({
    title: z.string().nonempty(),
    points: z.array(z.string().nonempty()),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema()
  })
})

export default defineContentConfig({
  collections: {
    siteLanding: defineCollection({
      source: 'site/landing.yml',
      type: 'data',
      schema: createLandingSchema()
    }),
    siteFaq: defineCollection({
      source: 'site/faq.yml',
      type: 'data',
      schema: createFaqSchema()
    }),
    siteMemberships: defineCollection({
      source: 'site/memberships.yml',
      type: 'data',
      schema: createMembershipsSiteSchema()
    }),
    siteEquipment: defineCollection({
      source: 'site/equipment.yml',
      type: 'data',
      schema: createEquipmentSchema()
    }),
    siteContact: defineCollection({
      source: 'site/contact.yml',
      type: 'data',
      schema: createContactSchema()
    }),
    siteCalendar: defineCollection({
      source: 'site/calendar.yml',
      type: 'data',
      schema: createCalendarSchema()
    })
  }
})
