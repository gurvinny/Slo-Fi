// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  resetDom, stubUserAgent, stubMediaSession, removeMediaSession,
  stubVibration, stubWakeLock, stubFullscreen, setVisibility,
  type MediaSessionStub,
} from '../helpers/dom'

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'

// The engine surface MobileController actually touches. Deliberately not the
// real AudioEngine: what is under test here is which browser APIs get driven
// and in what order, not the audio graph.
function fakeEngine(over: Partial<ReturnType<typeof baseEngine>> = {}) {
  return { ...baseEngine(), ...over }
}
function baseEngine() {
  const calls: string[] = []
  const keepalive = { paused: true, play: () => { keepalive.paused = false; return Promise.resolve() }, pause: () => { keepalive.paused = true } }
  return {
    calls,
    keepaliveEl: keepalive as unknown as HTMLAudioElement,
    isPlaying: false,
    duration: 180,
    currentTime: 30,
    backgroundMode: null as boolean | null,
    seeked: [] as number[],
    getParams: () => ({ playbackRate: 0.8 }),
    play:  function () { calls.push('play') },
    pause: function () { calls.push('pause') },
    stop:  function () { calls.push('stop') },
    seek:  function (t: number) { (this as never as { seeked: number[] }).seeked.push(t) },
    setBackgroundMode: function (on: boolean) { (this as never as { backgroundMode: boolean }).backgroundMode = on; calls.push(`bg:${on}`) },
    resumeFromBackground: function () { calls.push('resume') },
  }
}

// Every controller built in a test, so afterEach can tear them down. The
// constructor binds a document-level visibilitychange listener that only
// destroy() removes, so a controller left alive keeps reacting to later tests'
// visibility changes -- and drives whichever stubs those tests installed.
const live: { destroy(): void }[] = []

// IS_MOBILE_PLATFORM is a module-level const evaluated on import, so the UA has
// to be stubbed and the module registry reset before each construction.
async function build(ua: string, engine: ReturnType<typeof baseEngine>) {
  stubUserAgent(ua)
  vi.resetModules()
  const { MobileController } = await import('../../src/ui/MobileController')
  const controller = new MobileController(engine as never)
  live.push(controller)
  return controller
}

