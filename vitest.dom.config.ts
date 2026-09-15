// DOM test configuration
// Author: gurvinny
//
// A third config rather than a `projects` split so the unit suite keeps a plain
// `node` environment. The DSP code under tests/unit makes Node-only assumptions
// in places, and a jsdom global leaking into that run would let a browser-only
// path pass there without anyone noticing which environment proved it.
//
// The reverse also holds: the browser config exists because jsdom has no Web
// Audio. jsdom is right for the src/ui controllers, which touch only the DOM.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/dom/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
})
