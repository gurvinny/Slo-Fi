// Author: gurvinny
//
// The adaptive range that lets the orb respond to ANY material.
//
// kickVis -- which drives bloom, scale pulse, rotation, glitch, crack veins and
// lightning -- was raw spectral-flux energy times a fixed 2.8, clamped at 1.4.
// Absolute, unnormalised, so how hard the orb moved was decided by how loud the
// master was. A brickwalled commercial track pinned kickVis at its clamp, and a
// driver pinned at its clamp is not a driver: bloom sat at its own ceiling and
// the orb blew out. A quiet or unmastered track barely moved it at all.
//
// These tests are about the property that matters -- the SAME musical gesture
// produces the SAME response regardless of the level it arrives at.
import { describe, it, expect } from 'vitest'
import { AdaptiveRange, AGC_MIN_RANGE } from '../../src/audio/AdaptiveRange'

/** Drive n frames of a constant value at 60fps. */
function drive(r: AdaptiveRange, value: number, frames: number, dt = 1 / 60): number {
  let out = 0
  for (let i = 0; i < frames; i++) out = r.update(value, dt)
  return out
}

/** A repeating impulse: `peak` every `period` frames, `floorV` otherwise. */
function pulse(r: AdaptiveRange, peak: number, floorV: number, period: number, frames: number, dt = 1 / 60) {
  const outs: number[] = []
  for (let i = 0; i < frames; i++) outs.push(r.update(i % period === 0 ? peak : floorV, dt))
  return outs
}

describe('AdaptiveRange', () => {
  it('seeds from the first sample instead of booting from zero', () => {
    // The OnsetDetector shipped firing two or three phantom beats at the start
    // of every track because its baseline started at zero and an ordinary level
    // cleared the floor margin until it caught up. Same trap, same fix.
    const r = new AdaptiveRange()
    const first = r.update(0.5, 1 / 60)
    expect(first).toBeLessThan(0.5)
  })

  it('maps the same gesture to the same output at very different levels', () => {
    // THE point of the whole class. A kick at 4% of full scale on an unmastered
    // demo and the same kick at 80% on a loudness-war master are the same
    // musical event and must move the orb by the same amount.
    const quiet = new AdaptiveRange()
    const loud = new AdaptiveRange()
    const q = pulse(quiet, 0.05, 0.01, 30, 1200)
    const l = pulse(loud, 0.95, 0.19, 30, 1200)
    const peakQ = Math.max(...q.slice(-300))
    const peakL = Math.max(...l.slice(-300))
    expect(Math.abs(peakQ - peakL)).toBeLessThan(0.15)
    expect(peakQ).toBeGreaterThan(0.6)
  })

  it('does not pin at the top on a compressed master', () => {
    // The shipped failure: kickEnergy above ~0.62 pinned kickVis at 1.4, which
    // pinned bloom.strength at its 1.10 cap, which is a DC offset and not a
    // response. Output must still MOVE on material that is loud throughout.
    const r = new AdaptiveRange()
    const outs = pulse(r, 0.98, 0.72, 24, 1800).slice(-600)
    const hi = Math.max(...outs)
    const lo = Math.min(...outs)
    expect(hi).toBeGreaterThan(0.5)
    expect(hi - lo).toBeGreaterThan(0.25)
  })

  it('does not amplify silence into motion', () => {
    // With floor and ceiling both collapsing toward zero, a pure-noise or
    // silent passage would otherwise be expanded into full-scale output --
    // the orb thrashing at nothing between tracks.
    const r = new AdaptiveRange()
    drive(r, 0.4, 600)
    const quietOuts: number[] = []
    for (let i = 0; i < 1200; i++) quietOuts.push(r.update(0.0005 * Math.random(), 1 / 60))
    expect(Math.max(...quietOuts.slice(-300))).toBeLessThan(0.25)
  })

  it('keeps ceiling a full guard above floor on a dead-constant input', () => {
    // Two separate guards protect this division and they were masking each
    // other: with the separation guard in place the getter's clamp never binds,
    // so removing either one alone was invisible. They are tested apart now.
    const r = new AdaptiveRange()
    const out = drive(r, 0.5, 3000)
    expect(Number.isFinite(out)).toBe(true)
    expect(out).toBeGreaterThanOrEqual(0)
    expect(out).toBeLessThanOrEqual(1)
    // the raw fields, not the guarded getter
    expect(r.ceiling - r.floor).toBeGreaterThanOrEqual(AGC_MIN_RANGE)
  })

  it('reports a usable range before it has ever been updated', () => {
    // The separation guard only runs inside update(), so this is the case the
    // getter's own clamp exists for -- and the only one that can distinguish
    // the two.
    expect(new AdaptiveRange().range).toBeGreaterThanOrEqual(AGC_MIN_RANGE)
  })

  it('treats a very low-level signal as silence rather than expanding it', () => {
    // The gate is about level, not about range. A signal can have a perfectly
    // healthy internal range and still be inaudible; without the gate the
    // normaliser expands hiss between tracks into full-scale motion.
    const r = new AdaptiveRange()
    const outs: number[] = []
    for (let i = 0; i < 1800; i++) outs.push(r.update(i % 30 === 0 ? 0.012 : 0.0002, 1 / 60))
    expect(Math.max(...outs.slice(-600))).toBeLessThan(0.35)
  })

  it('clamps output to 0..1 even when the input leaves the tracked range', () => {
    const r = new AdaptiveRange()
    drive(r, 0.3, 600)
    expect(r.update(5, 1 / 60)).toBeLessThanOrEqual(1)
    expect(r.update(-5, 1 / 60)).toBeGreaterThanOrEqual(0)
  })

  it('tracks the running minimum rather than a proportion of the mean', () => {
    // main anchors its bass floor at `rawBass * 0.7`, which makes the range a
    // fixed PROPORTION of the level -- so a master modulating 2% can never
    // expand past a few percent however the tracking is tuned. The floor has to
    // follow the actual minimum.
    const r = new AdaptiveRange()
    pulse(r, 0.82, 0.80, 30, 3000)
    expect(r.floor).toBeLessThan(0.805)
    expect(r.floor).toBeGreaterThan(0.6)
  })

  it('integrates the same total time regardless of frame rate', () => {
    // Every envelope in this renderer used to be per-frame, so desktop at 144Hz
    // ran attacks 2.4x fast.
    //
    // The signal has to VARY. A constant input drives floor and ceiling to the
    // same place at any rate, so a per-frame coefficient is invisible to it --
    // a constant fixture cannot detect missing smoothing, which is the mistake
    // this suite has now made twice. Ten seconds of identical material, decaying
    // from a peak, at two very different frame rates.
    const at = (dt: number) => {
      const r = new AdaptiveRange()
      const frames = Math.round(10 / dt)
      for (let i = 0; i < frames; i++) {
        const t = i * dt
        r.update(t < 2 ? 0.9 : 0.05, dt)
      }
      return r
    }
    const a = at(1 / 60)
    const b = at(1 / 144)
    expect(Math.abs(a.ceiling - b.ceiling)).toBeLessThan(0.02)
    expect(Math.abs(a.floor - b.floor)).toBeLessThan(0.02)
    // and the decay actually happened, so the comparison is not of two zeros
    expect(a.ceiling).toBeLessThan(0.6)
  })

  it('holds its output down during the warm-up rather than guessing', () => {
    const r = new AdaptiveRange()
    const early: number[] = []
    for (let i = 0; i < 12; i++) early.push(r.update(i % 4 === 0 ? 0.9 : 0.1, 1 / 60))
    expect(Math.max(...early)).toBeLessThan(0.8)
  })
})
