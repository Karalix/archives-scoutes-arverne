import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests unitaires des modules purs (sans runtime Nuxt). Lancer : npx vitest run [--coverage]
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['shared/utils/access.ts'],
      reporter: ['text', 'text-summary'],
      // L-09 / section 11 : couverture des règles d'accès 100 %
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
