// Unit test configuration
// Author: gurvinny
//
// Separate from vite.config.ts on purpose: that one loads the Cloudflare and
// Tailwind plugins, which the unit tests do not need and which pull a worker
// runtime into a plain Node test run.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // tests/e2e is Playwright's. Vitest would collect those .spec.ts files and
    // fail on `@playwright/test` imports it cannot satisfy.
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Reported, not gated. A threshold invites writing tests that move the
      // number rather than tests that would catch a regression.
      reporter: ['text-summary', 'html'],
    },
  },
})
