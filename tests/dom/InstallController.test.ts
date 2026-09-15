// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InstallController } from '../../src/ui/InstallController'
import type { ToastOptions } from '../../src/ui/Toast'
import { resetDom, stubMatchMedia, stubUserAgent } from '../helpers/dom'

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36'

// The controller only ever calls toast.show, so a recording stub is the whole
// dependency -- and it keeps this suite from needing the toast markup.
function fakeToast() {
  const shown: ToastOptions[] = []
  return { shown, show: (o: ToastOptions) => { shown.push(o) }, hide: () => {} }
}

/**
 * Fire a beforeinstallprompt carrying the two members the controller uses.
 * Returns whether preventDefault was called, since suppressing Chrome's own
 * mini-infobar is the entire reason the listener exists.
 */
function fireInstallPrompt() {
  const state = { prevented: false, prompted: 0 }
  const evt = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void> }
  evt.preventDefault = () => { state.prevented = true }
  evt.prompt = () => { state.prompted++; return Promise.resolve() }
  window.dispatchEvent(evt)
  return state
}

describe('InstallController', () => {
  beforeEach(() => {
    // jsdom implements no matchMedia, so isStandalone throws without this.
    stubMatchMedia({ 'display-mode: standalone': false })
    stubUserAgent(ANDROID_UA)
    // navigator.standalone is not a jsdom property, so a test that defines it
    // leaves it defined for every test after -- which silently turns the whole
    // rest of the file into "already installed, stay quiet" and passes.
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true, value: undefined,
    })
    sessionStorage.clear()
  })
  afterEach(() => { resetDom(); vi.restoreAllMocks() })

  it('suppresses the browser mini-infobar so the prompt happens on our terms', () => {
    new InstallController(fakeToast() as never)
    expect(fireInstallPrompt().prevented).toBe(true)
  })

  it('stays quiet when the prompt has not fired and the browser is not iOS', () => {
    const toast = fakeToast()
    new InstallController(toast as never).maybePrompt()

    // Desktop Chrome before beforeinstallprompt, or an unsupported browser:
    // nothing is installable, so nagging would be the bug.
    expect(toast.shown).toEqual([])
  })

  it('offers an Install action once the prompt is available', () => {
    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    fireInstallPrompt()
    controller.maybePrompt()

    expect(toast.shown).toHaveLength(1)
    expect(toast.shown[0].actionLabel).toBe('Install')
    // Sticky on purpose: this one asks for a decision, so it must not vanish.
    expect(toast.shown[0].duration).toBeUndefined()
  })

  it('runs the real prompt when the action is taken, and only once', async () => {
    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    const state = fireInstallPrompt()
    controller.maybePrompt()

    toast.shown[0].onAction!()
    toast.shown[0].onAction!()
    await Promise.resolve()

    // The deferred event is cleared before prompt() is called, so a double tap
    // cannot hand the same consumed event to Chrome twice.
    expect(state.prompted).toBe(1)
  })

  it('shows manual instructions on iOS, which has no programmatic prompt', () => {
    stubUserAgent(IOS_UA)
    const toast = fakeToast()
    new InstallController(toast as never).maybePrompt()

    expect(toast.shown).toHaveLength(1)
    expect(toast.shown[0].message).toMatch(/Add to Home Screen/)
    expect(toast.shown[0].actionLabel).toBeUndefined()
    // Instructional, not a decision -- it dismisses itself.
    expect(toast.shown[0].duration).toBe(8000)
  })

  it('prefers the real prompt over the iOS instructions when both apply', () => {
    stubUserAgent(IOS_UA)
    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    fireInstallPrompt()
    controller.maybePrompt()

    expect(toast.shown[0].actionLabel).toBe('Install')
  })

  it('says nothing when already running as an installed app', () => {
    stubMatchMedia({ 'display-mode: standalone': true })
    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    fireInstallPrompt()
    controller.maybePrompt()

    expect(toast.shown).toEqual([])
  })

  it('honours the older iOS navigator.standalone flag', () => {
    stubUserAgent(IOS_UA)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    const toast = fakeToast()
    new InstallController(toast as never).maybePrompt()

    expect(toast.shown).toEqual([])
  })

  it('asks at most once per session', () => {
    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    fireInstallPrompt()
    controller.maybePrompt()
    controller.maybePrompt()
    controller.maybePrompt()

    expect(toast.shown).toHaveLength(1)
    expect(sessionStorage.getItem('slofi-install-shown')).toBe('1')
  })

  it('stops asking in a fresh controller once the app is installed', () => {
    const toast = fakeToast()
    new InstallController(toast as never)
    window.dispatchEvent(new Event('appinstalled'))

    // A reload after installing builds a new controller against the same
    // session, so the suppression has to live in storage, not in the instance.
    const next = fakeToast()
    const controller = new InstallController(next as never)
    fireInstallPrompt()
    controller.maybePrompt()

    expect(next.shown).toEqual([])
  })

  it('still works when sessionStorage throws, as it does in private mode', () => {
    const boom = () => { throw new Error('storage disabled') }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)

    const toast = fakeToast()
    const controller = new InstallController(toast as never)
    fireInstallPrompt()

    // Degrades to prompting rather than to crashing on the first track load.
    expect(() => controller.maybePrompt()).not.toThrow()
    expect(toast.shown).toHaveLength(1)
  })
})
