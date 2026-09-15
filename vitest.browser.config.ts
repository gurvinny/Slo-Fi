// Web Audio integration tests
// Author: gurvinny
//
// Separate from vitest.config.ts because these need a real browser. Node has
// no Web Audio implementation and jsdom does not provide one either, so
// OfflineAudioContext -- the thing the export path is built on -- only exists
// here.
//
// Chromium is already installed for the Playwright e2e suite, so this adds a
// runtime, not a dependency.
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    include: ['tests/browser/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
