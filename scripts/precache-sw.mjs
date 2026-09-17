// Post-build script: reads the Vite asset manifest and injects hashed JS/CSS
// filenames into the PRECACHE_ASSETS array in dist/sw.js so the service worker
// precaches the built bundles at install time. Also injects a per-build
// BUILD_ID (a short hash of the manifest) so the cache name changes every
// deploy and the activate handler evicts the previous build's cache.
// Run automatically via: npm run build
//
// Selection lives in precache-lib.mjs so it can be unit-tested without a
// build. Everything here is the bits that need the filesystem -- and the
// failure modes, which are all hard errors on purpose: this script runs last
// in the build, so anything it "skips" ships.
import fs from 'fs'
import crypto from 'crypto'
import { selectPrecacheAssets, readWebgpuFlag } from './precache-lib.mjs'

const manifestPath = 'dist/.vite/manifest.json'
const swPath = 'dist/sw.js'
const flagSourcePath = 'src/ui/AnomalySphere.ts'

function die(msg) {
  console.error(`precache-sw: ${msg}`)
  process.exit(1)
}

// Was a warn + exit(0), which shipped a service worker with an empty precache
// list and reported success.
if (!fs.existsSync(manifestPath)) die(`manifest not found at ${manifestPath}`)

const manifestRaw = fs.readFileSync(manifestPath, 'utf-8')
const manifest = JSON.parse(manifestRaw)

const webgpuEnabled = readWebgpuFlag(fs.readFileSync(flagSourcePath, 'utf-8'))
const { assets, excluded } = selectPrecacheAssets(manifest, { webgpuEnabled })

// An exclusion that stops matching looks exactly like a fix. If three.js
// renames its build files, say so rather than silently precaching them again.
if (!webgpuEnabled && excluded.length === 0) {
  die(
    'ENABLE_WEBGPU_UPGRADE is false but no WebGPU chunk was excluded. Either the ' +
    'chunks are no longer emitted (drop the filter) or they were renamed (update ' +
    'WEBGPU_MODULES in precache-lib.mjs).',
  )
}
if (assets.length === 0) die('nothing selected to precache')

// Deterministic per-build id: any change to a built file changes its hashed
// filename, which changes the manifest, which changes this id.
const buildId = crypto.createHash('sha256').update(manifestRaw).digest('hex').slice(0, 10)

const before = fs.readFileSync(swPath, 'utf-8')
const sw = before
  .replace(
    'const PRECACHE_ASSETS = []',
    `const PRECACHE_ASSETS = ${JSON.stringify(assets)}`,
  )
  .replace(
    "const BUILD_ID = 'dev'",
    `const BUILD_ID = '${buildId}'`,
  )

// String.replace against a literal is silent when it misses, so a whitespace
// change in public/sw.js would have shipped an unpatched worker: no precache
// and a BUILD_ID of 'dev' that never evicts the previous cache.
if (!sw.includes('const PRECACHE_ASSETS = [\"')) die(`PRECACHE_ASSETS sentinel not found in ${swPath}`)
if (sw.includes("const BUILD_ID = 'dev'")) die(`BUILD_ID sentinel not found in ${swPath}`)

fs.writeFileSync(swPath, sw)
console.log(
  `precache-sw: injected ${assets.length} asset(s), excluded ${excluded.length}, ` +
  `build ${buildId}, into ${swPath}`,
)
