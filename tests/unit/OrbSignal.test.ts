// The orb's audio -> motion pipeline, end to end.
// Author: gurvinny
//
// Everything here was previously trapped inside AnomalySphere, which needs
// WebGL to construct -- so none of it could be tested, and the defects below
// all shipped. OrbSignal takes two byte arrays and a dt and returns the drivers,
// so every complaint about how the orb moves becomes an assertion.
import { describe, it, expect } from 'vitest'
import { OrbSignal } from '../../src/audio/OrbSignal'
import { bandEnergy, freqToBin } from '../../src/audio/spectrum'

const SAMPLE_RATE = 48000
const FAST_BINS = 1024   // fftSize 2048 -- 43ms window, for onsets
const FINE_BINS = 4096   // fftSize 8192 -- 5.9Hz bins, for the centroid

function bump(hz: number, bins: number, peak = 200, width = 3): Uint8Array {
  const out = new Uint8Array(bins)
  const centre = hz / (SAMPLE_RATE / 2 / bins)
  for (let i = 0; i < bins; i++) {
    out[i] = Math.round(peak * Math.exp(-((i - centre) ** 2) / (2 * width ** 2)))
  }
  return out
}

const make = () => new OrbSignal({ sampleRate: SAMPLE_RATE, fastBins: FAST_BINS, fineBins: FINE_BINS })

describe('OrbSignal steadiness', () => {
  it('smooths a noisy signal far more than the signal itself moves', () => {
    // THE headline defect, and the fixture matters: a CONSTANT spectrum cannot
    // detect missing smoothing, because an unsmoothed driver is just as steady
    // on constant input. Real audio fluctuates every frame, so the input here
    // does too, and the assertion is that the radius moves much less than what
    // drives it.
    const signal = make()
    const dt = 1 / 60
    // Deterministic noise -- a seeded LCG, so a failure is reproducible.
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const noisyFast = () => {
      const base = bump(60, FAST_BINS)
      for (let i = 0; i < base.length; i++) {
        base[i] = Math.min(255, Math.max(0, Math.round(base[i]! * (0.4 + 1.2 * rand()))))
      }
      return base
    }
    const fine = bump(60, FINE_BINS)

    for (let t = 0; t < 3; t += dt) signal.update(noisyFast(), fine, dt, true)

    let worstStep = 0
    let min = Infinity
    let prevRadius = signal.update(noisyFast(), fine, dt, true).radius
    let prevRaw = -1
    let worstRawStep = 0
    for (let t = 0; t < 2; t += dt) {
      const f = noisyFast()
      const raw = bandEnergy(f, freqToBin(36, FAST_BINS, SAMPLE_RATE), freqToBin(108, FAST_BINS, SAMPLE_RATE))
      const r = signal.update(f, fine, dt, true).radius
      worstStep = Math.max(worstStep, Math.abs(r - prevRadius))
      if (prevRaw >= 0) worstRawStep = Math.max(worstRawStep, Math.abs(raw - prevRaw))
      min = Math.min(min, r)
      prevRadius = r
      prevRaw = raw
    }

    // The input really is jumpy, or the comparison below proves nothing.
    expect(worstRawStep).toBeGreaterThan(0.05)
    // ...and the radius is an order of magnitude calmer than it.
    expect(worstStep).toBeLessThan(worstRawStep / 10)
    // A driver pinned at zero would be perfectly steady too.
    expect(min).toBeGreaterThan(0.2)
  })

  it('holds a near-constant radius on an unchanging spectrum', () => {
    const signal = make()
    const fast = bump(60, FAST_BINS)
    const fine = bump(60, FINE_BINS)
    const dt = 1 / 60

    for (let t = 0; t < 3; t += dt) signal.update(fast, fine, dt, true)

    // Jitter is FRAME-TO-FRAME movement, which is what the eye reads as
    // twitching. The auto-gain also drifts the level slowly as it learns the
    // track, and that is wanted -- asserting on the total range over seconds
    // would fail on correct behaviour and force the AGC to be neutered to make
    // a test pass.
    let worstStep = 0
    let min = Infinity
    let prev = signal.update(fast, fine, dt, true).radius
    for (let t = 0; t < 2; t += dt) {
      const r = signal.update(fast, fine, dt, true).radius
      worstStep = Math.max(worstStep, Math.abs(r - prev))
      min = Math.min(min, r)
      prev = r
    }

    expect(worstStep).toBeLessThan(0.002)
    // A driver pinned at zero would be perfectly steady too.
    expect(min).toBeGreaterThan(0.2)
  })
})

describe('OrbSignal band tracking', () => {
  it('gives two tracks the same visual weight when their bass sits in different places', () => {
    // The complaint this fixes: a fixed 40-150Hz window reads a 35Hz sub-bass
    // track and a 180Hz bass-guitar track as near-silence, so the orb reacts to
    // one song and ignores the next.
    // Narrow bumps, and deliberately OUTSIDE the old fixed 40-150Hz window in
    // both directions. Wider ones overlap it enough that the auto-gain
    // normalises the difference away and the test passes on a fixed band --
    // which it did, until the mutation catalogue said so.
    const settle = (hz: number) => {
      const signal = make()
      const fast = bump(hz, FAST_BINS, 200, 1)
      const fine = bump(hz, FINE_BINS, 200, 1)
      const dt = 1 / 60
      let last = 0
      for (let t = 0; t < 12; t += dt) last = signal.update(fast, fine, dt, true).radius
      return last
    }

    const sub = settle(28)
    const bass = settle(220)

    expect(sub).toBeGreaterThan(0.2)
    expect(bass).toBeGreaterThan(0.2)
    expect(Math.abs(sub - bass)).toBeLessThan(0.15)
  })

  it('follows the centroid to where the energy actually is', () => {
    const signal = make()
    const fast = bump(180, FAST_BINS)
    const fine = bump(180, FINE_BINS)
    const dt = 1 / 60
    for (let t = 0; t < 12; t += dt) signal.update(fast, fine, dt, true)
    expect(signal.update(fast, fine, dt, true).centroidHz).toBeCloseTo(180, -1)
  })
})

describe('OrbSignal auto-gain', () => {
  it('finds movement in a brick-walled master', () => {
    // A loudness-war master sits pinned near full scale and modulates by a few
    // percent. Without auto-gain the orb reads "loud" constantly and barely
    // moves, which is the complaint that it does not follow the song.
    const signal = make()
    const dt = 1 / 60
    const fine = bump(60, FINE_BINS)
    const at = (level: number) => bump(60, FAST_BINS, Math.round(255 * level), 3)

    // Loud and nearly flat: 0.90 +/- 0.02, swelling over ~3s. The rate matters:
    // layer 1 is deliberately slow (tau 0.18-0.42s), so a sub-second swell is
    // correctly smoothed away and testing at that rate would assert against the
    // design rather than against the auto-gain.
    const frame = (t: number) => at(0.9 + 0.02 * Math.sin((t / 3) * 2 * Math.PI))

    for (let t = 0; t < 20; t += dt) signal.update(frame(t), fine, dt, true)

    let min = Infinity, max = -Infinity
    for (let t = 20; t < 26; t += dt) {
      const r = signal.update(frame(t), fine, dt, true).radius
      min = Math.min(min, r); max = Math.max(max, r)
    }
    expect(max - min).toBeGreaterThan(0.1)
  })
})
