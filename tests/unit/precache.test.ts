// Author: gurvinny
//
// The service worker precaches its asset list with cache.addAll at install
// time, which is atomic and unconditional: every URL in that list is
// downloaded by every visitor on every device before the SW activates. The
// list was built from every entry in the Vite manifest with no filter, so it
// included three.webgpu and three.tsl -- ~200 KB gzip of code that cannot
// execute, because the WebGPU upgrade is gated behind a hardcoded false.
//
// These tests drive the selection directly rather than inspecting a build, so
// they run in the unit suite with no dist/ and cannot quietly skip. The
// shipped artifact is checked separately, in CI, after a real build.
import { describe, it, expect } from 'vitest'
// @ts-expect-error -- plain .mjs build script, no types
import { selectPrecacheAssets, readWebgpuFlag } from '../../scripts/precache-lib.mjs'

/**
 * The real manifest's shape, reduced to the graph that matters:
 *
 *   index.html -> AnomalySphere (dynamic) -> three.webgpu -> three.tsl
 *
 * Both three chunks are genuine dynamic entries -- the code split works. The
 * defect was never the split; it was the precache list undoing it.
 */
function manifest() {
  return {
    'index.html': {
      file: 'assets/index-AAAA.js',
      css: ['assets/index-BBBB.css'],
      isEntry: true,
      dynamicImports: ['src/ui/AnomalySphere.ts'],
    },
    'src/ui/AnomalySphere.ts': {
      file: 'assets/AnomalySphere-CCCC.js',
      isDynamicEntry: true,
      dynamicImports: [
        'node_modules/three/build/three.webgpu.js',
        'node_modules/three/build/three.tsl.js',
      ],
    },
    'node_modules/three/build/three.webgpu.js': {
      file: 'assets/three.webgpu-DDDD.js',
      isDynamicEntry: true,
    },
    'node_modules/three/build/three.tsl.js': {
      file: 'assets/three.tsl-EEEE.js',
      isDynamicEntry: true,
    },
  }
}

describe('selectPrecacheAssets', () => {
  it('drops the WebGPU chunks while the upgrade is disabled', () => {
    const { assets } = selectPrecacheAssets(manifest(), { webgpuEnabled: false })
    expect(assets.filter((a: string) => /three\.(webgpu|tsl)/.test(a))).toEqual([])
  })

  it('still precaches everything a visitor actually loads', () => {
    // The half that fails if the filter becomes "drop anything named three".
    // AnomalySphere is a dynamic import but the orb is the app, so it belongs
    // in the install-time list; dropping it would trade one regression for
    // another and the assertion above would not notice.
    const { assets } = selectPrecacheAssets(manifest(), { webgpuEnabled: false })
    expect(assets).toContain('/assets/index-AAAA.js')
    expect(assets).toContain('/assets/index-BBBB.css')
    expect(assets).toContain('/assets/AnomalySphere-CCCC.js')
  })

  it('reports what it excluded, so an exclusion that matches nothing is visible', () => {
    // If three.js renames its build files the pattern silently matches nothing
    // and the chunks come back. The caller turns an empty exclusion into a hard
    // error rather than a quiet green -- same lesson as the Trivy base-image
    // matrix, where a hardcoded list drifted without failing.
    const { excluded } = selectPrecacheAssets(manifest(), { webgpuEnabled: false })
    expect(excluded).toHaveLength(2)
  })

  it('precaches the WebGPU chunks again once the upgrade is enabled', () => {
    // INVERT THIS TEST IN THE WEBGPU PHASE. When ENABLE_WEBGPU_UPGRADE flips
    // true these chunks legitimately return and the first test above becomes
    // wrong, not the code.
    const { assets, excluded } = selectPrecacheAssets(manifest(), { webgpuEnabled: true })
    expect(assets).toContain('/assets/three.webgpu-DDDD.js')
    expect(assets).toContain('/assets/three.tsl-EEEE.js')
    expect(excluded).toEqual([])
  })

  it('ignores manifest entries that carry no file', () => {
    const { assets } = selectPrecacheAssets({ 'x.css': { css: ['assets/x-FFFF.css'] } }, { webgpuEnabled: false })
    expect(assets).toEqual(['/assets/x-FFFF.css'])
  })
})

describe('readWebgpuFlag', () => {
  it('reads the flag out of the source that owns it', () => {
    // One source of truth: the build script reads the same const the runtime
    // branches on, instead of restating it and drifting.
    expect(readWebgpuFlag('  const ENABLE_WEBGPU_UPGRADE = false\n')).toBe(false)
    expect(readWebgpuFlag('  const ENABLE_WEBGPU_UPGRADE = true\n')).toBe(true)
  })

  it('throws rather than guessing when the flag is missing or unreadable', () => {
    // A default here would be the whole defect again: silently precaching
    // 200 KB because a rename made the flag unfindable.
    expect(() => readWebgpuFlag('const SOMETHING_ELSE = false')).toThrow(/ENABLE_WEBGPU_UPGRADE/)
    expect(() => readWebgpuFlag('const ENABLE_WEBGPU_UPGRADE = maybe')).toThrow(/ENABLE_WEBGPU_UPGRADE/)
  })
})
