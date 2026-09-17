// Defects tests/unit/envelope.test.ts must catch.
// Author: gurvinny
//
// These are the two ways the dt migration could silently fail to migrate
// anything: reverting a single envelope to a per-frame constant, or converting
// the constants against the wrong reference frame rate. Both leave the suite
// looking green and the orb behaving differently on every display.
export const TARGET = 'src/audio/envelope.ts'
export const TESTS = 'tests/unit/envelope.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['an envelope reverts to a fixed per-frame lerp',
   '    const tau = target > this.value ? this.attackTau : this.releaseTau\n    this.value += (target - this.value) * alpha(tau, dt)',
   '    const k = target > this.value ? 0.32 : 0.025\n    this.value += (target - this.value) * k',
   'reaches the same state at 30, 60 and 144 fps and under a jittered frame time'],

  ['the lerp conversion is computed against the wrong reference frame rate',
   'export function tauFromLerp(k: number, fps = 60): number {',
   'export function tauFromLerp(k: number, fps = 30): number {',
   'converts a per-frame lerp into the time constant that reproduces it at 60fps'],

  ['attack and release collapse into one time constant',
   '    const tau = target > this.value ? this.attackTau : this.releaseTau',
   '    const tau = this.releaseTau',
   'rises far faster than it falls'],
]

export const SURVIVORS = {}
