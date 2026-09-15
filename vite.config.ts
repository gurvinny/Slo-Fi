import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), cloudflare()],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Emit the asset manifest so the post-build script can inject hashed
    // JS/CSS filenames into the service worker precache list.
    manifest: true,
    rollupOptions: {
      // INEFFECTIVE_DYNAMIC_IMPORT means a module is imported both statically
      // and dynamically, so the dynamic import splits nothing out and its
      // bytes ship on first load regardless. It printed on every build for
      // four three.js postprocessing passes and was simply read past for
      // months, which is what a warning nobody has to act on becomes. Failing
      // the build is the only way it stays fixed.
      onwarn(warning, defaultHandler) {
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') {
          throw new Error(`${warning.code}: ${warning.message}`)
        }
        defaultHandler(warning)
      },
    },
  },
})