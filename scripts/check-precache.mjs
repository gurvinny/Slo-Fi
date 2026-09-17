// Gates the artifact that actually ships, not the logic that produced it.
//
// tests/unit/precache.test.ts proves the selection drops the WebGPU chunks and
// keeps everything else, but it drives the function directly. This reads
// dist/sw.js after a real build, which is the only thing that proves the build
// wired the selection in at all -- a precache list can be wrong because the
// filter is wrong or because the injection silently missed.
//
// INVERT THIS IN THE WEBGPU PHASE. When ENABLE_WEBGPU_UPGRADE flips true the
// chunks legitimately return to the precache list and the first assertion below
// becomes wrong, not the build.
import fs from 'fs'
import { readWebgpuFlag } from './precache-lib.mjs'

const swPath = 'dist/sw.js'
const failures = []

if (!fs.existsSync(swPath)) {
  console.error(`check-precache: ${swPath} not found -- run npm run build first`)
  process.exit(1)
}

const sw = fs.readFileSync(swPath, 'utf-8')
const webgpuEnabled = readWebgpuFlag(fs.readFileSync('src/ui/AnomalySphere.ts', 'utf-8'))

const m = /const PRECACHE_ASSETS = (\[[^\]]*\])/.exec(sw)
if (!m) failures.push('PRECACHE_ASSETS was never injected -- the sentinel did not match')

const assets = m ? JSON.parse(m[1]) : []

// The defect: ~197 KB gzip of code the runtime cannot reach, fetched by every
// visitor at install time because cache.addAll is unconditional.
const dead = assets.filter((a) => /three\.(webgpu|tsl)/.test(a))
if (!webgpuEnabled && dead.length > 0) {
  failures.push(`WebGPU chunks precached while the upgrade is disabled: ${dead.join(', ')}`)
}
if (webgpuEnabled && dead.length === 0) {
  failures.push('ENABLE_WEBGPU_UPGRADE is true but no WebGPU chunk is precached')
}

// And the other direction: a filter that removed everything would satisfy the
// check above. The entry bundle, its stylesheet and the orb chunk are what a
// visitor loads on first paint and must stay in the list.
if (!assets.some((a) => /\/assets\/index-.*\.js$/.test(a))) failures.push('entry JS is not precached')
if (!assets.some((a) => /\/assets\/index-.*\.css$/.test(a))) failures.push('entry CSS is not precached')
if (!assets.some((a) => /\/assets\/AnomalySphere-.*\.js$/.test(a))) failures.push('the orb chunk is not precached')

if (/const BUILD_ID = 'dev'/.test(sw)) {
  failures.push("BUILD_ID is still 'dev' -- the cache name never changes and activate evicts nothing")
}

if (failures.length > 0) {
  for (const f of failures) console.error(`check-precache: ${f}`)
  process.exit(1)
}

console.log(`check-precache: ${assets.length} asset(s) precached, no unreachable WebGPU chunks`)
