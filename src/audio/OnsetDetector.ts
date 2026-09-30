// Decides which moments in a continuous flux signal count as a beat.
// Author: gurvinny
//
// The flux channel produces a value every frame; this turns that into discrete
// events. Both failure directions are visible on the orb: too eager and one
// kick becomes three ripples as its transient rings, too strict and a quiet
// passage goes dead.
import { alpha } from './envelope'

/** How long after a beat before another can fire. One kick, one ripple. */
const REFRACTORY_S = 0.08

/** The baseline is "recently", not "now" -- slow enough to survive a beat. */
const BASELINE_TAU = 0.35

/** How many mean-deviations above the baseline counts as an onset. */
const MARGIN_DEVIATIONS = 2.5

/** Absolute floor, so digital silence cannot fire on rounding. */
const MARGIN_FLOOR = 0.01

/** How much weaker an off-grid hit is than an on-grid one, at full confidence. */
const OFF_GRID_PENALTY = 0.5

/** Below this, tempo detection is not trusted and the grid is ignored. */
const MIN_CONFIDENCE = 0.25

/**
 * No onsets until the baseline has had time to learn the signal.
 *
 * Without this the detector fires two or three times on the first frames of any
 * track: the baseline starts at zero, so an ordinary quiet level clears the
 * floor margin until the baseline catches up. Those are not beats, they are the
 * detector booting.
 */
const WARMUP_S = 0.25

export class OnsetDetector {
  private baseline = 0
  private deviation = 0
  private seeded = false
  private sinceLast = Number.POSITIVE_INFINITY
  private clock = 0
  private beatPeriod = 0
  private confidence = 0

  /** Tell the detector the tempo, and how much to trust it. */
  setTempo(bpm: number, confidence: number): void {
    this.beatPeriod = bpm > 0 ? 60 / bpm : 0
    this.confidence = Math.min(1, Math.max(0, confidence))
  }

  /** Returns the ripple strength for this frame, or 0 for no onset. */
  push(flux: number, dt: number): number {
    this.clock += dt
    this.sinceLast += dt

    // Seed from the first real sample rather than from zero, so the baseline
    // starts where the signal actually is.
    if (!this.seeded) {
      this.baseline = flux
      this.seeded = true
    }

    // Tested before the baseline absorbs this frame. At the current 350ms tau a
    // single frame moves the baseline by under 5%, so the ordering is not
    // observable today -- the mutation catalogue records it as an expected
    // survivor. It is kept this way because the ordering stops being harmless
    // the moment BASELINE_TAU is shortened, and that is a one-character change.
    const margin = Math.max(MARGIN_FLOOR, this.deviation * MARGIN_DEVIATIONS)
    const isOnset =
      this.clock >= WARMUP_S &&
      flux > this.baseline + margin &&
      this.sinceLast >= REFRACTORY_S

    const k = alpha(BASELINE_TAU, dt)
    this.baseline += (flux - this.baseline) * k
    this.deviation += (Math.abs(flux - this.baseline) - this.deviation) * k

    if (!isOnset) return 0
    this.sinceLast = 0
    return this.strength()
  }

  /**
   * On-grid beats hit harder than off-grid ones -- but only when the tempo is
   * actually known. A wrong grid applied confidently is worse than no grid: it
   * emphasises the wrong moments and reads as the orb fighting the music.
   */
  private strength(): number {
    if (this.beatPeriod <= 0 || this.confidence < MIN_CONFIDENCE) return 1

    const phase = this.clock % this.beatPeriod
    const toNearest = Math.min(phase, this.beatPeriod - phase)
    // 0 on the grid line, 1 exactly between two.
    const offness = toNearest / (this.beatPeriod / 2)
    return 1 - this.confidence * OFF_GRID_PENALTY * offness
  }
}
