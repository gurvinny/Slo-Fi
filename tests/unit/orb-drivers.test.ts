// Author: gurvinny
//
// The mappings behind how hard the orb moves.
//
// Both of these failed in the same silent way: the value kept being computed
// and uploaded, so every liveness assertion stayed green, but it stopped
// varying. A driver held at its ceiling is a DC offset, not a driver.
import { describe, it, expect } from 'vitest'
import { AdaptiveRange } from '../../src/audio/AdaptiveRange'
import {
  computeKickVis,
  computeBloomStrength,
  maxKickVis,
  KICK_MAX,
  BLOOM_CAP,
} from '../../src/ui/orbDrivers'

const R = 0.8 // shipped default reactivity

describe('computeKickVis', () => {
  it('no longer pins at its clamp on loud material', () => {
    // The shipped failure. kickEnergy above ~0.62 hit the 1.4 clamp and stayed
    // there, so every downstream effect flatlined at maximum.
    const loudQuiet = computeKickVis(0.9, 0.05, R)
    const loudPeak = computeKickVis(0.95, 1, R)
    expect(loudPeak).toBeLessThan(KICK_MAX)
    expect(loudPeak - loudQuiet).toBeGreaterThan(0.3)
  })

  it('reaches comparable output for the same gesture at very different levels', () => {
    // normalised at 1.0 in both cases; only the absolute flux differs.
    const quiet = computeKickVis(0.04, 1, R)
    const loud = computeKickVis(1.2, 1, R)
    expect(quiet).toBeGreaterThan(0.6)
    expect(loud - quiet).toBeLessThan(0.45)
  })

  it('still lets absolute level show through at all', () => {
    // Fully normalised, an ambient pad and a club master would be identical.
    expect(computeKickVis(1.2, 0.5, R)).toBeGreaterThan(computeKickVis(0.02, 0.5, R))
  })

  it('never exceeds the clamp downstream thresholds are calibrated against', () => {
    for (const e of [0, 0.5, 1.4, 12]) {
      for (const n of [0, 0.5, 1]) {
        for (const r of [0, 0.4, 0.8, 1.5]) {
          const v = computeKickVis(e, n, r)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(KICK_MAX)
        }
      }
    }
  })

  it('is silent when there is no signal', () => {
    expect(computeKickVis(0, 0, R)).toBe(0)
  })
})

describe('computeBloomStrength', () => {
  it('leaves headroom under the cap at maximum drive', () => {
    // THE regression guard. If this ever reaches BLOOM_CAP again, bloom has
    // stopped responding and the orb blows out -- 144,313 achromatic pixels in
    // one frame when it last happened.
    const s = computeBloomStrength(maxKickVis(R), 1, 1, 1)
    expect(s).toBeLessThan(BLOOM_CAP)
  })

  it('still moves with the kick', () => {
    const quiet = computeBloomStrength(0.1, 0, 1, 1)
    const hit = computeBloomStrength(maxKickVis(R), 0, 1, 1)
    expect(hit).toBeGreaterThan(quiet * 1.5)
  })

  it('scales with the glow control and the visual fade', () => {
    const full = computeBloomStrength(0.5, 0, 1, 1)
    expect(computeBloomStrength(0.5, 0, 0.5, 1)).toBeCloseTo(full * 0.5, 6)
    expect(computeBloomStrength(0.5, 0, 1, 0)).toBe(0)
  })

  it('caps a pathological input rather than letting it run away', () => {
    expect(computeBloomStrength(99, 99, 1, 1)).toBeLessThanOrEqual(BLOOM_CAP)
  })
})

describe('AdaptiveRange feeding kickVis end to end', () => {
  it('gives a quiet track and a loud one comparable bloom', () => {
    // The integration the two unit suites cannot each prove alone: the whole
    // point is that mastering level stops deciding how bright the orb gets.
    const run = (peak: number, floorV: number) => {
      const r = new AdaptiveRange()
      let best = 0
      for (let i = 0; i < 1800; i++) {
        const e = i % 30 === 0 ? peak : floorV
        const n = r.update(e, 1 / 60)
        if (i > 1200) best = Math.max(best, computeBloomStrength(computeKickVis(e, n, R), 0, 1, 1))
      }
      return best
    }
    const quiet = run(0.05, 0.01)
    const loud = run(0.95, 0.72)
    expect(Math.abs(loud - quiet)).toBeLessThan(0.25)
    expect(quiet).toBeGreaterThan(0.4)
    expect(loud).toBeLessThan(BLOOM_CAP)
  })
})
