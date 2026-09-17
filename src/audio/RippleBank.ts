// Layer 2 of the orb's motion: beat-triggered ripples with their own lifetimes.
// Author: gurvinny
//
// The orb's displacement used to be driven straight from spectral flux, which
// is a derivative and therefore twitchy -- that was the jitter. Splitting the
// transient into discrete ripples with their own decay lets the breathing
// radius be damped hard without the beat going soft, because the two are no
// longer the same signal.

export const RIPPLE_CAPACITY = 4

/** Floats per ripple: [ox, oy, oz, progress] then [strength, 0, 0, 0]. */
export const RIPPLE_STRIDE = 8

/** Seconds from spawn to fully decayed. */
const RIPPLE_LIFE = 1.1

// 137.507...deg. Successive longitudes never revisit a previous one, and the
// gaps stay as even as an infinite sequence allows.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Latitude needs a DIFFERENT irrational. Deriving it from the golden ratio too
// would anti-correlate it with longitude -- frac(i*0.618) is 1 - frac(i*0.382)
// -- and every ripple would land on a single curve rather than covering the
// sphere. This is the plastic number's square reciprocal, which is independent
// of the golden angle.
const PLASTIC_INV_SQ = 0.56984029099805327

export interface Ripple {
  ox: number; oy: number; oz: number
  age: number
  life: number
  strength: number
}

export class RippleBank {
  private readonly ripples: Ripple[] = []
  private index = 0

  get active(): readonly Ripple[] { return this.ripples }

  /** Spawn at the next point on the walk. */
  spawn(strength: number): void {
    const i = this.index++
    const theta = i * GOLDEN_ANGLE
    // Equal-area cylindrical mapping: distributing z uniformly (rather than the
    // polar angle) is what keeps the poles from collecting extra ripples.
    const z = 2 * ((0.5 + PLASTIC_INV_SQ * i) % 1) - 1
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    this.spawnAt(r * Math.cos(theta), r * Math.sin(theta), z, strength)
  }

  /** Spawn at an explicit point -- a tap lands where it was tapped. */
  spawnAt(ox: number, oy: number, oz: number, strength: number): void {
    // Evicting the oldest, not the newest: during a fast passage the newest
    // ripples are the beats being played, and dropping those would freeze the
    // orb on stale motion.
    if (this.ripples.length >= RIPPLE_CAPACITY) this.ripples.shift()
    this.ripples.push({ ox, oy, oz, age: 0, life: RIPPLE_LIFE, strength })
  }

  step(dt: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!
      r.age += dt
      if (r.age >= r.life) this.ripples.splice(i, 1)
    }
  }

  /** Write the uniform buffer. Returns how many slots were filled. */
  pack(out: Float32Array): number {
    out.fill(0)
    const n = Math.min(this.ripples.length, RIPPLE_CAPACITY)
    for (let i = 0; i < n; i++) {
      const r = this.ripples[i]!
      const o = i * RIPPLE_STRIDE
      out[o] = r.ox
      out[o + 1] = r.oy
      out[o + 2] = r.oz
      out[o + 3] = r.age / r.life
      out[o + 4] = r.strength
    }
    return n
  }
}
