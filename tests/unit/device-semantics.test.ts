// Author: gurvinny
//
// Which device predicate each consumer is wired to.
//
// Behavioural tests cannot reach this. `isMobileUserAgent` and `isMobileDevice`
// agree on every real phone and on every real desktop with a mouse; they differ
// only on a touchscreen laptop and on a tablet requesting the desktop site. So
// swapping one for the other in AnomalySphere passes the entire suite, passes
// the browser suite, passes e2e, and silently drops the orb to the mobile
// geometry tier -- half the particles, no MSAA, DPR capped at 2, 60 fps -- on
// any desktop with a touchscreen.
//
// The import is the only place that decision is visible, so the import is what
// gets asserted. Same reasoning as the shader-source assertions in
// orb-brightness.test.ts: a value you cannot instantiate here is still
// checkable as text.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function source(rel: string): string {
  return readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8')
}

/**
 * Files whose answer is about the PLATFORM -- iOS/Android specifically, where
 * the GPU budget is small and the AudioContext suspends on background. A
 * coarse pointer says nothing about either.
 */
const PLATFORM_CONSUMERS = [
  'ui/AnomalySphere.ts',
  'ui/MobileController.ts',
  'ui/App.ts',
  'ui/SplashController.ts',
]

/** Files whose answer is about the FORM FACTOR, where a coarse pointer counts. */
const DEVICE_CONSUMERS = ['ui/InstallController.ts']

describe('device predicate wiring', () => {
  it.each(PLATFORM_CONSUMERS)('%s asks about the platform, not the pointer', (rel) => {
    const src = source(rel)
    expect(src).toMatch(/isMobileUserAgent/)
    expect(src).not.toMatch(/isMobileDevice/)
    expect(src).not.toMatch(/pointer:\s*coarse/)
  })

  it.each(DEVICE_CONSUMERS)('%s asks about the form factor', (rel) => {
    expect(source(rel)).toMatch(/isMobileDevice/)
  })

  // The duplication that caused the bug. Four verbatim copies of one regex, and
  // the single file that needed it had none -- which is not a thing four copies
  // can tell you. One definition, and this is the assertion that keeps a fifth
  // copy from being added back by hand.
  it.each([...PLATFORM_CONSUMERS, ...DEVICE_CONSUMERS])(
    '%s carries no inlined user-agent regex of its own', (rel) => {
      expect(source(rel)).not.toMatch(/iPhone\|iPad\|iPod\|Android/)
    })

  it('defines the user-agent regex exactly once, in device.ts', () => {
    const src = source('ui/device.ts')
    expect([...src.matchAll(/iPhone\|iPad\|iPod\|Android/g)]).toHaveLength(1)
  })

  // InstallController keeps a SEPARATE iOS-only test for the manual A2HS
  // instructions, which is correct -- iOS Safari is the one platform with no
  // programmatic prompt. That is a narrower question than either predicate
  // answers, so it stays local rather than moving into device.ts.
  it('leaves the iOS-specific A2HS check in InstallController', () => {
    expect(source('ui/InstallController.ts')).toMatch(/iPad\|iPhone\|iPod/)
  })
})
