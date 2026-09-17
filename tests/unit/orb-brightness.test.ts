// Author: gurvinny
//
// The orb's brightness and density constants, and the relationships between
// them that decide whether anything on the surface can be seen.
//
// These numbers used to be literals in three places -- two inside the GLSL
// template and one in each of the two UnrealBloomPass constructions -- and a
// literal cannot be checked against another literal. The failure they guard is
// silent: the orb still renders, still animates, still passes every "draws a
// non-blank frame" assertion, and is simply a white ball with no legible
// surface. Nothing in the e2e suite noticed for the whole life of the feature.
import { describe, it, expect } from 'vitest'
import {
  FRAGMENT_SHADER,
  ORB_SOLID_BASE,
  ORB_WIRE_BASE,
  ORB_DISP_GAIN,
  ORB_DISP_SPAN,
  ORB_WIRE_GAIN,
  ORB_WIRE_SPAN,
  ORB_DETAIL,
} from '../../src/ui/AnomalySphere'

describe('GLSL interpolation of the brightness constants', () => {
  // A bare integral JS number interpolates as `1`, an int literal, and
  // `0.68 + 1 * 0.22` is a type error in GLSL ES -- the shader then fails to
  // compile and the orb never appears at all. .toFixed(3) is what prevents it,
  // and nothing else in the suite would catch its removal until e2e.
  it('emits every interpolated constant as a float literal, never an int', () => {
    const slots = [...FRAGMENT_SHADER.matchAll(/(?:clamp\(vDisp \*|mix\(dispBrightSolid,|dispBrightSolid = )\s*([\d.]+)/g)]
    expect(slots.length, 'the dispBright expression has moved or been renamed').toBeGreaterThanOrEqual(3)
    for (const [, literal] of slots) {
      expect(literal, `"${literal}" is an int literal and will not compile in GLSL ES`).toMatch(/^\d+\.\d+$/)
    }
  })

  it('still generates the dispBright expression the renderer expects', () => {
    // Guards the hoist itself: a constant that is exported but never reaches
    // the shader leaves the GLSL on stale literals, which no other test sees.
    expect(FRAGMENT_SHADER).toContain(
      `float dispBrightSolid = ${ORB_SOLID_BASE.toFixed(3)} + clamp(vDisp * ${ORB_DISP_GAIN.toFixed(3)}, 0.0, 1.0) * ${ORB_DISP_SPAN.toFixed(3)};`,
    )
    expect(FRAGMENT_SHADER).toContain(
      `mix(dispBrightSolid, ${ORB_WIRE_BASE.toFixed(3)} + clamp(vDisp * ${ORB_WIRE_GAIN.toFixed(3)}, 0.0, 1.0) * ${ORB_WIRE_SPAN.toFixed(3)}, uWireframe)`,
    )
  })
})

describe('orb geometry density', () => {
  it('states face counts that match the subdivision it actually requests', () => {
    // Faces are 20 * 4^detail. The comment this replaced claimed "detail 6 ->
    // ~10k vertices; detail 4 -> ~2.5k (~75% reduction)" -- 10k is detail 5's
    // figure, so it understated desktop by 4x and hid a 16x platform gap.
    const faces = (d: number) => 20 * 4 ** d
    expect(faces(ORB_DETAIL.mobile)).toBe(5_120)
    expect(faces(ORB_DETAIL.desktop)).toBe(81_920)
  })
})
