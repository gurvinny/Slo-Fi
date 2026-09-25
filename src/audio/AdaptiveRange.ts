/**
 * Adaptive range normalisation -- the thing that lets the orb respond to any
 * audio thrown at it rather than to how loud that audio happens to be.
 *
 * The problem this solves: a driver taken straight from band energy or spectral
 * flux is an ABSOLUTE measurement. Feed it an unmastered demo and it barely
 * moves; feed it a modern commercial master and it pins at its clamp, and a
 * driver pinned at its clamp is a DC offset, not a driver. The same musical
 * gesture has to move the orb by the same amount whatever level it arrives at.
 *
 * Floor tracks the running MINIMUM and ceiling the running MAXIMUM. That
 * distinction is load-bearing and is not the obvious implementation: anchoring
 * the floor at a proportion of the mean (`raw * 0.7`, as the bass path in
 * AnomalySphere still does) makes the range a fixed FRACTION OF THE LEVEL, so a
 * brickwalled master that modulates two percent can never expand past a few
 * percent however carefully the tracking is tuned. Proportional floors cannot
 * expand a compressed signal; a true minimum can.
 *
 * Asymmetric on purpose. The ceiling rises fast so a transient is captured on
 * the frame it happens and falls slowly so one loud hit does not rescale the
 * next thirty seconds. The floor falls fast so a breakdown is followed
 * immediately, and rises slowly so a busy passage does not drag the reference
 * up under itself.
 *
 * Every constant is a TIME CONSTANT in seconds, applied against dt. Per-frame
 * coefficients were the single most common defect in this renderer -- desktop
 * is uncapped, so at 144Hz every envelope ran 2.4x fast.
 */

/**
 * Smallest range the normaliser will divide by.
 *
 * On a dead-constant input the floor and ceiling converge, and without a guard
 * the division explodes: one LSB of dither reads as a full-scale kick.
 *
 * Deliberately small. It is a divide-by-zero guard, NOT a noise gate -- the
 * silence gate below is what handles quiet. Set too large it becomes the
 * divisor for any genuinely quiet track and silently caps how far that track
 * can expand: at 0.06 a demo peaking at 0.05 over a 0.01 floor normalised to
 * 0.67 while a commercial master reached 1.0, which is precisely the
 * level-dependence this class exists to remove.
 */
export const AGC_MIN_RANGE = 0.02

/** Ceiling chases a peak almost immediately... */
const CEIL_RISE_TAU = 0.12
/** ...and releases over a phrase, not a beat. */
const CEIL_FALL_TAU = 3.0
/** Floor follows a drop quickly, so a breakdown re-references fast... */
const FLOOR_FALL_TAU = 0.35
/** ...and recovers slowly, so density does not drag the reference upward. */
const FLOOR_RISE_TAU = 2.5

/**
 * Below this ceiling the input is treated as silence rather than as a very
 * quiet signal. Without it, floor and ceiling both collapse toward zero between
 * tracks and the normaliser happily expands noise into full-scale motion -- the
 * orb thrashing at nothing.
 */
const SILENCE_CEIL = 0.02

/**
 * Held down for this long after the first sample.
 *
 * An adaptive estimator is wrong until it has seen material, and the wrongness
 * is loudest at the start. The OnsetDetector shipped firing two or three
 * phantom beats at the top of every track for exactly this reason -- its
 * baseline started at zero, so an ordinary level cleared the floor margin until
 * it caught up. Those were not beats, that was the detector booting.
 */
const WARMUP_S = 0.35

/** Time-constant to per-update coefficient. Frame-rate independent by construction. */
function coeff(dt: number, tau: number): number {
  return 1 - Math.exp(-Math.max(dt, 0) / tau)
}

export class AdaptiveRange {
  private _floor = 0
  private _ceiling = 0
  private _age = 0
  private _seeded = false

  get floor(): number { return this._floor }
  get ceiling(): number { return this._ceiling }
  /** The divisor actually in use, guard included. */
  get range(): number { return Math.max(this._ceiling - this._floor, AGC_MIN_RANGE) }

  reset(): void {
    this._floor = 0
    this._ceiling = 0
    this._age = 0
    this._seeded = false
  }

  /**
   * Feed one sample and get its position within the adapted range, 0..1.
   */
  update(value: number, dt: number): number {
    const v = Number.isFinite(value) ? value : 0

    // Seed from the first real sample rather than from zero, so the estimator
    // starts near the material instead of climbing to it from below.
    if (!this._seeded) {
      this._floor = v
      this._ceiling = v
      this._seeded = true
    }

    this._age += Math.max(dt, 0)

    this._ceiling += (v - this._ceiling) * coeff(dt, v > this._ceiling ? CEIL_RISE_TAU : CEIL_FALL_TAU)
    this._floor += (v - this._floor) * coeff(dt, v < this._floor ? FLOOR_FALL_TAU : FLOOR_RISE_TAU)

    // The ceiling can never sit under the floor; keeping them a guard apart
    // means `range` is meaningful rather than merely non-zero.
    if (this._ceiling < this._floor + AGC_MIN_RANGE) {
      this._ceiling = this._floor + AGC_MIN_RANGE
    }

    const norm = (v - this._floor) / this.range

    // Ramp in over the warm-up instead of publishing a confident wrong answer.
    const warm = Math.min(this._age / WARMUP_S, 1)

    // Fade out rather than switch off, so the boundary between "very quiet" and
    // "silent" is not itself an event the orb reacts to.
    const gate = Math.min(Math.max((this._ceiling - SILENCE_CEIL) / SILENCE_CEIL, 0), 1)

    return Math.min(Math.max(norm * warm * gate, 0), 1)
  }
}
