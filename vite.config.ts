import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [],
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    // Emit the asset manifest so the post-build script can inject hashed
    // JS/CSS filenames into the service worker precache list.
    manifest: true,
  },
})
