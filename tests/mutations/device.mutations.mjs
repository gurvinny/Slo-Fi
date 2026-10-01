// Defects tests/dom/device.test.ts must catch.
// Author: gurvinny
//
// This module is four lines of predicate, which is exactly why it needs a
// catalogue: every mutation below leaves it compiling, leaves the app running,
// and changes behaviour only on a device class the author is unlikely to be
// sitting at. The install-prompt bug was of that kind -- it was reported from a
// desktop, by someone else.
export const TARGET = 'src/ui/device.ts'
export const TESTS = 'tests/dom/device.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  // The three ways to get the OR wrong. Each one is a shipped bug on a
  // different device, and all three agree with the correct version on a plain
  // phone and a plain desktop.
  ['the form-factor check collapses to the user agent (tablets in desktop mode lose the prompt)',
   '  return isMobileUserAgent() || isCoarsePointer()',
   '  return isMobileUserAgent()',
   'is true on a desktop UA with a coarse pointer, which is a tablet in desktop mode'],

  ['the form-factor check collapses to the pointer (a phone with a mouse loses the prompt)',
   '  return isMobileUserAgent() || isCoarsePointer()',
   '  return isCoarsePointer()',
   'is true on a mobile platform with a fine pointer, which is a plugged-in phone or a lying emulator'],

  ['the form-factor check requires both, so only a touch phone qualifies',
   '  return isMobileUserAgent() || isCoarsePointer()',
   '  return isMobileUserAgent() && isCoarsePointer()',
   'is true on a mobile platform with a fine pointer, which is a plugged-in phone or a lying emulator'],

  // The platform predicate picking up pointer awareness is the regression the
  // whole two-predicate split exists to prevent: it would drop the orb to the
  // mobile geometry tier on any touchscreen laptop.
  ['the platform check starts counting a coarse pointer',
   'export function isMobileUserAgent(): boolean {\n  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)',
   'export function isMobileUserAgent(): boolean {\n  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || isCoarsePointer()',
   'ignores a coarse pointer entirely'],

  // Read timing. Captured at module load, every test that stubs the user agent
  // after import silently measures the importing environment instead.
  ['the user agent is captured once at module load instead of read per call',
   'export function isMobileUserAgent(): boolean {\n  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)\n}',
   'const UA_AT_LOAD = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)\nexport function isMobileUserAgent(): boolean {\n  return UA_AT_LOAD\n}',
   're-reads the user agent on every call'],

  ['the user-agent regex loses its case-insensitive flag',
   '/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)',
   '/iPhone|iPad|iPod|Android/.test(navigator.userAgent)',
   'matches case-insensitively, as the four originals did'],

  ['the regex drops Android, leaving an iOS-only check',
   '/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)',
   '/iPhone|iPad|iPod/i.test(navigator.userAgent)',
   'recognises Android'],

  ['the regex drops the iPad and iPod branches',
   '/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)',
   '/iPhone|Android/i.test(navigator.userAgent)',
   'recognises iPad'],

  ['the pointer query asks about a fine pointer instead',
   "window.matchMedia?.('(pointer: coarse)').matches === true",
   "window.matchMedia?.('(pointer: fine)').matches === true",
   'reports a coarse pointer'],

  // `?.` yields undefined where matchMedia is absent, and `undefined === true`
  // is false. Relaxing the comparison turns "no matchMedia" into "coarse".
  ['a missing matchMedia is read as a coarse pointer',
   "    return window.matchMedia?.('(pointer: coarse)').matches === true",
   "    return window.matchMedia?.('(pointer: coarse)').matches !== false",
   'answers false rather than throwing where matchMedia is absent'],

  ['the optional call is made unconditional, so an absent matchMedia throws into the caller',
   "  try {\n    return window.matchMedia?.('(pointer: coarse)').matches === true\n  } catch {\n    return false\n  }",
   "  return window.matchMedia('(pointer: coarse)').matches === true",
   'answers false rather than throwing where matchMedia is absent'],
]

export const SURVIVORS = {}
