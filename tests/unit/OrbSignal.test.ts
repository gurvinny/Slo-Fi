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
import { RIPPLE_CAPACITY, RIPPLE_STRIDE } from '../../src/audio/RippleBank'

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

// ── Layer 2: the ripples ─────────────────────────────────────────────────────
// The file header has always described layer 2 as the channel that carries the
// transients, but nothing ever spawned one: OrbSignal computed no flux, built no
// OnsetDetector, and kept its RippleBank private with no way to reach pack().
// So `drivers.ripples` was permanently empty and positiveFlux had no callers.
describe('OrbSignal ripples', () => {
  const dt = 1 / 60
  const fine = bump(60, FINE_BINS)

  /** Run `seconds` of steady tone so the onset baseline is past its warm-up. */
  function settle(signal: ReturnType<typeof make>, seconds = 1): void {
    for (let t = 0; t < seconds; t += dt) signal.update(bump(60, FAST_BINS), fine, dt, true)
  }

  it('fires on a transient and not on a steady tone', () => {
    const signal = make()
    settle(signal)
    // A steady tone has no rising edges, so positiveFlux is ~0 and nothing
    // should fire. This is the assertion that fails if flux is computed against
    // a zeroed previous frame every time.
    expect(signal.update(bump(60, FAST_BINS), fine, dt, true).ripples).toHaveLength(0)

    const hit = signal.update(bump(60, FAST_BINS, 255), fine, dt, true)
    expect(hit.ripples).toHaveLength(1)
  })

  it('stays quiet while paused, however hard the spectrum jumps', () => {
    const signal = make()
    settle(signal)
    for (let i = 0; i < 10; i++) {
      signal.update(bump(60, FAST_BINS, i % 2 ? 255 : 40), fine, dt, false)
    }
    expect(signal.update(bump(60, FAST_BINS, 255), fine, dt, false).ripples).toHaveLength(0)
  })

  it('starts a fresh ripple at age zero', () => {
    // step() runs before spawn, so a ripple born this frame must not already
    // have been aged by this frame's dt -- otherwise the wavefront starts part
    // way out and the beat looks early.
    const signal = make()
    settle(signal)
    signal.update(bump(60, FAST_BINS, 255), fine, dt, true)

    const out = new Float32Array(RIPPLE_CAPACITY * RIPPLE_STRIDE)
    expect(signal.packRipples(out)).toBe(1)
    expect(out[3]).toBe(0)
  })

  it('packs origin, normalised age and strength where the shader reads them', () => {
    const signal = make()
    settle(signal)
    signal.update(bump(60, FAST_BINS, 255), fine, dt, true)

    const out = new Float32Array(RIPPLE_CAPACITY * RIPPLE_STRIDE)
    signal.packRipples(out)

    // The origin is a point on the unit sphere -- the shader treats it as a
    // direction and never normalises it.
    const len = Math.hypot(out[0]!, out[1]!, out[2]!)
    expect(len).toBeCloseTo(1, 5)
    expect(out[4]).toBeGreaterThan(0)
    // Unused slots must read as zero strength, or dead ripples keep displacing.
    expect(out[RIPPLE_STRIDE + 4]).toBe(0)
  })

  it('ages a ripple out and frees its slot', () => {
    const signal = make()
    settle(signal)
    signal.update(bump(60, FAST_BINS, 255), fine, dt, true)
    expect(signal.packRipples(new Float32Array(RIPPLE_CAPACITY * RIPPLE_STRIDE))).toBe(1)

    // Past the 1.1s lifetime, on a steady tone so nothing new fires.
    for (let t = 0; t < 1.5; t += dt) signal.update(bump(60, FAST_BINS), fine, dt, true)

    const out = new Float32Array(RIPPLE_CAPACITY * RIPPLE_STRIDE)
    expect(signal.packRipples(out)).toBe(0)
    expect([...out].every((v) => v === 0)).toBe(true)
  })

  it('does not swallow the first beats of a track', () => {
    // The startup transient, from the other side. positiveFlux needs a previous
    // frame; leaving it zeroed makes the FIRST reading the whole spectrum, which
    // seeds the detector's baseline far above anything the music will produce
    // and it then has to decay back down before a real beat can clear it.
    //
    // Measured on this fixture (hits every 0.5s over a sustained bass): seeding
    // the previous frame from the first real frame fires at 0.500s, a zeroed
    // previous frame fires at 1.500s. A full second of every intro, silently.
    const signal = make()
    const hits: number[] = []
    for (let i = 0; i < 180; i++) {
      const t = i * dt
      // An attack riding a sustain, which is what a kick under a bass note is.
      const peak = (t % 0.5) < 2 * dt ? 255 : 140
      const { ripples } = signal.update(bump(60, FAST_BINS, peak), fine, dt, true)
      // A spawn is an age-0 ripple, not a longer array: the bank caps at 4 and
      // evicts, so at capacity a spawn leaves the length unchanged.
      if (ripples.some((r) => r.age === 0)) hits.push(+t.toFixed(3))
    }

    expect(hits[0], `first onset at ${hits[0]}s`).toBeLessThan(0.7)
    // Bounded both ways: "fires on every frame" would satisfy the line above
    // while being a worse failure than firing late.
    expect(hits.length).toBeGreaterThanOrEqual(4)
    expect(hits.length).toBeLessThanOrEqual(10)
  })

  it('refuses a pack buffer the shader could not read', () => {
    // A short buffer would silently pack fewer ripples than the uniform array
    // declares, leaving stale values in the tail. Cheap to assert, and the
    // stride is the kind of constant that gets changed in one place only.
    const signal = make()
    expect(() => signal.packRipples(new Float32Array(8))).toThrow(/32/)
  })
})
