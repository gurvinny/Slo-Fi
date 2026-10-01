// Defects tests/unit/OrbSignal.test.ts must catch.
// Author: gurvinny
//
// The first two are the actual shipped bugs this module exists to fix, written
// as mutations so the suite is proven to tell the fix from what it replaced.
export const TARGET = 'src/audio/OrbSignal.ts'
export const TESTS = 'tests/unit/OrbSignal.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['the follow band reverts to a fixed low window (band drift returns)',
   '      Math.max(0, centre - BAND_HALF_BINS),\n      Math.min(fastBins - 1, centre + BAND_HALF_BINS),',
   '      freqToBin(40, fastBins, sampleRate),\n      freqToBin(150, fastBins, sampleRate),',
   'gives two tracks the same visual weight when their bass sits in different places'],

  ['the centroid stops following the energy',
   '    this.centroidHz += (target - this.centroidHz) * alpha(CENTROID_TAU, dt)',
   '    this.centroidHz += 0',
   'follows the centroid to where the energy actually is'],

  ['the radius is driven straight from the raw level again (jitter returns)',
   '    const radius = this.radiusEnv.step(level, dt)',
   '    const radius = level',
   'smooths a noisy signal far more than the signal itself moves'],

  ['auto-gain is removed, so a compressed master barely moves',
   '    const level = playing ? raw * 0.4 + normalised * 0.6 : 0',
   '    const level = playing ? raw : 0',
   'finds movement in a brick-walled master'],

  ['the floor anchors to a fraction of the mean instead of the running minimum',
   '    this.floor += (raw - this.floor) *\n      alpha(raw < this.floor ? FLOOR_DOWN_TAU : FLOOR_UP_TAU, dt)',
   '    this.floor += (raw * 0.7 - this.floor) * alpha(FLOOR_UP_TAU, dt)',
   'finds movement in a brick-walled master'],

  // Layer 2. Before this, nothing spawned a ripple at all: `drivers.ripples`
  // was permanently empty and positiveFlux had no caller anywhere in src/.
  ['no onset ever spawns a ripple (layer 2 goes back to being dead)',
   '    if (playing && strength > 0) this.bank.spawn(strength)',
   '    if (false && playing && strength > 0) this.bank.spawn(strength)',
   'fires on a transient and not on a steady tone'],

  // Two separate defects live in this block and the first version of this
  // catalogue conflated them into one mutation, which survived. Split:
  ['the previous frame starts zeroed, so the first reading is the whole spectrum',
   '      this.prevFast = new Uint8Array(fast)\n    } else {',
   '      this.prevFast = new Uint8Array(fast.length)\n      flux = positiveFlux(fast, this.prevFast, fluxLo, fluxHi)\n      this.prevFast.set(fast)\n    } else {',
   'does not swallow the first beats of a track'],

  // Caught by the cold-start test, NOT by the transient test -- and that is the
  // interesting part. Through an adaptive threshold, a flux signal carrying a
  // constant DC term crosses on the same 0.5s grid as one that returns to zero,
  // because the running baseline subtracts the offset. What it changes is when
  // detection settles: the first onset lands at 1.000s instead of 0.500s. The
  // steady-vs-transient assertion cannot see it; the intro assertion can.
  ['flux measures level instead of change (the previous frame is never updated)',
   '      flux = positiveFlux(fast, this.prevFast, fluxLo, fluxHi)\n      this.prevFast.set(fast)',
   '      flux = positiveFlux(fast, this.prevFast, fluxLo, fluxHi)',
   'does not swallow the first beats of a track'],

  ['ripples spawn while paused',
   '    const strength = this.onsets.push(playing ? flux : 0, dt)\n    if (playing && strength > 0) this.bank.spawn(strength)',
   '    const strength = this.onsets.push(flux, dt)\n    if (strength > 0) this.bank.spawn(strength)',
   'stays quiet while paused, however hard the spectrum jumps'],

  // Reorders rather than removes: deleting step(dt) would stop ripples ageing
  // at all, which is a different defect and would be caught by a different
  // test. What this asserts is the ORDER -- spawn after ageing.
  ['a fresh ripple is aged by the frame it was born in',
   '    if (playing && strength > 0) this.bank.spawn(strength)',
   '    if (playing && strength > 0) this.bank.spawn(strength)\n    this.bank.step(dt)',
   'starts a fresh ripple at age zero'],

  ['the pack buffer length check is dropped',
   '    if (out.length !== PACK_LENGTH) {',
   '    if (false) {',
   'refuses a pack buffer the shader could not read'],
]

export const SURVIVORS = {}
