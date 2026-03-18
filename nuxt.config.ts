// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    '@vueuse/nuxt',
    'nuxt-og-image',
    '@nuxtjs/supabase'
  ],

  components: [
    { path: '~/components', pathPrefix: false }
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  vite: {
    optimizeDeps: {
      include: []
    }
  },

  runtimeConfig: {
    contactWebhookUrl: process.env.NUXT_CONTACT_WEBHOOK_URL || '',
    resendApiKey: process.env.NUXT_RESEND_API_KEY || '',
    contactToEmail: process.env.NUXT_CONTACT_TO_EMAIL || 'studio@lafilmlab.com',
    contactFromEmail: process.env.NUXT_CONTACT_FROM_EMAIL || 'FO Studio <no-reply@fostudio.local>',
    public: {
      contactEmail: process.env.NUXT_PUBLIC_CONTACT_EMAIL || 'studio@lafilmlab.com',
      contactPhone: process.env.NUXT_PUBLIC_CONTACT_PHONE || '(323) 999-4300',
      contactLocation: process.env.NUXT_PUBLIC_CONTACT_LOCATION || 'FO Studio, 3131 N. San Fernando Rd., Los Angeles, CA 90065'
    }
  },

  compatibilityDate: '2024-07-11',

  nitro: {
    prerender: {
      routes: [
        '/'
      ],
      crawlLinks: false
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
