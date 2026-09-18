// Author: gurvinny
//
// The orb's brightness constants, and the relationships between them that
// decide whether anything happening on the surface can be seen.
//
// These numbers used to be literals in three places -- two inside the GLSL
// template and one in each of the two UnrealBloomPass constructions -- and a
// literal cannot be checked against another literal.
//
// The failure they guard is silent in the worst way: the orb still renders,
// still animates, and still passes every "draws a non-blank frame" assertion
// while carrying no legible surface detail at all. The e2e suite measures
// frameAdvance, nonBlankRatio and distinctColors, and all three stay perfectly
// healthy on an orb whose brightness cannot move. That is how a displacement
// term gets computed, uploaded, and never seen.
import { describe, it, expect } from 'vitest'
import {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
  THEME_PALETTES,
  ORB_SOLID_BASE,
  ORB_WIRE_BASE,
  ORB_DISP_GAIN,
  ORB_DISP_BIAS,
  ORB_DISP_SPAN,
  BLOOM_THRESHOLD,
  ORB_DETAIL,
} from '../../src/ui/AnomalySphere'
import { readFileSync } from 'node:fs'

/** The module's own source, for assertions about how a constant is USED. */
const SOURCE = readFileSync(new URL('../../src/ui/AnomalySphere.ts', import.meta.url), 'utf8')

/**
 * The largest |disp| the vertex shader can emit, read from its own clamp rather
 * than duplicated here. A test that hardcodes 0.52 keeps passing after the
 * budget changes underneath it, which is the failure mode that matters: every
 * claim below is about how much of the brightness curve the displacement can
 * actually reach, so it is only meaningful against the real bound.
 */
function dispMax(): number {
  const bounds = [...VERTEX_SHADER.matchAll(/clamp\([^,]+,\s*-([\d.]+),\s*([\d.]+)\)/g)]
  expect(bounds.length, 'no symmetric clamp found in the vertex shader').toBeGreaterThan(0)
  return bounds.reduce((sum, m) => sum + Number(m[2]), 0)
}

/**
 * The fragment shader's brightness curve, in JS.
 *
 * Must track the GLSL exactly, bias included -- a helper that drifts from the
 * shader turns every assertion below into a test of its own arithmetic. The
 * "reaches the shader" test is what pins the two together.
 */
function bright(disp: number, base: number, wireframe = true): number {
  const bias = wireframe ? ORB_DISP_BIAS : 0
  return base + Math.min(Math.max(disp * ORB_DISP_GAIN + bias, 0), 1) * ORB_DISP_SPAN
}

