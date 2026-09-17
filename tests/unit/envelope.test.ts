// Frame-rate-independent smoothing primitives.
// Author: gurvinny
//
// The orb's envelopes were all fixed per-frame constants tuned at 60 fps, so on
// a 144 Hz display every attack and decay ran ~2.4x fast. These are the pieces
// that replace them, and the tests below are the reason to trust the swap: the
// conversion has to reproduce the old 60 fps feel exactly, and the result has to
// behave the same at every frame rate.
import { describe, it, expect } from 'vitest'
import { alpha, tauFromLerp, AsymEnvelope } from '../../src/audio/envelope'

describe('tauFromLerp', () => {
  it('converts a per-frame lerp into the time constant that reproduces it at 60fps', () => {
    // BASS_LERP_UP was 0.32 per frame. Stepping the converted time constant at
    // 1/60s must move exactly as far as the old constant did in one frame --
    // otherwise the migration changes how the orb feels, which is the one thing
    // P1 must not do.
    expect(alpha(tauFromLerp(0.32), 1 / 60)).toBeCloseTo(0.32, 10)
  })
})

describe('AsymEnvelope', () => {
  // The input is defined as a function of TIME, not of frame index -- that is
  // the whole point. A frame-indexed fixture would feed a different signal at
  // each rate and the comparison below would be meaningless.
  const signalAt = (t: number): number =>
    t < 0.5 ? 0 : t < 1.5 ? 0.8 : t < 2.0 ? 0.1 : 0.1

  const ATTACK = 0.0432   // BASS_LERP_UP 0.32 @60fps
  const RELEASE = 0.658   // BASS_LERP_DOWN 0.025 @60fps
  const DURATION = 2.0

  /** Integrate the envelope over DURATION, reporting the end value and the
   *  wall-clock time it first crossed 0.5 on the way up. */
  function run(step: () => number) {
    const env = new AsymEnvelope(ATTACK, RELEASE)
    let t = 0
    let crossed: number | null = null
    while (t < DURATION) {
      const dt = step()
      const prev = env.value
      env.step(signalAt(t), dt)
      t += dt
      // Interpolate WITHIN the frame. Recording `t` wholesale would quantise
      // the crossing to one frame -- 33ms at 30fps -- which is coarser than
      // the tolerance this test needs to be worth having, so the comparison
      // would measure the sampling grid rather than the envelope.
      if (crossed === null && env.value >= 0.5) {
        const frac = (0.5 - prev) / (env.value - prev)
        crossed = t - dt + frac * dt
      }
    }
    return { value: env.value, crossed }
  }

  it('reaches the same state at 30, 60 and 144 fps and under a jittered frame time', () => {
    const fixed = (fps: number) => () => 1 / fps
    // A real frame time is never fixed; if the envelope is only correct for
    // uniform steps it is not actually time-based.
    let seed = 1
    const jittered = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return 1 / 30 + (seed / 2147483648) * (1 / 144 - 1 / 30)
    }

    const runs = [run(fixed(30)), run(fixed(60)), run(fixed(144)), run(jittered)]
    const values = runs.map((r) => r.value)
    const crossings = runs.map((r) => r.crossed!)

    // Guard against passing for the wrong reason: a dead envelope stuck at 0,
    // or one saturated at the input ceiling, would agree with itself perfectly.
    for (const v of values) expect(v).toBeGreaterThan(0.15)
    for (const v of values) expect(v).toBeLessThan(1.2)
    for (const c of crossings) expect(c).not.toBeNull()

    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.02)

    // 40ms, not 20ms. A step input cannot be observed before the next frame, so
    // onset detection is quantised at 1/30s = 33ms when a 30fps run is in the
    // comparison. Any tighter bound here measures the frame grid rather than the
    // envelope, and could not pass however correct the code is. Measured spread
    // is 29ms; the frame-dependent implementation this replaces spreads ~0.5s.
    expect(Math.max(...crossings) - Math.min(...crossings)).toBeLessThan(0.04)
  })

  it('rises far faster than it falls', () => {
    // The asymmetry IS the feature: a fast attack puts the transient on the
    // beat, a slow release keeps the body of the motion calm. A symmetric
    // envelope is still frame-rate independent, so the test above cannot see
    // this -- it passes happily on an envelope that has lost the property the
    // whole design depends on.
    const env = new AsymEnvelope(ATTACK, RELEASE)
    const dt = 1 / 60

    let rise = 0
    while (env.value < 0.5) { env.step(1, dt); rise += dt }

    // Settle to steady state before timing the decay. Measuring the fall from
    // the instant the rise loop exits would start it a hair above 0.5 and time
    // a single frame, which says nothing about the release constant.
    for (let t = 0; t < 2; t += dt) env.step(1, dt)

    let fall = 0
    while (env.value > 0.5) { env.step(0, dt); fall += dt }

    expect(rise).toBeLessThan(0.05)
    expect(fall).toBeGreaterThan(0.3)
    expect(fall / rise).toBeGreaterThan(8)
  })
})
