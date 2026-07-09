const studioModuleEnabled = process.env.NUXT_STUDIO_ENABLED
  ? process.env.NUXT_STUDIO_ENABLED === 'true'
  : process.env.NODE_ENV === 'production'

const modules = [
  '@nuxt/eslint',
  '@nuxt/image',
  '@nuxt/ui',
  '@nuxt/content',
  ...(studioModuleEnabled ? ['nuxt-studio'] : []),
  '@vueuse/nuxt',
  'nuxt-og-image',
  '@nuxtjs/supabase'
]

const studioRepoPrivate = process.env.STUDIO_REPOSITORY_PRIVATE
  ? process.env.STUDIO_REPOSITORY_PRIVATE.toLowerCase() !== 'false'
  : true
const studioDevEnabled = process.env.NUXT_STUDIO_DEV === 'true'
const studioRepositoryProvider = process.env.STUDIO_REPOSITORY_PROVIDER === 'gitlab' ? 'gitlab' : 'github'
const productionSecurityHeaders = {
  'Content-Security-Policy': [
    'default-src \'self\'',
    'base-uri \'self\'',
    'object-src \'none\'',
    'frame-ancestors \'self\'',
    'form-action \'self\' https://squareup.com https://*.squareup.com',
    'script-src \'self\' \'unsafe-inline\' https://web.squarecdn.com https://www.googletagmanager.com',
    'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com',
    'font-src \'self\' data: https://fonts.gstatic.com',
    'img-src \'self\' data: blob: https:',
    'media-src \'self\' https://res.cloudinary.com',
    'connect-src \'self\' https://*.supabase.co wss://*.supabase.co https://web.squarecdn.com https://www.google-analytics.com https://www.googletagmanager.com',
    'frame-src \'self\' https://web.squarecdn.com https://maps.google.com https://www.google.com',
    'worker-src \'self\' blob:',
    'upgrade-insecure-requests'
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none'
}

const normalizeStudioRootDir = (value?: string) => {
  const normalized = (value ?? '').trim().replace(/^\/+|\/+$/g, '')
  return normalized
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules,

  components: [
    { path: '~/components', pathPrefix: false }
  ],

  devtools: {
    enabled: process.env.NODE_ENV !== 'production'
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    editorImageBucket: process.env.NUXT_EDITOR_IMAGE_BUCKET || process.env.EDITOR_IMAGE_BUCKET || 'mail-assets',
    contactWebhookUrl: process.env.NUXT_CONTACT_WEBHOOK_URL || '',
    resendApiKey: process.env.NUXT_RESEND_API_KEY || '',
    contactToEmail: process.env.NUXT_CONTACT_TO_EMAIL || 'studio@lafilmlab.com',
    contactFromEmail: process.env.NUXT_CONTACT_FROM_EMAIL || 'FO Studio <no-reply@fostudio.local>',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://fo.studio',
      contactEmail: process.env.NUXT_PUBLIC_CONTACT_EMAIL || 'studio@lafilmlab.com',
      contactPhone: process.env.NUXT_PUBLIC_CONTACT_PHONE || '(323) 999-4300',
      contactLocation: process.env.NUXT_PUBLIC_CONTACT_LOCATION || 'FO Studio, 3131 N. San Fernando Rd., Los Angeles, CA 90065'
    }
  },

  routeRules: process.env.NODE_ENV === 'production'
    ? {
        '/**': { headers: productionSecurityHeaders }
      }
    : {},

  compatibilityDate: '2024-07-11',

  nitro: {
    minify: false,
    esbuild: {
      options: {
        target: 'es2022'
      }
    },
    hooks: {
      'prerender:routes'(routes) {
        for (const route of Array.from(routes)) {
          if (route.startsWith('/__nuxt_content/')) {
            routes.delete(route)
          }
        }
      }
    },
    prerender: {
      routes: [],
      crawlLinks: false
    }
  },

  vite: {
    build: {
      target: 'es2022',
      sourcemap: false
    },
    optimizeDeps: {
      include: []
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },
  studio: studioModuleEnabled
    ? {
        // Keep Studio disabled in normal local dev sessions to avoid editor-runtime
        // noise in app pages. Opt-in locally with NUXT_STUDIO_ENABLED=true.
        dev: studioDevEnabled,
        route: process.env.NUXT_STUDIO_ROUTE || '/_studio',
        repository: {
          provider: studioRepositoryProvider,
          owner: process.env.STUDIO_REPOSITORY_OWNER || 'victorpagan',
          repo: process.env.STUDIO_REPOSITORY_REPO || 'fostudio',
          branch: process.env.STUDIO_REPOSITORY_BRANCH || 'main',
          rootDir: normalizeStudioRootDir(process.env.STUDIO_REPOSITORY_ROOT_DIR),
          private: studioRepoPrivate
        }
      }
    : false,

  supabase: {
    // Point the module at our local types file so useSupabaseClient() is
    // fully typed everywhere without needing explicit generic parameters.
    // Use the Nuxt alias ~/types (resolves to app/types in Nuxt 4)
    types: '~/types/database.types.ts',
    redirectOptions: {
      login: '/login',
      callback: '/onboarding',
      // Routes accessible without authentication
      // /book is intentionally included — the page itself handles
      // the member vs guest split; middleware is not used there
      exclude: [
        // Public marketing / info pages
        '/',
        '/calendar',
        '/memberships',
        '/equipment',
        '/faq',
        '/contact',
        '/site',
        '/site/**',
        '/policies',
        '/pricing',
        // Auth pages
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/onboarding',
        // Booking & checkout (page-level auth guards handle branching)
        '/book',
        '/checkout',
        '/checkout/**'
        // Misc
      ]
    }
  }
})
