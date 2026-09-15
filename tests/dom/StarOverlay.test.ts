// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StarOverlay } from '../../src/ui/StarOverlay'
import { resetDom, recordCanvas2D, stubMatchMedia, type Ctx2DCall } from '../helpers/dom'

let draws: Ctx2DCall[]
let frames: ((t: number) => void)[]
let cancelled: number[]

/** Run exactly one queued animation frame at the given timestamp. */
function frame(now: number): void {
  const cb = frames.shift()
  if (!cb) throw new Error('no animation frame was queued')
  cb(now)
}

function setViewport(width: number, height: number, dpr = 1): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: dpr })
}

function build(opts: { reducedMotion?: boolean } = {}) {
  stubMatchMedia({ 'prefers-reduced-motion': opts.reducedMotion ?? false })
  draws = recordCanvas2D()
  const overlay = new StarOverlay()
  return { overlay, canvas: document.querySelector<HTMLCanvasElement>('.star-overlay')! }
}

const called = (calls: Ctx2DCall[], method: string) => calls.filter((c) => c.method === method)
const alphas = (calls: Ctx2DCall[]) =>
  calls.filter((c) => c.method === 'set:globalAlpha').map((c) => c.args[0] as number)

describe('StarOverlay', () => {
  beforeEach(() => {
    setViewport(1024, 768, 1)
    frames = []
    cancelled = []
    // useFakeTimers fakes requestAnimationFrame too, so it has to come first --
    // installed afterwards it silently replaces these stubs and every frame()
    // call finds an empty queue.
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      frames.push(cb); return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.push(id) })
    // Deterministic star placement: every random draw returns 0.5, so star
    // positions, sizes and timers are fixed and assertions can be exact.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => {
    vi.useRealTimers(); resetDom(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  })

  describe('mounting', () => {
    it('overlays the UI without intercepting clicks', () => {
      const { canvas } = build()
      // z-index 200 puts it above the panels; pointer-events none is what keeps
      // the transport bar underneath still clickable.
      expect(canvas.style.position).toBe('fixed')
      expect(canvas.style.zIndex).toBe('200')
      expect(canvas.style.pointerEvents).toBe('none')
    })

    it('bakes the star sprite once rather than per frame', () => {
      build()
      // 220 stars each building their own gradient was ~13k allocations a
      // second. One radial gradient at construction is the fix.
      expect(called(draws, 'createRadialGradient')).toHaveLength(1)

      // And no more on subsequent frames. Asserting only the construction count
      // would pass even if the sprite were rebuilt inside the draw loop, which
      // is the regression this guards against. Shooting-star heads also build
      // radial gradients, so this window stays before the first shot at 3500ms.
      draws.length = 0
      frame(0)
      frame(16)
      expect(called(draws, 'createRadialGradient')).toHaveLength(0)
    })

    it('removes itself and stops the loop on destroy', () => {
      const { overlay, canvas } = build()
      // The handle is only recorded once a frame has actually run: the
      // constructor discards the return value of its first requestAnimationFrame,
      // so destroying before the first frame has nothing to cancel.
      frame(0)
      overlay.destroy()

      expect(canvas.isConnected).toBe(false)
      expect(cancelled).toHaveLength(1)
    })
  })

  describe('sizing', () => {
    it('caps the backing store at 2x so a 3x phone does not render 9x the pixels', () => {
      setViewport(400, 800, 3)
      const { canvas } = build()
      expect(canvas.width).toBe(800)
      expect(canvas.height).toBe(1600)
    })

    it('uses the real ratio below the cap', () => {
      setViewport(400, 800, 1.5)
      const { canvas } = build()
      expect(canvas.width).toBe(600)
    })

    it('rebuilds on a window resize', () => {
      build()
      setViewport(300, 300, 1)
      window.dispatchEvent(new Event('resize'))

      draws.length = 0
      frame(0)
      // ~1 star per 3500 sq px: 300x300 rounds to 26, well under the cap.
      expect(called(draws, 'drawImage')).toHaveLength(26)
    })
  })

  describe('star field density', () => {
    it('scales the count with the viewport area', () => {
      setViewport(700, 500, 1)
      build()
      frame(0)
      expect(called(draws, 'drawImage')).toHaveLength(100)
    })

    it('caps the count so low-end devices stay smooth', () => {
      // 1024x768 would be 225 stars by area; the cap holds it at 220.
      setViewport(1024, 768, 1)
      build()
      frame(0)
      expect(called(draws, 'drawImage')).toHaveLength(220)
    })
  })

  describe('twinkling', () => {
    it('clears the canvas each frame instead of layering', () => {
      build()
      draws.length = 0
      frame(1000)
      expect(called(draws, 'clearRect')).toHaveLength(1)
    })

    it('scales the context to device pixels inside a save/restore pair', () => {
      setViewport(400, 400, 2)
      build()
      draws.length = 0
      frame(0)

      // Without the restore the scale compounds every frame and the field
      // zooms off-screen within a second.
      expect(called(draws, 'scale')[0].args).toEqual([2, 2])
      expect(called(draws, 'save').length).toBeGreaterThan(0)
      expect(called(draws, 'restore').length).toBeGreaterThan(0)
    })

    it('varies star brightness over time', () => {
      setViewport(400, 400, 1)
      build()

      draws.length = 0
      frame(0)
      const first = alphas(draws)

      draws.length = 0
      frame(700)
      const later = alphas(draws)

      // Same stars, different phase of the sine: the field must not be static.
      expect(first).not.toEqual(later)
    })

    it('sharpens the twinkle with treble energy rather than raising the ceiling', () => {
      setViewport(400, 400, 1)
      const { overlay } = build()

      draws.length = 0
      frame(500)
      const quiet = alphas(draws).filter((a) => a !== 1)

      overlay.setTreble(1)
      draws.length = 0
      frame(500)
      const loud = alphas(draws).filter((a) => a !== 1)

      // Treble feeds the sine's exponent, not a gain: it steepens the curve, so
      // peaks stay pinned near full brightness while everything off-peak gets
      // darker. At this phase the stars are mid-twinkle, so more treble means
      // dimmer -- asserting "brighter" would be asserting the wrong model.
      expect(loud[0]).toBeLessThan(quiet[0])
      expect(loud[0]).toBeGreaterThan(0)
    })

    it('keeps every alpha inside 0 to 1', () => {
      setViewport(400, 400, 1)
      const { overlay } = build()
      overlay.setTreble(1)

      for (const t of [0, 250, 900, 1700]) {
        draws.length = 0
        frame(t)
        for (const a of alphas(draws)) {
          expect(a).toBeGreaterThanOrEqual(0)
          expect(a).toBeLessThanOrEqual(1)
        }
      }
    })
  })

  describe('reduced motion', () => {
    it('draws a static field at a fixed brightness', () => {
      setViewport(400, 400, 1)
      build({ reducedMotion: true })

      draws.length = 0
      frame(0)
      const first = alphas(draws)

      draws.length = 0
      frame(900)
      const later = alphas(draws)

      expect(first).toEqual(later)
      expect(new Set(first.filter((a) => a !== 1))).toEqual(new Set([0.45]))
    })

    it('omits the diffraction cross, which is pure motion', () => {
      setViewport(400, 400, 1)
      build({ reducedMotion: true })
      draws.length = 0
      for (const t of [0, 400, 1200]) frame(t)
      expect(called(draws, 'stroke')).toHaveLength(0)
    })

    it('never launches a shooting star', () => {
      setViewport(400, 400, 1)
      build({ reducedMotion: true })
      draws.length = 0
      // Well past the 3.5s first-shot timer, in 50ms steps so dt is not clamped
      // away.
      for (let t = 0; t <= 8000; t += 50) frame(t)
      expect(called(draws, 'createLinearGradient')).toHaveLength(0)
    })

    it('follows a mid-session change to the preference', () => {
      setViewport(400, 400, 1)
      build({ reducedMotion: true })
      draws.length = 0
      frame(0)
      expect(called(draws, 'stroke')).toHaveLength(0)
    })
  })

  describe('shooting stars', () => {
    function advance(from: number, to: number, step = 50): void {
      for (let t = from; t <= to; t += step) frame(t)
    }

    it('launches one after the initial delay, not before', () => {
      setViewport(400, 400, 1)
      build()

      draws.length = 0
      advance(0, 3000)
      expect(called(draws, 'createLinearGradient')).toHaveLength(0)

      advance(3050, 4000)
      // The trail is a linear gradient, which nothing else in the pass draws.
      expect(called(draws, 'createLinearGradient').length).toBeGreaterThan(0)
    })

    it('retires a shot once its trail has faded', () => {
      setViewport(400, 400, 1)
      build()
      // First shot launches at 3500ms. decay is 0.95 alpha/s with random fixed
      // at 0.5, so it is gone by ~4550ms, and the next is not due until
      // 3500 + 6500 = 10000ms. Anything drawn in between means shots are
      // accumulating in the array instead of being spliced out.
      advance(0, 5000)

      draws.length = 0
      advance(5050, 8000)
      expect(called(draws, 'createLinearGradient')).toHaveLength(0)
    })

    it('holds the timer while audio is paused', () => {
      setViewport(400, 400, 1)
      const { overlay } = build()
      overlay.pause()

      draws.length = 0
      // 15fps throttle frames, far past the first-shot delay.
      vi.advanceTimersByTime(8000)
      expect(called(draws, 'createLinearGradient')).toHaveLength(0)
    })
  })

  describe('pause and resume', () => {
    it('drops to a throttled timer and stops the frame loop', () => {
      const { overlay } = build()
      frame(0)          // so there is a live rAF handle to cancel

      frames.length = 0
      overlay.pause()

      // rAF is cancelled and not re-armed; a 67ms interval takes over at ~15fps.
      expect(cancelled.length).toBeGreaterThan(0)
      expect(frames).toHaveLength(0)

      draws.length = 0
      vi.advanceTimersByTime(67 * 3)
      expect(called(draws, 'clearRect')).toHaveLength(3)
      // loop() must not re-arm rAF while paused, or both drivers stack.
      expect(frames).toHaveLength(0)
    })

    it('does not stack loops when paused twice', () => {
      const { overlay } = build()
      overlay.pause()
      overlay.pause()

      draws.length = 0
      vi.advanceTimersByTime(67 * 4)
      // A second interval would double the frame rate and the CPU cost.
      expect(called(draws, 'clearRect')).toHaveLength(4)
    })

    it('returns to the frame loop on resume and clears the throttle', () => {
      const { overlay } = build()
      overlay.pause()
      frames.length = 0

      overlay.resume()
      expect(frames).toHaveLength(1)

      draws.length = 0
      vi.advanceTimersByTime(67 * 5)
      // The interval must be gone, or both drivers run at once.
      expect(called(draws, 'clearRect')).toHaveLength(0)
    })

    it('ignores a resume when already playing', () => {
      const { overlay } = build()
      frames.length = 0
      overlay.resume()
      expect(frames).toHaveLength(0)
    })
  })
})
