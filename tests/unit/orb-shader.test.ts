// Author: gurvinny
//
// Structural assertions on the orb's GLSL.
//
// AnomalySphere cannot be constructed without WebGL, so there is no unit or
// jsdom test of the orb itself -- but the shader source is a string, and the
// failure this guards is silent in both directions:
//
//   - a uniform declared in the JS uniforms object but never read by the GLSL
//     is simply ignored, so the driver computes and uploads for nothing
//   - a uniform read by the GLSL with no JS value reads as 0, so the feature is
//     dead while everything still compiles and the orb still renders
//
// The e2e suite proves the shader compiles and the orb draws a live frame; it
// cannot prove a displacement term is actually summed into the output. This
// can, cheaply. It deliberately asserts on USE, not just declaration.
import { describe, it, expect } from 'vitest'
import { VERTEX_SHADER, FRAGMENT_SHADER } from '../../src/ui/AnomalySphere'
import { RIPPLE_CAPACITY, RIPPLE_STRIDE } from '../../src/audio/RippleBank'

/** Occurrences of a bare identifier, so a declaration alone cannot satisfy a use. */
function uses(src: string, name: string): number {
  return (src.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
}

describe('orb vertex shader', () => {
  it.each(['uRadius', 'uShimmer', 'uRipples'])(
    'declares %s and reads it somewhere other than the declaration',
    (name) => {
      expect(VERTEX_SHADER).toContain(`uniform`)
      expect(uses(VERTEX_SHADER, name)).toBeGreaterThan(1)
    },
  )

  it('sums all three ANOMALY III terms into the displacement it outputs', () => {
    // The terms can each exist, be computed, and then not be added -- which
    // compiles, renders, and does nothing. `disp` is the only value that
    // reaches gl_Position, so this is the assertion that matters.
    const disp = /float disp = clamp\(([^,]+),/.exec(VERTEX_SHADER)
    expect(disp, 'the displacement sum has moved or been renamed').not.toBeNull()
    const summed = disp![1]!
    expect(summed).toContain('swell')
    expect(summed).toContain('shimmer')
    expect(summed).toContain('ripple')
  })

  it('declares the ripple uniform at the size RippleBank packs', () => {
    // pack() writes RIPPLE_CAPACITY * RIPPLE_STRIDE floats = this many vec4s.
    // A shorter array in the GLSL would silently drop the tail ripples; a
    // longer one would read uninitialised slots as displacement.
    const vec4s = (RIPPLE_CAPACITY * RIPPLE_STRIDE) / 4
    expect(VERTEX_SHADER).toContain(`uniform vec4 uRipples[${vec4s}];`)
  })

  it('walks every ripple slot the bank can fill', () => {
    const loop = /for \(int i = 0; i < (\d+); i\+\+\)/.exec(VERTEX_SHADER)
    expect(loop, 'the ripple loop has moved or been renamed').not.toBeNull()
    expect(Number(loop![1])).toBe(RIPPLE_CAPACITY)
  })

  it('keeps the wavefront wide enough to survive the mobile vertex spacing', () => {
    // Mean angular vertex spacing is ~0.07 rad at icosahedron detail 4, which
    // is what the mobile branch builds, against ~0.018 at detail 6. A wavefront
    // narrower than the spacing does not look thinner on mobile -- it falls
    // between vertices and disappears. Three times the spacing is the floor.
    const w = /const float RIPPLE_W = ([\d.]+);/.exec(VERTEX_SHADER)
    expect(w, 'RIPPLE_W has moved or been renamed').not.toBeNull()
    expect(Number(w![1])).toBeGreaterThan(0.21)
  })
})

describe('orb fragment shader', () => {
  it('reads uShimmer rather than only declaring it', () => {
    expect(uses(FRAGMENT_SHADER, 'uShimmer')).toBeGreaterThan(1)
  })
})
