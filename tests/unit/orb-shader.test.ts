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
    const mass = /float mass\s+= clamp\(([^,]+),\s*-?([\d.]+)/.exec(VERTEX_SHADER)
    const tran = /float transient = clamp\(([^,]+),\s*-?([\d.]+)/.exec(VERTEX_SHADER)
    const disp = /float disp = \(([^)]+)\)/.exec(VERTEX_SHADER)
    expect(mass, 'the mass budget has moved or been renamed').not.toBeNull()
    expect(tran, 'the transient budget has moved or been renamed').not.toBeNull()
    expect(disp, 'the displacement sum has moved or been renamed').not.toBeNull()

    expect(mass![1]).toContain('swell')
    expect(tran![1]).toContain('shimmer')
    expect(tran![1]).toContain('ripple')
    // Both budgets have to reach the output, or a whole layer is computed and
    // discarded -- which is exactly what shipped and could not be seen.
    expect(disp![1]).toContain('mass')
    expect(disp![1]).toContain('transient')
  })

  it('reserves the transients a budget the sustained terms cannot eat', () => {
    // THE regression this file exists for, and it shipped once.
    //
    // With a single clamp over every term, the sustained ones starve the
    // transient ones: measured at the default reactivity on loud material,
    // swell + d1 alone came to 0.56 against a 0.52 ceiling, so ripple (max
    // 0.16) and shimmer (max 0.014) were clipped to nothing. Layer 2 existed,
    // was computed, was uploaded, and was invisible.
    //
    // A reserved budget is the only structure that makes a beat always able to
    // displace, however loud the bass is. Asserting it is >= the largest single
    // ripple contribution is what stops it being quietly shaved away later.
    const tran = /float transient = clamp\([^,]+,\s*-([\d.]+),\s*([\d.]+)\)/.exec(VERTEX_SHADER)
    expect(tran, 'the transient budget has moved or been renamed').not.toBeNull()
    const [lo, hi] = [Number(tran![1]), Number(tran![2])]
    expect(lo).toBe(hi)

    // The per-ripple amplitude in the accumulation line: strength * band * fade * K.
    const amp = /ripple \+= strength \* band \* \(1\.0 - head\.w\) \* ([\d.]+);/.exec(VERTEX_SHADER)
    expect(amp, 'the ripple amplitude has moved or been renamed').not.toBeNull()
    expect(hi).toBeGreaterThanOrEqual(Number(amp![1]))
  })

  it('keeps the total displacement bound the orb was designed around', () => {
    // The two budgets replaced a single 0.52 clamp. Their sum is what decides
    // the silhouette, so it must not creep upward unnoticed -- a bigger bound
    // is a different-looking orb, not a bug fix.
    const budgets = [...VERTEX_SHADER.matchAll(/clamp\([^,]+,\s*-([\d.]+),\s*([\d.]+)\)/g)]
      .map((m) => Number(m[2]))
    const total = budgets.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(0.52, 5)
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
