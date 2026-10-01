// Defects tests/dom/InstallController.test.ts must catch.
// Author: gurvinny
//
// Narrow on purpose: the gate added for #162 and the one ordering constraint it
// carries. The rest of this controller's behaviour -- the deferred prompt, the
// iOS fallback, the session key -- was already covered before the gate existed.
export const TARGET = 'src/ui/InstallController.ts'
export const TESTS = 'tests/dom/InstallController.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  // The pre-#162 state of this file, as a mutation, so the suite is proven to
  // tell the fix from what it replaced.
  ['the device gate is removed, which is the shipped bug (desktop Chrome shows the toast)',
   '    if (!isMobileDevice()) return                                  // desktop: nothing to add\n',
   '',
   'stays silent on desktop even when the browser offers a real install prompt'],

  // Written as the inlined regex rather than isMobileUserAgent() so the mutant
  // needs no import it would not have: a ReferenceError fails every test in the
  // file, which reads as "caught" while proving nothing about this gate.
  ['the gate uses the platform check, under-correcting on tablets in desktop mode',
   '    if (!isMobileDevice()) return',
   '    if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return',
   'still asks a coarse-pointer device that sends a desktop user agent'],

  ['the gate is inverted, so only desktop is asked',
   '    if (!isMobileDevice()) return',
   '    if (isMobileDevice()) return',
   'offers an Install action once the prompt is available'],

  // Ordering, not presence. A gate that spends the once-per-session key on the
  // way out records "already asked" for a prompt nobody saw -- and on a device
  // that then rotates, docks, or hands off, the real opportunity is gone.
  ['declining to ask still burns the once-per-session key',
   '    if (!isMobileDevice()) return                                  // desktop: nothing to add',
   '    if (!isMobileDevice()) { this.markShown(); return }',
   'does not burn the once-per-session key when it declines to ask'],
]

export const SURVIVORS = {}
