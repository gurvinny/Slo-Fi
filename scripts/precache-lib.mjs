// Selection logic for the service worker's install-time precache list, split
// out of precache-sw.mjs so it can be tested without a build.
//
// Why this exists: public/sw.js precaches with cache.addAll, which is atomic
// and unconditional. Every URL in the list is fetched by every visitor before
// the worker activates. Taking every manifest entry therefore made the code
// split pointless for anything gated off at runtime -- the chunks were
// correctly separate and then downloaded anyway.

/**
 * Modules reachable only through the WebGPU upgrade path.
 *
 * Matched against the manifest KEY (the source module id), not the emitted
 * filename: the key is what the import specifier resolves to and is stable
 * regardless of how Rollup names the chunk.
 */
const WEBGPU_MODULES = /three\/build\/three\.(webgpu|tsl)\.js$/

/**
 * Read ENABLE_WEBGPU_UPGRADE out of the source that owns it.
 *
 * The flag is a plain const inside AnomalySphere's constructor rather than a
 * build-time define, so this is a parse rather than an import. It throws
 * instead of defaulting: a default would silently restore the 200 KB the
 * moment a rename made the flag unfindable, which is the defect itself.
 */
export function readWebgpuFlag(source) {
  const m = /const\s+ENABLE_WEBGPU_UPGRADE\s*=\s*(true|false)\b/.exec(source)
  if (!m) {
    throw new Error(
      'precache: could not read ENABLE_WEBGPU_UPGRADE -- refusing to guess whether ' +
      'the WebGPU chunks are reachable. Update scripts/precache-lib.mjs if the flag moved.',
    )
  }
  return m[1] === 'true'
}

/**
 * Flatten a Vite manifest into the precache list.
 *
 * Returns the assets to precache and the ones deliberately left out, so the
 * caller can treat "excluded nothing" as a hard error. An exclusion that
 * quietly stops matching looks identical to a fix.
 */
export function selectPrecacheAssets(manifest, { webgpuEnabled }) {
  const assets = []
  const excluded = []

  for (const [key, entry] of Object.entries(manifest)) {
    const files = []
    if (entry.file) files.push('/' + entry.file)
    if (entry.css) files.push(...entry.css.map((f) => '/' + f))

    if (!webgpuEnabled && WEBGPU_MODULES.test(key)) excluded.push(...files)
    else assets.push(...files)
  }

  return { assets, excluded }
}
