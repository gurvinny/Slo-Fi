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
  computeOrbPulse,
  maxOrbPulse,
  flashTarget,
  updateFlash,
  computeBloomTwoStage,
  maxSustainedBloom,
  computeCameraZ,
  orbHeightFraction,
  ORB_PEAK_FRACTION,
  ORB_Z_MIN,
  ORB_Z_MAX,
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
        if (i > 1200) best = Math.max(best, computeBloomTwoStage(n, 0, 0, 1, 1))
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

describe('orb scale pulse', () => {
  it('rests at exactly 1 with no audio and no loop', () => {
    expect(computeOrbPulse(0, true, 0)).toBe(1)
  })

  it('grows with the kick', () => {
    expect(computeOrbPulse(1, true)).toBeGreaterThan(computeOrbPulse(0.2, true))
  })

  it('pulses less with the bass pulse disabled, but still pulses', () => {
    const on = computeOrbPulse(1, true)
    const off = computeOrbPulse(1, false)
    expect(off).toBeLessThan(on)
    expect(off).toBeGreaterThan(1)
  })

  it('maxOrbPulse is a real bound on computeOrbPulse, not a hand-copied guess', () => {
    // The guard that stops framing and pulse drifting apart. If the pulse
    // constants are ever retuned without updating the bound, the camera starts
    // framing for a peak the orb exceeds -- which is how the orb came to
    // overflow the viewport in the first place.
    // Fed from computeKickVis rather than from arbitrary numbers: KICK_MAX is a
    // clamp, not a reachable value -- the mix tops out at 1.33 of it at
    // reactivity 1 -- so asserting against 1.4 would test a state the app
    // cannot enter.
    for (const r of [0.4, 0.8, 1]) {
      const bound = maxOrbPulse(r, 1)
      for (const e of [0, 0.2, 0.6, 1.4, 9]) {
        for (const n of [0, 0.5, 1]) {
          for (const loop of [0, 0.5, 1]) {
            expect(computeOrbPulse(computeKickVis(e, n, r), true, loop))
              .toBeLessThanOrEqual(bound + 1e-9)
          }
        }
      }
    }
  })

  it('bounds scale at the reactivity actually in use', () => {
    expect(maxOrbPulse(0.4)).toBeLessThan(maxOrbPulse(1))
  })
})

describe('two-stage bloom', () => {
  it('does not flash on sustained material, however loud', () => {
    // THE point of splitting the stages. A dense passage normalises to a high
    // but steady value; it must glow, not strobe. Sustained bloom parked at the
    // clip point is what drove 43.6% of bright pixels colourless.
    let flash = 0
    for (let i = 0; i < 600; i++) flash = updateFlash(flash, 0.65, 1 / 60)
    expect(flash).toBe(0)
  })

  it('flashes on a hard hit', () => {
    expect(updateFlash(0, 0.98, 1 / 60)).toBeGreaterThan(0.8)
  })

  it('scales the flash with how hard the hit is', () => {
    expect(flashTarget(0.75)).toBeLessThan(flashTarget(0.95))
    expect(flashTarget(0.72)).toBe(0)
  })

  it('releases the flash quickly enough to read as a strike', () => {
    let f = updateFlash(0, 1, 1 / 60)
    for (let i = 0; i < 18; i++) f = updateFlash(f, 0, 1 / 60)  // 300ms
    expect(f).toBeLessThan(0.07)
  })

  it('releases over wall-clock time, not frames', () => {
    const decay = (dt: number) => {
      let f = updateFlash(0, 1, dt)
      for (let i = 0; i < Math.round(0.25 / dt); i++) f = updateFlash(f, 0, dt)
      return f
    }
    expect(Math.abs(decay(1 / 60) - decay(1 / 144))).toBeLessThan(0.02)
  })

  it('attacks instantly rather than fading in', () => {
    // A kick that ramps up is not a kick.
    expect(updateFlash(0, 1, 1 / 60)).toBe(flashTarget(1))
  })

  it('leaves the sustained level well clear of the cap', () => {
    // Headroom is what the flash spends. If sustained alone approaches the cap
    // there is nothing left for a hit to do and every kick lands on a frame
    // that is already saturated.
    expect(maxSustainedBloom()).toBeLessThan(BLOOM_CAP * 0.75)
  })

  it('stays under the cap at absolute worst case', () => {
    const s = computeBloomTwoStage(1, 1, 1, 1, 1)
    expect(s).toBeLessThanOrEqual(BLOOM_CAP)
    expect(s).toBeGreaterThan(maxSustainedBloom())
  })

  it('caps a pathological reverb rather than letting bloom run away', () => {
    // With the shipped constants the stages sum to 1.05 against a 1.10 cap, so
    // the cap never binds on valid input -- which made it invisible to every
    // other test here. It exists for the case where an upstream value arrives
    // out of range, and that is the only thing that can prove it is still
    // wired. Deleting the cap must fail something.
    expect(computeBloomTwoStage(1, 1, 9, 1, 1)).toBeLessThanOrEqual(BLOOM_CAP)
  })

  it('counts the loop pulse in the scale', () => {
    // Untested until a mutation deleted the term and nothing noticed.
    expect(computeOrbPulse(0, true, 1)).toBeGreaterThan(computeOrbPulse(0, true, 0))
    expect(computeOrbPulse(0.5, true, 1)).toBeGreaterThan(computeOrbPulse(0.5, true, 0))
  })

  it('makes a hit brighter than the loudest sustained passage', () => {
    const sustainedLoud = computeBloomTwoStage(1, 0, 0, 1, 1)
    const hit = computeBloomTwoStage(0.8, 1, 0, 1, 1)
    expect(hit).toBeGreaterThan(sustainedLoud * 1.25)
  })

  it('still respects glow and fade controls', () => {
    expect(computeBloomTwoStage(0.5, 0.5, 0, 0, 1)).toBe(0)
    expect(computeBloomTwoStage(0.5, 0.5, 0, 1, 0)).toBe(0)
  })
})

