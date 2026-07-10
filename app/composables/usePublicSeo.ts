import { toValue, type MaybeRefOrGetter } from 'vue'

type PublicSeoSource = {
  title?: string
  description?: string
  keywords?: string[]
  canonicalPath?: string
  robots?: string
  og?: {
    title?: string
    description?: string
    image?: string
    type?: string
  }
  twitter?: {
    card?: string
    title?: string
    description?: string
    image?: string
  }
  schema?: {
    pageType?: string
  }
}

export type PublicSeoDefaults = {
  title: string
  description: string
  canonicalPath: string
  image?: string
  schemaType?: string
  keywords?: string[]
}

export type PublicSeoOptions = PublicSeoDefaults & {
  robots?: string
  ogTitle?: string
  ogDescription?: string
  ogType?: string
  twitterCard?: string
  twitterTitle?: string
  twitterDescription?: string
  structuredData?: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function readSeoSource(content: unknown): PublicSeoSource {
  const source = asRecord(content)
  const meta = asRecord(source?.meta)
  const seo = asRecord(meta?.seo) ?? asRecord(source?.seo)
  return (seo ?? {}) as PublicSeoSource
}

export function resolvePublicSeo(content: unknown, defaults: PublicSeoDefaults): PublicSeoOptions {
  const seo = readSeoSource(content)

  return {
    title: seo.title?.trim() || defaults.title,
    description: seo.description?.trim() || defaults.description,
    canonicalPath: seo.canonicalPath?.trim() || defaults.canonicalPath,
    image: seo.og?.image?.trim() || seo.twitter?.image?.trim() || defaults.image || '/images/main-banner.webp',
    schemaType: seo.schema?.pageType?.trim() || defaults.schemaType || 'WebPage',
    keywords: Array.isArray(seo.keywords) && seo.keywords.length ? seo.keywords : defaults.keywords,
    robots: seo.robots?.trim() || 'index,follow,max-image-preview:large',
    ogTitle: seo.og?.title?.trim() || seo.title?.trim() || defaults.title,
    ogDescription: seo.og?.description?.trim() || seo.description?.trim() || defaults.description,
    ogType: seo.og?.type?.trim() || 'website',
    twitterCard: seo.twitter?.card?.trim() || 'summary_large_image',
    twitterTitle: seo.twitter?.title?.trim() || seo.og?.title?.trim() || seo.title?.trim() || defaults.title,
    twitterDescription: seo.twitter?.description?.trim() || seo.og?.description?.trim() || seo.description?.trim() || defaults.description
  }
}

function absoluteUrl(siteUrl: string, path: string) {
  const normalizedSiteUrl = siteUrl.trim().replace(/\/+$/, '') || 'https://fo.studio'
  try {
    return new URL(path, `${normalizedSiteUrl}/`).toString()
  } catch {
    return `https://fo.studio${path.startsWith('/') ? path : `/${path}`}`
  }
}

function serializeSchema(value: Record<string, unknown>) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
}

export function usePublicSeo(source: MaybeRefOrGetter<PublicSeoOptions>) {
  const config = useRuntimeConfig()

  useHead(() => {
    const options = toValue(source)
    const siteUrl = String(config.public.siteUrl ?? 'https://fo.studio')
    const canonical = absoluteUrl(siteUrl, options.canonicalPath)
    const image = absoluteUrl(siteUrl, options.image || '/images/main-banner.webp')
    const schema = options.structuredData ?? {
      '@type': options.schemaType || 'WebPage',
      'name': options.title,
      'description': options.description,
      'url': canonical,
      ...(options.schemaType === 'WebSite'
        ? {}
        : {
            isPartOf: {
              '@type': 'WebSite',
              'name': 'FO Studio',
              'url': absoluteUrl(siteUrl, '/')
            }
          })
    }
    const structuredData = {
      '@context': 'https://schema.org',
      ...schema,
      'url': schema.url ?? canonical
    }

    return {
      title: options.title,
      titleTemplate: null,
      link: [
        { key: 'canonical', rel: 'canonical', href: canonical }
      ],
      meta: [
        { key: 'description', name: 'description', content: options.description },
        { key: 'robots', name: 'robots', content: options.robots || 'index,follow,max-image-preview:large' },
        ...(options.keywords?.length
          ? [{ key: 'keywords', name: 'keywords', content: options.keywords.join(', ') }]
          : []),
        { key: 'og-site-name', property: 'og:site_name', content: 'FO Studio' },
        { key: 'og-title', property: 'og:title', content: options.ogTitle || options.title },
        { key: 'og-description', property: 'og:description', content: options.ogDescription || options.description },
        { key: 'og-type', property: 'og:type', content: options.ogType || 'website' },
        { key: 'og-url', property: 'og:url', content: canonical },
        { key: 'og-image', property: 'og:image', content: image },
        { key: 'twitter-card', name: 'twitter:card', content: options.twitterCard || 'summary_large_image' },
        { key: 'twitter-title', name: 'twitter:title', content: options.twitterTitle || options.ogTitle || options.title },
        { key: 'twitter-description', name: 'twitter:description', content: options.twitterDescription || options.ogDescription || options.description },
        { key: 'twitter-image', name: 'twitter:image', content: image }
      ],
      script: [
        {
          key: 'public-page-schema',
          type: 'application/ld+json',
          innerHTML: serializeSchema(structuredData)
        }
      ]
    }
  })
}

export function useNoindexSeo(options: {
  title: string
  description: string
  canonicalPath: string
}) {
  const config = useRuntimeConfig()

  useHead(() => ({
    title: options.title,
    titleTemplate: null,
    link: [
      {
        key: 'canonical',
        rel: 'canonical',
        href: absoluteUrl(String(config.public.siteUrl ?? 'https://fo.studio'), options.canonicalPath)
      }
    ],
    meta: [
      { key: 'description', name: 'description', content: options.description },
      { key: 'robots', name: 'robots', content: 'noindex,nofollow,noarchive' },
      { key: 'googlebot', name: 'googlebot', content: 'noindex,nofollow,noarchive' }
    ]
  }))
}
