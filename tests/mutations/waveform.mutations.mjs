// Defects tests/dom/Waveform.test.ts must catch.
// Author: gurvinny
//
// Waveform is the first catalogue because it contains both verdicts the runner
// has to tell apart: clamps a test genuinely covers, and one it provably cannot.
// A rig that reports the second as a coverage hole would send someone to "fix"
// a guard, which is the failure this whole mechanism exists to prevent.
export const TARGET = 'src/ui/Waveform.ts'
export const TESTS = 'tests/dom/Waveform.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  ['the loop start marker stops being clamped into the track',
   '    this._loopStart = Math.max(0, Math.min(1, start))',
   '    this._loopStart = start',
   'clamps loop markers into the track'],

  ['the loop end marker stops being clamped into the track',
   '    this._loopEnd   = Math.max(0, Math.min(1, end))',
   '    this._loopEnd   = end',
   'clamps loop markers into the track'],

  // Expected to survive. See SURVIVORS.
  ['setProgress stops clamping its ratio',
   '    this.progress = Math.max(0, Math.min(1, ratio))',
   '    this.progress = ratio',
   null],
]

export const SURVIVORS = {
  'setProgress stops clamping its ratio':
    'Defensive only, and the suite says so at tests/dom/Waveform.test.ts:70. The draw ' +
    'pass gates the playhead on `progress > 0 && progress < 1`, so an out-of-range value ' +
    'and its clamped form render identically -- there is no observable behaviour behind ' +
    'the clamp to assert. Not a coverage hole; do NOT "fix" it by deleting the guard.',
}
