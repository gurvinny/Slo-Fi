// Defects tests/unit/orb-brightness.test.ts must catch.
// Author: gurvinny
//
// The bloom threshold and the shading curve are one design decision expressed
// in two places. Every mutation here still renders a live, moving orb; what
// changes is whether the relief survives the bloom pass (#172) or whether the
// effects meant to blaze still can.
export const TARGET = 'src/ui/AnomalySphere.ts'
export const TESTS = 'tests/unit/orb-brightness.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  // The regression this catalogue exists for: the white-out threshold.
  ['the bloom threshold drops back to 0.22, so every outward bulge blooms',
   'export const BLOOM_THRESHOLD = 1.00',
   'export const BLOOM_THRESHOLD = 0.22',
   'keeps every shade of the surface itself below the bloom threshold'],

  ['the bloom threshold overshoots, switching bloom off for the crack veins too',
   'export const BLOOM_THRESHOLD = 1.00',
   'export const BLOOM_THRESHOLD = 2.00',
   'still lets the crack veins bloom'],

  ['the crack vein gain falls to palette brightness, so veins stop blazing',
   'vec3 crackCol = mix(uColorA, uColorC, 0.5) * 3.2;',
   'vec3 crackCol = mix(uColorA, uColorC, 0.5) * 1.0;',
   'still lets the crack veins bloom'],

  ['the crack veins stop riding the kick, capping them below the threshold',
   'color += crackCol * vein * uCrack * (0.5 + uKick * 0.9);',
   'color += crackCol * vein * uCrack * (0.5 + uKick * 0.0);',
   'still lets the crack veins bloom'],
]

export const SURVIVORS = {}
