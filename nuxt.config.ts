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

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

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
        '/',
        '/calendar',
        '/memberships',
        '/pricing',
        '/blog',
        '/blog/**',
        '/docs/**',
        '/changelog',
        '/changelog/**',
        '/book',
        '/login',
        '/signup',
        '/onboarding',
        '/checkout',
        '/checkout/**'
      ]
    }
  },

  components: [
    { path: '~/components', pathPrefix: false }
  ],

  compatibilityDate: '2024-07-11',

  nitro: {
    prerender: {
      routes: [
        '/'
      ],
      crawlLinks: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
