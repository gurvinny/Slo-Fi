// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountFixture, resetDom, stubUserAgent } from '../helpers/dom'

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'

// IS_MOBILE is a readonly field initializer, so it is captured per instance at
// construction -- the UA has to be stubbed before the import-time `new`, which
// is why the class is imported fresh inside each test rather than at the top.
async function build(ua: string) {
  stubUserAgent(ua)
  const { SplashController } = await import('../../src/ui/SplashController')
  return new SplashController()
}

const splash = () => document.getElementById('splash')
const html = () => document.documentElement
const cta = () => document.getElementById('splashCta')!

describe('SplashController', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); resetDom(); vi.restoreAllMocks() })

  it('does not leave the page hidden when there is no splash to show', async () => {
    // has-splash is added before the element is looked for. If the early return
    // forgot to undo it, the whole landing page would stay invisible forever --
    // the worst failure this class can produce.
    await build(DESKTOP_UA)
    expect(html().classList.contains('has-splash')).toBe(false)
  })

  it('hides the landing content while the splash is up', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)
    expect(html().classList.contains('has-splash')).toBe(true)
    expect(splash()!.classList.contains('splash--animate')).toBe(true)
  })

  it('records the visit so the next load can skip the sequence', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)
    expect(localStorage.getItem('sf_visited')).toBe('1')
  })

  it('collapses fast for a returning visitor', async () => {
    localStorage.setItem('sf_visited', '1')
    mountFixture('#splash')
    await build(DESKTOP_UA)

    expect(splash()!.classList.contains('splash--fast')).toBe(true)
    expect(splash()!.classList.contains('splash--animate')).toBe(false)
    // Revealed immediately rather than waiting on a dismissal that will never
    // come -- there is no CTA wired in this branch.
    expect(html().classList.contains('has-splash')).toBe(false)

    vi.advanceTimersByTime(280)
    expect(splash()).toBeNull()
  })

  it('reveals the CTA at 1020ms, not before', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)

    vi.advanceTimersByTime(1019)
    expect(cta().classList.contains('splash-cta--visible')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(cta().classList.contains('splash-cta--visible')).toBe(true)
  })

  it('pulses the mark three times and leaves the opacity clean', async () => {
    mountFixture('#splash')
    const el = splash()!
    await build(DESKTOP_UA)

    // The 820ms timeout only starts the interval; the first pulse lands one
    // 52ms tick later.
    vi.advanceTimersByTime(820)
    expect(el.style.opacity).toBe('')
    vi.advanceTimersByTime(52)
    expect(el.style.opacity).toBe('0.1')

    // Six 52ms steps in total = three on/off pulses, then the inline opacity is
    // handed back to the stylesheet. A leftover 0.1 would leave the splash
    // near-invisible for the rest of its life.
    vi.advanceTimersByTime(52 * 5)
    expect(el.style.opacity).toBe('')
  })

  it('dismisses on the CTA click on desktop', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)
    vi.advanceTimersByTime(1020)

    cta().click()

    expect(html().classList.contains('has-splash')).toBe(false)
    expect(splash()!.classList.contains('splash--out')).toBe(true)

    vi.advanceTimersByTime(749)
    expect(splash()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(splash()).toBeNull()
  })

  it('ignores a second CTA click after dismissal', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)
    const el = splash()!
    vi.advanceTimersByTime(1020)

    // Held before the removal: the CTA lives inside #splash, so it leaves the
    // document with it and getElementById stops finding it.
    const button = cta()
    button.click()
    vi.advanceTimersByTime(750)

    // The listener is {once:true} and the node is detached; clicking it again
    // must not schedule a second removal against a dead element.
    expect(() => button.click()).not.toThrow()
    expect(el.isConnected).toBe(false)
  })

  it('dismisses on a tap anywhere on mobile, and ignores the CTA path', async () => {
    mountFixture('#splash')
    await build(MOBILE_UA)
    vi.advanceTimersByTime(1020)

    document.dispatchEvent(new Event('touchstart'))

    expect(splash()!.classList.contains('splash--out')).toBe(true)
    vi.advanceTimersByTime(750)
    expect(splash()).toBeNull()
  })

  it('unbinds the mobile tap handler after the first tap', async () => {
    mountFixture('#splash')
    await build(MOBILE_UA)
    vi.advanceTimersByTime(1020)

    const el = splash()!
    document.dispatchEvent(new Event('touchstart'))
    vi.advanceTimersByTime(750)

    // "Does not throw" is too weak to detect this: _dismiss against a detached
    // element is harmless, so a handler left bound would pass. Clearing the
    // class and re-tapping makes a second dismissal observable.
    el.classList.remove('splash--out')
    document.dispatchEvent(new Event('touchstart'))
    expect(el.classList.contains('splash--out')).toBe(false)
  })

  it('pins the collapse origin to the mark', async () => {
    mountFixture('#splash')
    await build(DESKTOP_UA)
    vi.advanceTimersByTime(1020)
    cta().click()

    // jsdom reports an all-zero bounding rect, so the computed centre is a
    // deterministic 0.0% on both axes. What this proves is that the properties
    // are set from the mark at all -- the values themselves only mean something
    // in a real layout, which is the browser suite's job.
    expect(splash()!.style.getPropertyValue('--clip-cx')).toBe('0.0%')
    expect(splash()!.style.getPropertyValue('--clip-cy')).toBe('0.0%')
  })
})

describe('splash accessibility', () => {
  afterEach(() => { resetDom() })

  // #splash carried aria-hidden="true" while wrapping #splashCta, the only way
  // a desktop visitor dismisses it. aria-hidden on an ancestor of an operable
  // control is a WCAG violation with a nasty shape: a screen reader announces
  // nothing, while a keyboard user can still tab to a button assistive tech
  // insists does not exist, so the app opens behind an invisible wall.
  //
  // Walking up from the button rather than asserting on #splash directly means
  // this still fails if the attribute reappears on any wrapper in between.
  it('leaves no aria-hidden ancestor above the dismiss button', () => {
    mountFixture('#splash')

    const hidden: string[] = []
    for (let el = cta().parentElement; el; el = el.parentElement) {
      if (el.getAttribute('aria-hidden') === 'true') {
        hidden.push(el.id ? `#${el.id}` : el.className || el.tagName)
      }
    }

    expect(hidden, `aria-hidden ancestors of #splashCta: ${hidden.join(', ')}`)
      .toEqual([])
  })

  // The decorative children should keep theirs -- the fix is to remove it from
  // the operable branch, not to strip it everywhere. Without this, deleting
  // every aria-hidden in the file would satisfy the test above.
  it('keeps aria-hidden on the purely decorative elements', () => {
    const root = mountFixture('#splash')

    for (const sel of ['.splash-bracket', '.splash-scanline', '.splash-eq', '.splash-version']) {
      const el = root.querySelector(sel)
      expect(el, `${sel} should exist in index.html`).not.toBeNull()
      expect(el!.getAttribute('aria-hidden'), `${sel} should stay hidden`).toBe('true')
    }
  })

  it('gives the dismiss button an accessible name', () => {
    mountFixture('#splash')
    const name = cta().getAttribute('aria-label') ?? cta().textContent?.trim() ?? ''
    expect(name.length, 'the CTA needs a name assistive tech can announce')
      .toBeGreaterThan(0)
  })
})