describe('the orb brightness channel', () => {
  it('lets displacement move wireframe brightness across a usable range', () => {
    // THE regression this file exists for.
    //
    // The wireframe arm used to carry its own gain (0.5) and span (0.22) on a
    // base of 0.68. Since |disp| <= 0.52, clamp(vDisp * 0.5, 0, 1) could never
    // exceed 0.26 -- most of the term's range was unreachable -- so brightness
    // spanned 0.680 to 0.737 across the ENTIRE displacement range. A 1.08x
    // swing, and a ripple contributing 0.16 of displacement moved it by 2.6%.
    //
    // Measured on the built page, that showed up as 75-79% of the orb's pixels
    // falling inside a single 51-level brightness band, against 55% on the
    // mobile path. The surface was a uniform mid-tone mass.
    const d = dispMax()
    const ratio = bright(d, ORB_WIRE_BASE) / bright(-d, ORB_WIRE_BASE)
    expect(ratio, 'wireframe brightness barely responds to displacement').toBeGreaterThanOrEqual(2.5)
  })

  it('represents inward displacement as well as outward', () => {
    // The clamp is the other half of the same defect, and the one that survived
    // the first fix. `clamp(vDisp * gain, 0.0, 1.0)` is ONE-SIDED: every
    // negative displacement -- about half the surface -- lands on the same
    // floor, so a dent and a resting vertex are the same brightness.
    //
    // Lowering the floor alone did not touch it. Measured on the built page,
    // that change moved the whole distribution darker (mean 116 -> 77) and left
    // the concentration where it was, 75% -> 77% of pixels inside the densest
    // two bands. The pile moved; it did not spread. The bias is what spreads it.
    const d = dispMax()
    expect(bright(0, ORB_WIRE_BASE), 'rest sits at the floor, so dents cannot register')
      .toBeGreaterThan(bright(-d, ORB_WIRE_BASE) + 0.05)
    expect(bright(d, ORB_WIRE_BASE)).toBeGreaterThan(bright(0, ORB_WIRE_BASE) + 0.05)
  })

  it('gives a single ripple-sized displacement a visible share of that range', () => {
    // A layer that owns 0.16 of the displacement budget should own a
    // comparable share of the brightness range. Under the old constants it got
    // 0.018 of a 0.057-wide range on a 0.68 floor: real, and invisible.
    const RIPPLE_DISP = 0.16
    const delta = bright(RIPPLE_DISP, ORB_WIRE_BASE) - bright(0, ORB_WIRE_BASE)
    expect(delta / bright(0, ORB_WIRE_BASE)).toBeGreaterThanOrEqual(0.20)
  })

  it('leaves the solid-mode curve exactly as it shipped', () => {
    // Unifying the two arms must not quietly restyle solid mode. It rests near
    // black and lights up where the surface bulges outward, which reads as
    // intended rather than broken -- and biasing it too would take the resting
    // sphere from 0.120 to 0.395, a 3.3x brighter orb in a mode nothing was
    // reported about. The bias is gated on uWireframe for exactly this reason.
    expect(bright(0, ORB_SOLID_BASE, false)).toBeCloseTo(ORB_SOLID_BASE, 5)
    expect(bright(-0.2, ORB_SOLID_BASE, false)).toBeCloseTo(ORB_SOLID_BASE, 5)
    expect(bright(0.2, ORB_SOLID_BASE, false)).toBeCloseTo(0.329, 3)
  })

  it('keeps the wireframe floor brighter than the solid one', () => {
    // Not a tidiness assertion. The 0.68 floor existed for a reason -- the solid
    // shading model leaves undisplaced wireframe lines near-invisible and
    // patchy -- so the fix for a flat channel must not be "use the solid floor".
    expect(ORB_WIRE_BASE).toBeGreaterThan(ORB_SOLID_BASE)
  })

  it('lets displacement decide what blooms', () => {
    // Bloom should be a highlight displacement gates, not a wash that is always
    // on. A fragment blooms when its linear luminance clears BLOOM_THRESHOLD,
    // so the brightness curve and that threshold are one design decision
    // expressed in two files -- which is why they are now one symbol each
    // rather than four hand-copied literals.
    //
    // Honest scope: this pins the intended relation, and is NOT evidence of a
    // white-out. Measurement on the built page found no achromatic pixels at
    // any setting on either platform, so the wash originally blamed for the
    // symptom does not occur; the real defect was contrast, not saturation.
    const lum = paletteLuminance()
    const d = dispMax()
    expect(
      bright(-d, ORB_WIRE_BASE) * lum.max,
      'even a fully inward dent blooms, on the brightest palette',
    ).toBeLessThan(BLOOM_THRESHOLD)
    expect(
      bright(d, ORB_WIRE_BASE) * lum.median,
      'even a fully outward bulge never blooms',
    ).toBeGreaterThan(BLOOM_THRESHOLD)
  })
})

/**
 * Linear (Rec.709) luminance of every palette colour the orb can be given.
 *
 * Derived from THEME_PALETTES rather than stated as a constant, so adding a
 * brighter theme re-checks the bloom relation instead of silently breaking it.
 * Three converts the palette into a linear working space before shading, hence
 * the sRGB decode; the palettes are stored as HSL.
 */
