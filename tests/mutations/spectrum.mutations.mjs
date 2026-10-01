// Defects tests/unit/spectrum.test.ts must catch.
// Author: gurvinny
//
// The last entry is the one that matters most: it reverts lowCentroidHz to a
// fixed band centre, which is exactly the behaviour being replaced. If the
// suite cannot tell the new implementation from the old one, it is not testing
// the fix -- it is just exercising it.
export const TARGET = 'src/audio/spectrum.ts'
export const TESTS = 'tests/unit/spectrum.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['freqToBin stops clamping into the array',
   '  return Math.min(binCount - 1, Math.max(0, bin))',
   '  return bin',
   'maps a frequency to its bin and stays inside the array'],

  ['positiveFlux counts falling energy as an onset',
   '    if (d > 0) sum += d',
   '    sum += d',
   'reports rising energy and ignores falling energy'],

  ['bandEnergy stops normalising by the band width',
   '  for (let i = lo; i <= hi; i++) sum += freq[i] ?? 0\n  return sum / ((hi - lo + 1) * 255)',
   '  for (let i = lo; i <= hi; i++) sum += freq[i] ?? 0\n  return sum / 255',
   'is 1 for a saturated band and 0 for silence'],

  ['the silent-spectrum centroid collapses onto DC',
   '  if (total === 0) return ((lo + hi) / 2) * binHz',
   '  if (total === 0) return 0',
   'falls back to the middle of the range when there is no energy at all'],

  ['the centroid reverts to a fixed band centre',
   '  return (weighted / total) * binHz',
   '  return ((lo + hi) / 2) * binHz',
   'distinguishes two tracks that put their bass in different places'],
]

export const SURVIVORS = {}
