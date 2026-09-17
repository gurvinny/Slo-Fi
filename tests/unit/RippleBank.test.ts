// Layer 2 of the orb's motion: beat-triggered ripples with their own lifetimes.
// Author: gurvinny
//
// Separating these from the breathing radius is what lets "smooth" and
// "on-beat" stop fighting. The radius can be damped hard because it is no
// longer carrying the transient -- these are.
import { describe, it, expect } from 'vitest'
import { RippleBank, RIPPLE_CAPACITY } from '../../src/audio/RippleBank'

const lengthOf = (r: { ox: number; oy: number; oz: number }) => Math.hypot(r.ox, r.oy, r.oz)
const newest = (b: RippleBank) => b.active[b.active.length - 1]!

describe('RippleBank origins', () => {
  it('places every ripple on the surface of the unit sphere', () => {
    const bank = new RippleBank()
    for (let i = 0; i < 16; i++) {
      bank.spawn(1)
      // An origin off the surface makes the shader's geodesic distance
      // meaningless: the wave appears to start inside or outside the orb.
      expect(lengthOf(newest(bank))).toBeCloseTo(1, 6)
      bank.step(0.5)
    }
  })

  it('never fires twice in the same place', () => {
    const bank = new RippleBank()
    const seen = []
    for (let i = 0; i < 64; i++) { bank.spawn(1); seen.push({ ...newest(bank) }); bank.step(1) }
    for (let i = 1; i < seen.length; i++) {
      const a = seen[i]!, b = seen[i - 1]!
      expect(Math.hypot(a.ox - b.ox, a.oy - b.oy, a.oz - b.oz)).toBeGreaterThan(0.2)
    }
  })

  it('spreads across the whole sphere rather than clustering', () => {
    // The reason to walk the golden angle rather than pick at random: no run of
    // beats should pile onto one face and leave the rest of the orb dead.
    const bank = new RippleBank()
    const octants = new Set<string>()
    for (let i = 0; i < 64; i++) {
      bank.spawn(1)
      const r = newest(bank)
      octants.add(`${r.ox > 0}${r.oy > 0}${r.oz > 0}`)
      bank.step(1)
    }
    expect(octants.size).toBe(8)
  })

  it('puts a tapped ripple where it was tapped rather than on the walk', () => {
    const bank = new RippleBank()
    bank.spawnAt(0, 1, 0, 1)
    const r = newest(bank)
    expect([r.ox, r.oy, r.oz]).toEqual([0, 1, 0])
  })
})

describe('RippleBank lifetime', () => {
  it('ages a ripple out over the same wall-clock time at any frame rate', () => {
    const drain = (dt: number) => {
      const bank = new RippleBank()
      bank.spawn(1)
      let t = 0
      while (bank.active.length > 0 && t < 10) { bank.step(dt); t += dt }
      return t
    }
    const slow = drain(1 / 30)
    const fast = drain(1 / 144)
    expect(slow).toBeGreaterThan(0.2)
    expect(Math.abs(slow - fast)).toBeLessThan(0.05)
  })

  it('drops the oldest when more arrive than it can hold', () => {
    const bank = new RippleBank()
    for (let i = 0; i < RIPPLE_CAPACITY; i++) bank.spawn(1)
    const oldest = { ...bank.active[0]! }
    bank.spawn(1)
    expect(bank.active.length).toBe(RIPPLE_CAPACITY)
    // Evicting the NEWEST would make a fast passage freeze the orb on one
    // stale ripple instead of showing the beats actually playing.
    expect(bank.active.some((r) => r.ox === oldest.ox && r.oy === oldest.oy)).toBe(false)
  })
})

describe('RippleBank.pack', () => {
  // Two vec4s per ripple: [ox, oy, oz, progress] then [strength, 0, 0, 0].
  // Strength is per-ripple because a beat landing on a confident tempo grid
  // hits harder than one off it, so it cannot be a single global uniform.
  const STRIDE = 8

  it('writes a fixed-size buffer and zeroes the slots it did not fill', () => {
    const bank = new RippleBank()
    const out = new Float32Array(RIPPLE_CAPACITY * STRIDE).fill(9)
    bank.spawn(0.75)
    const count = bank.pack(out)

    expect(count).toBe(1)
    expect(Math.hypot(out[0]!, out[1]!, out[2]!)).toBeCloseTo(1, 6)
    expect(out[3]).toBeCloseTo(0, 6)      // fresh ripple, no progress yet
    expect(out[4]).toBeCloseTo(0.75, 6)   // strength survives the pack

    // The shader loops the whole array rather than branching per element, so
    // leftover data in an unused slot renders as a phantom ripple.
    for (let i = count * STRIDE; i < out.length; i++) expect(out[i]).toBe(0)
  })

  it('advances a ripple toward 1 as it ages', () => {
    const bank = new RippleBank()
    const out = new Float32Array(RIPPLE_CAPACITY * STRIDE)
    bank.spawn(1)
    bank.step(0.25)
    bank.pack(out)
    // Progress is what drives the wavefront outward. Pinned at 0 the ripple
    // would flash in place instead of travelling.
    expect(out[3]).toBeGreaterThan(0.05)
    expect(out[3]).toBeLessThan(1)
  })
})