describe('camera framing', () => {
  const FOV = 60
  // The values measured off the shipped build, so these tests are anchored to
  // reality rather than to each other.
  const DESKTOP_ASPECT = 16 / 9
  const MOBILE_ASPECT = 0.5406
  const BASE = 0.81

  it('makes the PEAK orb match the target fraction, not the resting orb', () => {
    // The bug in one assertion. Framing solved for a radius-1 sphere while the
    // mesh pulsed to 1.53x, so the stated 38% rendered as 58.3%.
    const z = computeCameraZ(DESKTOP_ASPECT, FOV, BASE)
    const peak = BASE * maxOrbPulse(1, 1)
    expect(orbHeightFraction(peak, z, FOV)).toBeCloseTo(ORB_PEAK_FRACTION.landscape, 3)
  })

  it('keeps the portrait orb inside the viewport width at peak', () => {
    // Measured at 107.2% of viewport width before this change: on a phone the
    // orb did not fit on screen at the peak of a kick.
    const z = computeCameraZ(MOBILE_ASPECT, FOV, BASE)
    const peak = BASE * maxOrbPulse(1, 1)
    const wFrac = orbHeightFraction(peak, z, FOV) / MOBILE_ASPECT
    expect(wFrac).toBeLessThan(1)
    expect(wFrac).toBeCloseTo(ORB_PEAK_FRACTION.portrait, 3)
  })

  it('leaves the resting orb visibly smaller than its peak', () => {
    // The room the pulse moves in. If rest and peak are the same size the
    // framing is reserving nothing and the kick has nowhere to go.
    const z = computeCameraZ(DESKTOP_ASPECT, FOV, BASE)
    const rest = orbHeightFraction(BASE, z, FOV)
    const peak = orbHeightFraction(BASE * maxOrbPulse(1, 1), z, FOV)
    expect(peak / rest).toBeGreaterThan(1.5)
    expect(rest).toBeLessThan(ORB_PEAK_FRACTION.landscape)
  })

  it('does not clamp away the distance portrait actually needs', () => {
    // The old ceiling was 7.5 and portrait needs ~8.7, so the clamp would have
    // silently capped the fix and left the orb overflowing.
    const z = computeCameraZ(MOBILE_ASPECT, FOV, BASE)
    expect(z).toBeGreaterThan(7.5)
    expect(z).toBeLessThan(ORB_Z_MAX)
  })

  it('pulls back further as the viewport gets narrower', () => {
    expect(computeCameraZ(0.45, FOV, BASE)).toBeGreaterThan(computeCameraZ(0.75, FOV, BASE))
  })

  it('is independent of aspect once landscape', () => {
    // Landscape frames against height, so an ultrawide monitor should not push
    // the camera around.
    expect(computeCameraZ(1.78, FOV, BASE)).toBeCloseTo(computeCameraZ(3.2, FOV, BASE), 6)
  })

  it('tracks the orb size control', () => {
    expect(computeCameraZ(DESKTOP_ASPECT, FOV, 1.4)).toBeGreaterThan(
      computeCameraZ(DESKTOP_ASPECT, FOV, 0.6),
    )
  })

  it('stays within its clamps for absurd inputs', () => {
    for (const a of [0.2, 1, 5]) {
      for (const b of [0.4, 1.8]) {
        const z = computeCameraZ(a, FOV, b)
        expect(z).toBeGreaterThanOrEqual(ORB_Z_MIN)
        expect(z).toBeLessThanOrEqual(ORB_Z_MAX)
      }
    }
  })
})
