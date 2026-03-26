// Post-build script: reads the Vite asset manifest and injects hashed
// JS/CSS filenames into the PRECACHE_ASSETS array in dist/sw.js so the
// service worker precaches all built bundles at install time.
// Run automatically via: npm run build
import fs from 'fs'

const manifestPath = 'dist/.vite/manifest.json'
const swPath = 'dist/sw.js'

if (!fs.existsSync(manifestPath)) {
  console.warn('precache-sw: manifest not found, skipping precache injection')
  process.exit(0)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

const assets = Object.values(manifest).flatMap((entry) => {
  const files = []
  if (entry.file) files.push('/' + entry.file)
  if (entry.css) files.push(...entry.css.map((f) => '/' + f))
  return files
})

let sw = fs.readFileSync(swPath, 'utf-8')
sw = sw.replace(
  'const PRECACHE_ASSETS = []',
  `const PRECACHE_ASSETS = ${JSON.stringify(assets)}`,
)
fs.writeFileSync(swPath, sw)
console.log(`precache-sw: injected ${assets.length} asset(s) into ${swPath}`)
