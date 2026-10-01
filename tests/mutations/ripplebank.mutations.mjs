// Defects tests/unit/RippleBank.test.ts must catch.
// Author: gurvinny
//
// The first entry is the reason the distribution test exists. Deriving latitude
// from the golden ratio rather than an independent irrational anti-correlates
// it with longitude, collapsing every ripple onto one curve. It still looks
// like a plausible sequence in code review and still passes any "is it on the
// sphere" check -- only a distribution assertion sees it.
export const TARGET = 'src/audio/RippleBank.ts'
export const TESTS = 'tests/unit/RippleBank.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['latitude is derived from the golden ratio, correlating it with longitude',
   'const PLASTIC_INV_SQ = 0.56984029099805327',
   'const PLASTIC_INV_SQ = 0.61803398874989485',
   'spreads across the whole sphere rather than clustering'],

  ['the newest ripple is evicted instead of the oldest',
   '    if (this.ripples.length >= RIPPLE_CAPACITY) this.ripples.shift()',
   '    if (this.ripples.length >= RIPPLE_CAPACITY) this.ripples.pop()',
   'drops the oldest when more arrive than it can hold'],

  ['ageing counts frames instead of seconds',
   '      r.age += dt',
   '      r.age += 1 / 60',
   'ages a ripple out over the same wall-clock time at any frame rate'],

  ['pack leaves stale data in the unused slots',
   '    out.fill(0)\n    const n = Math.min(this.ripples.length, RIPPLE_CAPACITY)',
   '    const n = Math.min(this.ripples.length, RIPPLE_CAPACITY)',
   'writes a fixed-size buffer and zeroes the slots it did not fill'],

  ['the wavefront never advances',
   '      out[o + 3] = r.age / r.life',
   '      out[o + 3] = 0',
   'advances a ripple toward 1 as it ages'],

  ['origins are left off the unit sphere',
   '    const r = Math.sqrt(Math.max(0, 1 - z * z))',
   '    const r = 1',
   'places every ripple on the surface of the unit sphere'],
]

export const SURVIVORS = {}
