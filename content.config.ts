import { defineCollection, z } from '@nuxt/content'

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
    headline: z.string().nonempty(),
    subheadline: z.string().nonempty(),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema(),
    chips: z.array(z.string().nonempty()),
    media: z.object({
      type: z.string().optional(),
      images: z.array(createImageSchema()).optional()
    }).optional()
  }),
  howItWorks: z.object({
    title: z.string().nonempty(),
    steps: z.array(
      z.object({
        title: z.string().nonempty(),
        body: z.string().nonempty()
      })
    )
  }),
  membershipsPreview: z.object({
    title: z.string().nonempty(),
    subtitle: z.string().nonempty(),
    cta: createSimpleCtaSchema()
  }),
  valueProps: z.object({
    title: z.string().nonempty(),
    bullets: z.array(z.string().nonempty()),
    cta: createSimpleCtaSchema()
  }),
  fairness: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    bullets: z.array(z.string().nonempty())
  }),
  faq: z.object({
    title: z.string().nonempty()
  }),
  finalCta: z.object({
    title: z.string().nonempty(),
    body: z.string().nonempty(),
    primaryCta: createSimpleCtaSchema(),
    secondaryCta: createSimpleCtaSchema()
  })
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
  tiers: z.array(
    z.object({
      id: z.string().nonempty(),
      name: z.string().nonempty(),
      price: z.number(),
      credits: z.number(),
      bookingWindowDays: z.number(),
      tagline: z.string().nonempty(),
      bestFor: z.array(z.string().nonempty()),
      cap: z.number()
    })
  )
})

const createEquipmentSchema = () => z.object({
  heroTitle: z.string().nonempty(),
  heroBody: z.string().nonempty(),
  includedHeader: z.string().nonempty(),
  guidelinesHeader: z.string().nonempty(),
  includedGear: z.array(z.string().nonempty()),
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

export const collections = {
  siteLanding: defineCollection({
    source: 'site/landing.yml',
    type: 'page',
    schema: createLandingSchema()
  }),
  siteFaq: defineCollection({
    source: 'site/faq.yml',
    type: 'page',
    schema: createFaqSchema()
  }),
  siteMemberships: defineCollection({
    source: 'site/memberships.yml',
    type: 'page',
    schema: createMembershipsSiteSchema()
  }),
  siteEquipment: defineCollection({
    source: 'site/equipment.yml',
    type: 'page',
    schema: createEquipmentSchema()
  }),
  siteContact: defineCollection({
    source: 'site/contact.yml',
    type: 'page',
    schema: createContactSchema()
  })
}