function paletteLuminance(): { max: number; median: number } {
  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => {
      const k = (n + h * 12) % 12
      return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    }
    return [f(0), f(8), f(4)]
  }
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const all = Object.values(THEME_PALETTES)
    .flat()
    .map(([h, s, l]) => {
      const [r, g, b] = hslToRgb(h, s, l)
      return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    })
    .sort((x, y) => x - y)
  return { max: all[all.length - 1], median: all[all.length >> 1] }
}

describe('GLSL interpolation of the brightness constants', () => {
  it('emits every interpolated constant as a float literal, never an int', () => {
    // A bare integral JS number interpolates as `1`, an int literal, and
    // `0.12 + 1 * 0.55` is a type error in GLSL ES -- the shader then fails to
    // compile and the orb never appears at all. .toFixed(3) is what prevents
    // it, and nothing else here would catch its removal until e2e.
    const slots = [...FRAGMENT_SHADER.matchAll(/(?:mix\(|clamp\(vDisp \*|\* )\s*(\d+(?:\.\d+)?)\s*(?:,|;)/g)]
    expect(slots.length, 'the dispBright expression has moved or been renamed').toBeGreaterThanOrEqual(3)
    for (const [, literal] of slots) {
      expect(literal, `"${literal}" is an int literal and will not compile in GLSL ES`).toMatch(/^\d+\.\d+$/)
    }
  })

  it('reaches the shader as one curve with two floors', () => {
    // Guards the hoist: a constant that is exported but never interpolated
    // leaves the GLSL on stale literals, which no other test here can see.
    expect(FRAGMENT_SHADER).toContain(
      `mix(${ORB_SOLID_BASE.toFixed(3)}, ${ORB_WIRE_BASE.toFixed(3)}, uWireframe)`,
    )
    expect(FRAGMENT_SHADER).toContain(`clamp(vDisp * ${ORB_DISP_GAIN.toFixed(3)}`)
    expect(FRAGMENT_SHADER).toContain(`mix(0.0, ${ORB_DISP_BIAS.toFixed(3)}, uWireframe)`)
    expect(FRAGMENT_SHADER).toContain(`* ${ORB_DISP_SPAN.toFixed(3)};`)
    // The two arms must not drift back apart into separate gains and spans.
    expect(FRAGMENT_SHADER).not.toContain('dispBrightSolid')
  })
})

describe('orb geometry density', () => {
  const faces = (d: number) => 20 * 4 ** d

  it('keeps desktop within one subdivision of mobile', () => {
    // Desktop was detail 6 against mobile's 4: 81,920 faces to 5,120, and since
    // the buffer is non-indexed, 245,760 wireframe edge segments to 15,360. At
    // the orb's framed size that is finer than the pixel grid, so per-vertex
    // brightness differences average away inside each pixel and the surface
    // loses the structure it is drawing. Measured, desktop sat at 0.081 relative
    // local contrast against mobile's 0.126; detail 5 moved it to 0.208.
    //
    // The ink-per-pixel derivation lives on ORB_DETAIL. Asserting the ratio
    // rather than re-deriving the optics here is deliberate: a test that
    // reimplements the physics only ever tests its own arithmetic.
    expect(faces(ORB_DETAIL.desktop) / faces(ORB_DETAIL.mobile)).toBeLessThanOrEqual(4)
  })

  it('states the face counts the subdivision actually produces', () => {
    // The comment this replaced claimed "detail 6 -> ~10k vertices; detail 4 ->
    // ~2.5k (~75% reduction)". 10k is detail 5's figure, so it understated
    // desktop by 4x and reported a 16x platform gap as 4x.
    expect(faces(ORB_DETAIL.mobile)).toBe(5_120)
    expect(faces(ORB_DETAIL.desktop)).toBe(20_480)
  })

  it('is what the geometry call actually reads', () => {
    // Otherwise the constant survives as documentation while the call site goes
    // back to a hardcoded level, and every assertion above passes against a
    // number the renderer never sees.
    expect(SOURCE).toMatch(
      /buildIcosahedron\(\s*this\._isMobile \? ORB_DETAIL\.mobile : ORB_DETAIL\.desktop\s*\)/,
    )
  })
})
