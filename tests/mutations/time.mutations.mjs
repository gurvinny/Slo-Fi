// Defects tests/unit/time.test.ts must catch.
// Author: gurvinny
//
// formatTime renders the transport readout, every playlist row and the track
// meta line. Each mutation below still produces a plausible-looking time, which
// is why none of them would be noticed by eye on a three-minute track.
export const TARGET = 'src/ui/time.ts'
export const TESTS = 'tests/unit/time.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['the minutes lose their zero-pad (the readout changes width as it counts)',
   ': `${pad(m)}:${pad(s)}`',
   ': `${m}:${pad(s)}`',
   'zero-pads the minutes so the readout keeps a fixed width'],

  ['the hour case falls through to minutes past 59',
   'return h > 0 ?',
   'return false ?',
   'switches to h:mm:ss at one hour instead of counting minutes past 59'],

  ['minutes are not taken modulo the hour',
   'const m = Math.floor((total % 3600) / 60)',
   'const m = Math.floor(total / 60)',
   'switches to h:mm:ss at one hour instead of counting minutes past 59'],

  ['partial seconds round up past the real position',
   '? Math.floor(seconds) : 0',
   '? Math.round(seconds) : 0',
   'floors partial seconds rather than rounding up past the real position'],

  ['an undecoded or overshooting value is no longer guarded',
   'Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0',
   'Math.floor(seconds)',
   'renders an unknown or invalid duration as zero, never as NaN'],
]

export const SURVIVORS = {}
