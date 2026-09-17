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
]

export const SURVIVORS = {}
