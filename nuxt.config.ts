// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@nuxthub/core', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],

  auth: {
    webAuthn: true,
  },

  hub: {
    db: 'sqlite',
    blob: true,
  },

  runtimeConfig: {
    // NUXT_SESSION_PASSWORD est lu directement par nuxt-auth-utils
    session: {
      name: 'archives-session',
      password: '',
      maxAge: 60 * 60 * 24 * 30,
      cookie: { sameSite: 'lax', httpOnly: true, secure: true },
    },
    installToken: '', // NUXT_INSTALL_TOKEN
    mediaSigningKey: '', // NUXT_MEDIA_SIGNING_KEY
    instanceId: 'default',
    public: {
      version: '0.1.0',
      sourceRepo: 'karalix/archives-scoutes',
    },
  },

  routeRules: {
    '/admin/**': { ssr: false },
    '/install': { ssr: false },
  },

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
    experimental: { tasks: true },
    scheduledTasks: {
      // L-14 : sauvegarde hebdomadaire (lundi 3h UTC)
      '0 3 * * 1': ['backup:weekly'],
      // A-10 / L-05 : purge corbeille (30 j), journaux techniques (30 j)
      '15 3 * * *': ['purge:daily'],
    },
  },

  hooks: {
    // Erreurs API en application/problem+json (I-10), avant le gestionnaire Nuxt (pages d'erreur)
    'nitro:config'(cfg) {
      cfg.errorHandler = ['~~/server/error.ts', ...[cfg.errorHandler].flat().filter((h): h is string => !!h)]
    },
  },

  typescript: { strict: true },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [{ rel: 'manifest', href: '/manifest.webmanifest' }],
    },
  },
})
