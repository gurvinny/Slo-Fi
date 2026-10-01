// Author: gurvinny
//
// The shared device-class helpers. Four files carried a verbatim copy of
// `/iPhone|iPad|iPod|Android/i` before this module existed, and the install
// prompt bug was the consequence: the one place that needed a *device* answer
// had no gate at all, while four places that needed a *platform* answer each
// had their own.
//
// The distinction these tests defend is the whole reason there are two
// exported predicates rather than one:
//
//   isMobileUserAgent() -- the platform. iOS/Android specifically. Drives
//                          renderer budgets and AudioContext suspension, both
//                          of which are wrong on a touchscreen laptop.
//   isMobileDevice()    -- the form factor. Platform OR a coarse pointer, so
//                          an Android tablet requesting the desktop site still
//                          counts. Drives UI affordances only.
//
// Collapsing them is silent in both directions: a coarse-pointer desktop would
// drop the orb to the mobile geometry tier, and an Android tablet in desktop
// mode would lose the install prompt. Neither throws.
import { describe, it, expect, afterEach } from 'vitest'
import { isMobileUserAgent, isCoarsePointer, isMobileDevice } from '../../src/ui/device'
import { resetDom, stubMatchMedia, stubUserAgent } from '../helpers/dom'

const IPHONE   = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD     = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
const IPOD     = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID  = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'
const DESKTOP  = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'
const MAC      = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'

describe('isMobileUserAgent', () => {
  afterEach(() => resetDom())

  it.each([
    ['iPhone', IPHONE],
    ['iPad', IPAD],
    ['iPod touch', IPOD],
    ['Android', ANDROID],
  ])('recognises %s', (_label, ua) => {
    stubUserAgent(ua)
    expect(isMobileUserAgent()).toBe(true)
  })

  it.each([
    ['desktop Linux Chrome', DESKTOP],
    ['desktop macOS Chrome', MAC],
  ])('does not claim %s', (_label, ua) => {
    stubUserAgent(ua)
    expect(isMobileUserAgent()).toBe(false)
  })

  it('matches case-insensitively, as the four originals did', () => {
    stubUserAgent('something ANDROID something')
    expect(isMobileUserAgent()).toBe(true)
  })

  // The platform predicate is the one AnomalySphere and MobileController use.
  // A coarse pointer must not reach it: a touchscreen laptop has a desktop GPU
  // and a never-suspended AudioContext.
  it('ignores a coarse pointer entirely', () => {
    stubUserAgent(DESKTOP)
    stubMatchMedia({ 'pointer: coarse': true })
    expect(isMobileUserAgent()).toBe(false)
  })

  // Read at call time, not captured at module load. The four originals were
  // field initializers and module constants, which is exactly why every test
  // of them has to stub the UA before `new`.
  it('re-reads the user agent on every call', () => {
    stubUserAgent(DESKTOP)
    expect(isMobileUserAgent()).toBe(false)
    stubUserAgent(ANDROID)
    expect(isMobileUserAgent()).toBe(true)
  })
})

describe('isCoarsePointer', () => {
  afterEach(() => resetDom())

  it('reports a coarse pointer', () => {
    stubMatchMedia({ 'pointer: coarse': true })
    expect(isCoarsePointer()).toBe(true)
  })

  it('reports a fine pointer', () => {
    stubMatchMedia({ 'pointer: coarse': false })
    expect(isCoarsePointer()).toBe(false)
  })

  // jsdom ships no matchMedia at all, and neither do several embedded
  // webviews. Throwing here would take down whatever asked -- including the
  // renderer constructor.
  it('answers false rather than throwing where matchMedia is absent', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, writable: true, value: undefined,
    })
    expect(() => isCoarsePointer()).not.toThrow()
    expect(isCoarsePointer()).toBe(false)
  })
})

describe('isMobileDevice', () => {
  afterEach(() => resetDom())

  it('is true on a mobile platform with a fine pointer, which is a plugged-in phone or a lying emulator', () => {
    stubUserAgent(ANDROID)
    stubMatchMedia({ 'pointer: coarse': false })
    expect(isMobileDevice()).toBe(true)
  })

  // The reason the OR exists. Android tablets requesting the desktop site send
  // a desktop UA, and they are precisely the devices where "Add to Home
  // Screen" is the most useful.
  it('is true on a desktop UA with a coarse pointer, which is a tablet in desktop mode', () => {
    stubUserAgent(DESKTOP)
    stubMatchMedia({ 'pointer: coarse': true })
    expect(isMobileDevice()).toBe(true)
  })

  it('is false on a desktop UA with a fine pointer', () => {
    stubUserAgent(DESKTOP)
    stubMatchMedia({ 'pointer: coarse': false })
    expect(isMobileDevice()).toBe(false)
  })

  // Not an edge case: this is the configuration the bug shipped on.
  it('is false on desktop Chrome, where the toast was appearing', () => {
    stubUserAgent(MAC)
    stubMatchMedia({})
    expect(isMobileDevice()).toBe(false)
  })
})
