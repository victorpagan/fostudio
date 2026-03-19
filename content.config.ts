import { defineCollection, z } from '@nuxt/content'

const variantEnum = z.enum(['solid', 'outline', 'subtle', 'soft', 'ghost', 'link'])
const colorEnum = z.enum(['primary', 'secondary', 'neutral', 'error', 'warning', 'success', 'info'])
const sizeEnum = z.enum(['xs', 'sm', 'md', 'lg', 'xl'])
const orientationEnum = z.enum(['vertical', 'horizontal'])

const createBaseSchema = () => z.object({
  title: z.string().nonempty(),
  description: z.string().nonempty()
})

const createFeatureItemSchema = () => createBaseSchema().extend({
  icon: z.string().nonempty().editor({ input: 'icon' })
})

const createLinkSchema = () => z.object({
  label: z.string().nonempty(),
  to: z.string().nonempty(),
  icon: z.string().optional().editor({ input: 'icon' }),
  size: sizeEnum.optional(),
  trailing: z.boolean().optional(),
  target: z.string().optional(),
  color: colorEnum.optional(),
  variant: variantEnum.optional()
})

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
  }),
  index: defineCollection({
    source: '0.index.yml',
    type: 'page',
    schema: z.object({
      hero: z.object(({
        links: z.array(createLinkSchema())
      })),
      sections: z.array(
        createBaseSchema().extend({
          id: z.string().nonempty(),
          orientation: orientationEnum.optional(),
          reverse: z.boolean().optional(),
          features: z.array(createFeatureItemSchema())
        })
      ),
      features: createBaseSchema().extend({
        items: z.array(createFeatureItemSchema())
      }),
      testimonials: createBaseSchema().extend({
        headline: z.string().optional(),
        items: z.array(
          z.object({
            quote: z.string().nonempty(),
            user: z.object({
              name: z.string().nonempty(),
              description: z.string().nonempty(),
              to: z.string().nonempty(),
              target: z.string().nonempty(),
              avatar: createImageSchema()
            })
          })
        )
      }),
      cta: createBaseSchema().extend({
        links: z.array(createLinkSchema())
      })
    })
  }),
  docs: defineCollection({
    source: '1.docs/**/*',
    type: 'page'
  }),
  pricing: defineCollection({
    source: '2.pricing.yml',
    type: 'page',
    schema: z.object({
      plans: z.array(
        z.object({
          title: z.string().nonempty(),
          description: z.string().nonempty(),
          price: z.object({
            month: z.string().nonempty(),
            year: z.string().nonempty()
          }),
          billing_period: z.string().nonempty(),
          billing_cycle: z.string().nonempty(),
          button: createLinkSchema(),
          features: z.array(z.string().nonempty()),
          highlight: z.boolean().optional()
        })
      ),
      logos: z.object({
        title: z.string().nonempty(),
        icons: z.array(z.string())
      }),
      faq: createBaseSchema().extend({
        items: z.array(
          z.object({
            label: z.string().nonempty(),
            content: z.string().nonempty()
          })
        )
      })
    })
  }),
  blog: defineCollection({
    source: '3.blog.yml',
    type: 'page'
  }),
  posts: defineCollection({
    source: '3.blog/**/*',
    type: 'page',
    schema: z.object({
      image: z.object({ src: z.string().nonempty().editor({ input: 'media' }) }),
      authors: z.array(
        z.object({
          name: z.string().nonempty(),
          to: z.string().nonempty(),
          avatar: z.object({ src: z.string().nonempty().editor({ input: 'media' }) })
        })
      ),
      date: z.date(),
      badge: z.object({ label: z.string().nonempty() })
    })
  }),
  changelog: defineCollection({
    source: '4.changelog.yml',
    type: 'page'
  }),
  versions: defineCollection({
    source: '4.changelog/**/*',
    type: 'page',
    schema: z.object({
      title: z.string().nonempty(),
      description: z.string(),
      date: z.date(),
      image: z.string()
    })
  })
}
