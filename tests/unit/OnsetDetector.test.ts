// Decides which moments in a continuous flux signal count as a beat.
// Author: gurvinny
//
// The flux channel produces a value every frame; something has to turn that
// into discrete events. Getting this wrong is visible either way: too eager and
// one kick becomes three ripples as its transient rings, too strict and a quiet
// passage goes dead.
import { describe, it, expect } from 'vitest'
import { OnsetDetector } from '../../src/audio/OnsetDetector'

const DT = 1 / 60

/** Feed `seconds` of quiet, then one spike, returning every strength reported. */
function run(detector: OnsetDetector, frames: number[], dt = DT): number[] {
  return frames.map((f) => detector.push(f, dt))
}

/** A flat baseline with spikes at the given frame indices. */
function pulses(length: number, at: number[], quiet = 0.02, peak = 0.5): number[] {
  const out = new Array(length).fill(quiet)
  for (const i of at) out[i] = peak
  return out
}

describe('OnsetDetector firing', () => {
  it('fires on a rise well above the recent baseline', () => {
    const d = new OnsetDetector()
    const fired = run(d, pulses(200, [150])).filter((s) => s > 0)
    expect(fired.length).toBe(1)
  })

  it('stays silent on a flat signal, however loud', () => {
    // A sustained note is not a beat. Without an adaptive baseline a loud pad
    // would fire continuously.
    const d = new OnsetDetector()
    const fired = run(d, new Array(300).fill(0.6)).filter((s) => s > 0)
    expect(fired.length).toBeLessThanOrEqual(1)
  })

  it('does not fire twice while one transient rings', () => {
    // Frames 150/152/154 span 33ms at 60fps, comfortably inside the refractory
    // window. One kick must produce one ripple however many frames its
    // transient rings across.
    const d = new OnsetDetector()
    const fired = run(d, pulses(200, [150, 152, 154])).filter((s) => s > 0)
    expect(fired.length).toBe(1)
  })

  it('fires again once the refractory window has passed', () => {
    const d = new OnsetDetector()
    const fired = run(d, pulses(300, [150, 200])).filter((s) => s > 0)
    expect(fired.length).toBe(2)
  })

  it('finds beats in a quiet passage as readily as a loud one', () => {
    // The adaptive half. A fixed threshold makes the orb dead on quiet tracks
    // and constant on loud ones -- band drift, one layer up.
    const quiet = new OnsetDetector()
    const loud = new OnsetDetector()
    const at = [150, 200, 250]
    const q = run(quiet, pulses(300, at, 0.01, 0.08)).filter((s) => s > 0)
    const l = run(loud, pulses(300, at, 0.2, 0.9)).filter((s) => s > 0)
    expect(q.length).toBe(3)
    expect(l.length).toBe(3)
  })

  it('holds the refractory window in seconds, not frames', () => {
    // Spikes are placed by WALL CLOCK, not by frame index. A frame-indexed
    // fixture cannot express a 50ms gap at 30fps -- one frame is already 33ms,
    // so the spacing rounds to every frame and the "spikes" become a continuous
    // tone. That made an earlier version of this test compare two different
    // signals and call the difference a bug.
    const countAt = (dt: number, gapS: number) => {
      const d = new OnsetDetector()
      const spikeTimes = [1.0, 1.0 + gapS]
      let fired = 0
      let t = 0
      let next = 0
      for (let i = 0; i < Math.round(2 / dt); i++) {
        const spiking = next < spikeTimes.length && t >= spikeTimes[next]!
        if (spiking) next++
        if (d.push(spiking ? 0.5 : 0.02, dt) > 0) fired++
        t += dt
      }
      return fired
    }

    // Inside the window: one beat, at any frame rate.
    expect(countAt(1 / 30, 0.05)).toBe(1)
    expect(countAt(1 / 144, 0.05)).toBe(1)
    // Outside it: two, at any frame rate.
    expect(countAt(1 / 30, 0.2)).toBe(2)
    expect(countAt(1 / 144, 0.2)).toBe(2)
  })
})

describe('OnsetDetector grid confidence', () => {
  it('reports equal strength for every onset when no tempo is known', () => {
    const d = new OnsetDetector()
    const fired = run(d, pulses(400, [150, 213, 280])).filter((s) => s > 0)
    expect(fired.length).toBe(3)
    expect(Math.max(...fired) - Math.min(...fired)).toBeLessThan(0.001)
  })

  it('hits harder on the grid than off it once the tempo is confident', () => {
    // 120bpm is a beat every 0.5s, i.e. every 30 frames at 60fps.
    const onGrid = new OnsetDetector()
    onGrid.setTempo(120, 1)
    const g = run(onGrid, pulses(400, [180, 210, 240])).filter((s) => s > 0)

    const offGrid = new OnsetDetector()
    offGrid.setTempo(120, 1)
    const o = run(offGrid, pulses(400, [195, 225, 255])).filter((s) => s > 0)

    expect(g.length).toBe(3)
    expect(o.length).toBe(3)
    expect(Math.min(...g)).toBeGreaterThan(Math.max(...o))
  })

  it('ignores the grid when tempo detection is not confident', () => {
    // A wrong grid confidently applied is worse than none: it would emphasise
    // the wrong beats and read as the orb fighting the music.
    //
    // Confidence is deliberately LOW but NOT ZERO. At zero the penalty term is
    // multiplied to nothing regardless, so the guard clause is invisible and
    // removing it still passes -- which is what an earlier version of this test
    // did, until the mutation catalogue reported the survivor.
    const d = new OnsetDetector()
    d.setTempo(120, 0.1)
    const fired = run(d, pulses(400, [180, 195, 210])).filter((s) => s > 0)
    expect(Math.max(...fired) - Math.min(...fired)).toBeLessThan(0.001)
  })
})