describe('MobileController', () => {
  let ms: MediaSessionStub

  beforeEach(() => {
    ms = stubMediaSession()
    stubVibration()
    stubWakeLock()
    stubFullscreen()
    setVisibility('visible')
  })
  afterEach(() => {
    while (live.length) live.pop()!.destroy()
    resetDom(); vi.restoreAllMocks(); vi.useRealTimers()
  })

  describe('lock screen transport', () => {
    it('registers every transport action the OS can offer', async () => {
      await build(MOBILE_UA, fakeEngine())
      for (const action of ['play', 'pause', 'stop', 'seekto', 'seekbackward', 'seekforward', 'previoustrack']) {
        expect(ms.handlers.get(action), action).toBeTypeOf('function')
      }
    })

    it('unregisters nexttrack so the OS hides a button that does nothing', async () => {
      await build(MOBILE_UA, fakeEngine())
      expect(ms.handlers.get('nexttrack')).toBeNull()
    })

    it.each([
      ['play',  'play',  'onExternalPlay'],
      ['pause', 'pause', 'onExternalPause'],
      ['stop',  'stop',  'onExternalStop'],
    ])('drives the engine and notifies App.ts on a lock screen %s', async (action, call, cb) => {
      const engine = fakeEngine()
      const controller = await build(MOBILE_UA, engine)
      let notified = 0
      ;(controller as unknown as Record<string, () => void>)[cb] = () => { notified++ }

      ms.invoke(action)

      // Both halves matter: the engine acts, and App.ts is told so its button
      // icons and orb state do not drift from the real playback state.
      expect(engine.calls).toContain(call)
      expect(notified).toBe(1)
    })

    it('seeks to the requested time', async () => {
      const engine = fakeEngine()
      await build(MOBILE_UA, engine)
      ms.invoke('seekto', { seekTime: 42 })
      expect(engine.seeked).toEqual([42])
    })

    it('ignores a seekto with no time rather than jumping to zero', async () => {
      const engine = fakeEngine()
      await build(MOBILE_UA, engine)
      ms.invoke('seekto', {})
      expect(engine.seeked).toEqual([])
    })

    it('clamps a skip backward to the start of the track', async () => {
      const engine = fakeEngine({ currentTime: 3 })
      await build(MOBILE_UA, engine)
      ms.invoke('seekbackward', { seekOffset: 10 })
      expect(engine.seeked).toEqual([0])
    })

    it('clamps a skip forward to the end of the track', async () => {
      const engine = fakeEngine({ currentTime: 175, duration: 180 })
      await build(MOBILE_UA, engine)
      ms.invoke('seekforward', { seekOffset: 10 })
      expect(engine.seeked).toEqual([180])
    })

    it.each([['seekbackward', 20], ['seekforward', 40]])(
      'defaults %s to a ten second skip', async (action, expected) => {
        const engine = fakeEngine({ currentTime: 30 })
        await build(MOBILE_UA, engine)
        ms.invoke(action, {})
        expect(engine.seeked).toEqual([expected])
      })

    it('treats previoustrack as a restart, since there is no previous track', async () => {
      const engine = fakeEngine({ currentTime: 90 })
      await build(MOBILE_UA, engine)
      ms.invoke('previoustrack')
      expect(engine.seeked).toEqual([0])
    })
  })

  describe('lock screen metadata', () => {
    it('publishes the track title under the Slo-Fi artist', async () => {
      const controller = await build(MOBILE_UA, fakeEngine())
      controller.setMediaSessionMetadata('midnight drive')
      expect(ms.metadata).toMatchObject({ title: 'midnight drive', artist: 'Slo-Fi' })
    })

    it.each([[true, 'playing'], [false, 'paused']])(
      'reports playing=%s as "%s"', async (playing, state) => {
        const controller = await build(MOBILE_UA, fakeEngine())
        controller.updatePlaybackState(playing)
        expect(ms.playbackState).toBe(state)
      })

    it('publishes a position state the OS scrubber can use', async () => {
      const controller = await build(MOBILE_UA, fakeEngine({ currentTime: 30, duration: 180 }))
      controller.updatePlaybackState(true)
      expect(ms.positionStates).toEqual([{ duration: 180, playbackRate: 0.8, position: 30 }])
    })

    it('clamps the reported position to the duration', async () => {
      // currentTime can briefly exceed duration mid-seek, and setPositionState
      // rejects that outright on some browsers.
      const controller = await build(MOBILE_UA, fakeEngine({ currentTime: 500, duration: 180 }))
      controller.updatePlaybackState(true)
      expect(ms.positionStates).toEqual([{ duration: 180, playbackRate: 0.8, position: 180 }])
    })

    it('skips the position state when no track is loaded', async () => {
      const controller = await build(MOBILE_UA, fakeEngine({ duration: 0 }))
      controller.updatePlaybackState(false)
      expect(ms.positionStates).toEqual([])
    })

    it('survives a browser that rejects setPositionState', async () => {
      ms = stubMediaSession({ positionStateThrows: true })
      const controller = await build(MOBILE_UA, fakeEngine())
      expect(() => controller.updatePlaybackState(true)).not.toThrow()
      // The playback state still lands -- only the scrubber detail is lost.
      expect(ms.playbackState).toBe('playing')
    })

    it('does nothing on a browser without the Media Session API', async () => {
      removeMediaSession()
      const controller = await build(DESKTOP_UA, fakeEngine())
      expect(() => {
        controller.setMediaSessionMetadata('x')
        controller.updatePlaybackState(true)
        controller.destroy()
      }).not.toThrow()
    })
  })

  describe('backgrounding', () => {
    it('lightens the DSP graph and holds the audio session when hidden on mobile', async () => {
      const engine = fakeEngine({ isPlaying: true })
      await build(MOBILE_UA, engine)

      setVisibility('hidden')

      expect(engine.backgroundMode).toBe(true)
      // The keepalive element must be playing or iOS tears down the audio route.
      expect((engine.keepaliveEl as unknown as { paused: boolean }).paused).toBe(false)
      expect(ms.playbackState).toBe('playing')
    })

    it('leaves the graph alone when hidden while paused', async () => {
      const engine = fakeEngine({ isPlaying: false })
      await build(MOBILE_UA, engine)
      setVisibility('hidden')
      expect(engine.backgroundMode).toBeNull()
    })

    it('does not touch the graph when hidden on desktop', async () => {
      // Desktop browsers keep the AudioContext running, so the background
      // handling would be a pointless quality drop mid-playback.
      const engine = fakeEngine({ isPlaying: true })
      await build(DESKTOP_UA, engine)
      setVisibility('hidden')
      expect(engine.backgroundMode).toBeNull()
      expect(engine.calls).not.toContain('bg:true')
    })

    it('restores full quality and resumes the context on return', async () => {
      const engine = fakeEngine({ isPlaying: true })
      await build(MOBILE_UA, engine)
      setVisibility('hidden')
      engine.calls.length = 0

      setVisibility('visible')

      // Order matters: full quality is restored before the context is resumed,
      // so playback does not audibly dip on the way back.
      expect(engine.calls.slice(0, 2)).toEqual(['bg:false', 'resume'])
      expect(engine.backgroundMode).toBe(false)
    })

    it('restores quality on return even on desktop, where nothing lowered it', async () => {
      const engine = fakeEngine({ isPlaying: true })
      await build(DESKTOP_UA, engine)
      setVisibility('visible')
      expect(engine.calls).toContain('bg:false')
    })

    it('stops reacting to visibility once destroyed', async () => {
      const engine = fakeEngine({ isPlaying: true })
      const controller = await build(MOBILE_UA, engine)
      controller.destroy()
      engine.calls.length = 0

      setVisibility('hidden')
      expect(engine.calls).toEqual([])
    })

    it('clears every action handler on destroy', async () => {
      const controller = await build(MOBILE_UA, fakeEngine())
      controller.destroy()
      for (const action of ['play', 'pause', 'stop', 'seekto', 'previoustrack', 'nexttrack']) {
        expect(ms.handlers.get(action), action).toBeNull()
      }
    })
  })

  describe('wake lock', () => {
    it('re-acquires the sentinel when the tab comes back while playing', async () => {
      const lock = stubWakeLock()
      const engine = fakeEngine({ isPlaying: true })
      await build(MOBILE_UA, engine)

      setVisibility('visible')
      await vi.waitFor(() => expect(lock.requests).toBeGreaterThan(0))
    })

    it('does not hold the screen awake when nothing is playing', async () => {
      const lock = stubWakeLock()
      await build(MOBILE_UA, fakeEngine({ isPlaying: false }))
      setVisibility('visible')
      await Promise.resolve()
      expect(lock.requests).toBe(0)
    })

    it('treats a denied wake lock as non-fatal', async () => {
      stubWakeLock(true)
      const controller = await build(MOBILE_UA, fakeEngine())
      await expect(controller.acquireWakeLock()).resolves.toBeUndefined()
    })

    it('releases the sentinel it holds', async () => {
      const lock = stubWakeLock()
      const controller = await build(MOBILE_UA, fakeEngine())
      await controller.acquireWakeLock()
      controller.releaseWakeLock()
      await vi.waitFor(() => expect(lock.releases).toBe(1))
    })

    it('does nothing on a browser without the Wake Lock API', async () => {
      Reflect.deleteProperty(window.navigator, 'wakeLock')
      const controller = await build(DESKTOP_UA, fakeEngine())
      await expect(controller.acquireWakeLock()).resolves.toBeUndefined()
    })
  })

  describe('keepalive element', () => {
    it('starts the silence loop only once the element is paused', async () => {
      const engine = fakeEngine()
      const keepalive = engine.keepaliveEl as unknown as { paused: boolean }
      const controller = await build(MOBILE_UA, engine)

      controller.ensureSilenceLoop()
      expect(keepalive.paused).toBe(false)

      controller.stopSilenceLoop()
      expect(keepalive.paused).toBe(true)
    })

    it('tolerates an engine that has not created the element yet', async () => {
      const engine = fakeEngine({ keepaliveEl: null as unknown as HTMLAudioElement })
      const controller = await build(MOBILE_UA, engine)
      expect(() => { controller.ensureSilenceLoop(); controller.stopSilenceLoop() }).not.toThrow()
    })

    it('swallows a rejected play, which iOS does without a user gesture', async () => {
      const engine = fakeEngine()
      ;(engine.keepaliveEl as unknown as { play: () => Promise<void> }).play =
        () => Promise.reject(new Error('NotAllowedError'))
      const controller = await build(MOBILE_UA, engine)
      expect(() => controller.ensureSilenceLoop()).not.toThrow()
    })
  })

  describe('haptics', () => {
    it.each([
      ['hapticPlay',  [12]],
      ['hapticPause', [8]],
      ['hapticSeek',  [4]],
    ])('%s pulses a distinct pattern', async (method, pattern) => {
      const patterns = stubVibration()
      const controller = await build(MOBILE_UA, fakeEngine())
      ;(controller as unknown as Record<string, () => void>)[method]()
      expect(patterns).toEqual([pattern])
    })

    it('does nothing on a browser without the Vibration API', async () => {
      Reflect.deleteProperty(window.navigator, 'vibrate')
      const controller = await build(DESKTOP_UA, fakeEngine())
      expect(() => controller.hapticPlay()).not.toThrow()
    })
  })

  describe('fullscreen', () => {
    function fsButton(): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.innerHTML = '<span id="iconFullscreenEnter"></span><span id="iconFullscreenExit"></span>'
      document.body.appendChild(btn)
      return btn
    }

    it('enters fullscreen from the button, then exits on a second press', async () => {
      const fs = stubFullscreen()
      const controller = await build(DESKTOP_UA, fakeEngine())
      const btn = fsButton()
      controller.bindFullscreenBtn(btn)

      btn.click()
      expect(fs.requests).toBe(1)

      btn.click()
      expect(fs.exits).toBe(1)
    })

    it('swallows a denied request, as iOS Safari always denies', async () => {
      stubFullscreen({ denyRequest: true })
      const controller = await build(MOBILE_UA, fakeEngine())
      const btn = fsButton()
      controller.bindFullscreenBtn(btn)
      expect(() => btn.click()).not.toThrow()
    })

    it('swaps the icon and the label to match the real fullscreen state', async () => {
      const fs = stubFullscreen()
      const controller = await build(DESKTOP_UA, fakeEngine())
      const btn = fsButton()
      controller.bindFullscreenBtn(btn)
      const enter = btn.querySelector<HTMLElement>('#iconFullscreenEnter')!
      const exit  = btn.querySelector<HTMLElement>('#iconFullscreenExit')!

      btn.click()
      document.dispatchEvent(new Event('fullscreenchange'))

      expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen')
      expect(enter.style.display).toBe('none')
      expect(exit.style.display).toBe('')

      fs.element = null
      document.dispatchEvent(new Event('fullscreenchange'))

      expect(btn.getAttribute('aria-label')).toBe('Enter fullscreen')
      expect(enter.style.display).toBe('')
      expect(exit.style.display).toBe('none')
    })

    it('syncs from the webkit-prefixed state on older mobile browsers', async () => {
      const controller = await build(MOBILE_UA, fakeEngine())
      const btn = fsButton()
      controller.bindFullscreenBtn(btn)

      Object.defineProperty(document, 'webkitFullscreenElement', {
        configurable: true, get: () => document.documentElement,
      })
      document.dispatchEvent(new Event('webkitfullscreenchange'))

      expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen')
    })
  })
})
