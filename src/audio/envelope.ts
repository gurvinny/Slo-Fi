// Frame-rate-independent smoothing primitives.
// Author: gurvinny

/**
 * Fraction of the remaining distance to cover in `dt` seconds for a first-order
 * lag with time constant `tau`. This is the frame-rate-independent form of the
 * fixed `x += (target - x) * k` the orb used everywhere.
 */
export function alpha(tau: number, dt: number): number {
  return 1 - Math.exp(-dt / tau)
}

/**
 * The time constant that reproduces a per-frame lerp `k` at `fps`.
 *
 * This is the migration tool, not decoration: every existing constant gets its
 * tau computed from the value it already had at 60fps, so the conversion
 * preserves the current feel by construction rather than by taste.
 */
export function tauFromLerp(k: number, fps = 60): number {
  return -1 / (fps * Math.log(1 - k))
}

/**
 * A first-order lag with separate attack and release time constants.
 *
 * Asymmetry is what lets "smooth" and "on-beat" stop fighting: a fast attack
 * puts the transient on the beat, a slow release keeps the body of the motion
 * calm. It is how a compressor or a VU meter behaves, and it is the shape the
 * orb's bass channel already wanted -- it was just frame-dependent, and wired
 * to the wrong signal.
 */
export class AsymEnvelope {
  value: number

  constructor(
    private readonly attackTau: number,
    private readonly releaseTau: number,
    initial = 0,
  ) {
    this.value = initial
  }

  step(target: number, dt: number): number {
    const tau = target > this.value ? this.attackTau : this.releaseTau
    this.value += (target - this.value) * alpha(tau, dt)
    return this.value
  }
}
