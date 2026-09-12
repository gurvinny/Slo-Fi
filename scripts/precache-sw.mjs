// Post-build script: reads the Vite asset manifest and injects hashed
// JS/CSS filenames into the PRECACHE_ASSETS array in dist/sw.js so the
// service worker precaches all built bundles at install time. Also injects a
// per-build BUILD_ID (a short hash of the manifest) so the cache name changes
// every deploy and the activate handler evicts the previous build's cache.
// Run automatically via: npm run build
import fs from 'fs'
import crypto from 'crypto'

const manifestPath = 'dist/.vite/manifest.json'
const swPath = 'dist/sw.js'

if (!fs.existsSync(manifestPath)) {
  console.warn('precache-sw: manifest not found, skipping precache injection')
  process.exit(0)
}

const manifestRaw = fs.readFileSync(manifestPath, 'utf-8')
const manifest = JSON.parse(manifestRaw)

const assets = Object.values(manifest).flatMap((entry) => {
  const files = []
  if (entry.file) files.push('/' + entry.file)
  if (entry.css) files.push(...entry.css.map((f) => '/' + f))
  return files
})

// Deterministic per-build id: any change to a built file changes its hashed
// filename, which changes the manifest, which changes this id.
const buildId = crypto.createHash('sha256').update(manifestRaw).digest('hex').slice(0, 10)

let sw = fs.readFileSync(swPath, 'utf-8')
sw = sw
  .replace(
    'const PRECACHE_ASSETS = []',
    `const PRECACHE_ASSETS = ${JSON.stringify(assets)}`,
  )
  .replace(
    "const BUILD_ID = 'dev'",
    `const BUILD_ID = '${buildId}'`,
  )
fs.writeFileSync(swPath, sw)
console.log(`precache-sw: injected ${assets.length} asset(s), build ${buildId}, into ${swPath}`)
