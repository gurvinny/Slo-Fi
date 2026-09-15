// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Waveform } from '../../src/ui/Waveform'
import {
  resetDom, recordCanvas2D, stubBoundingRect, drawColors, type Ctx2DCall,
} from '../helpers/dom'

const W = 400
const H = 100

let draws: Ctx2DCall[]

function build(opts: { width?: number; dpr?: number } = {}) {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  draws = recordCanvas2D()
  stubBoundingRect(canvas, { width: opts.width ?? W, height: H })
  if (opts.dpr !== undefined) {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: opts.dpr })
  }
  const wf = new Waveform(canvas)
  return { wf, canvas }
}

function mouse(target: EventTarget, type: string, clientX: number, clientY = 50): void {
  target.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }))
}

/** Peaks rising left to right, so a bar's height identifies its index. */
function peaks(n = 16): Float32Array {
  return new Float32Array(Array.from({ length: n }, (_, i) => (i + 1) / n))
}

const fills = (calls: Ctx2DCall[]) => calls.filter((c) => c.method === 'fillRect')

// The loop region draws whenever end > start, and the markers default to the
// full track -- so a bar count or an edge click is measuring the loop overlay
// too unless it is collapsed out of the way first.
function noLoop(wf: Waveform): void { wf.setLoop(0.5, 0.5) }

// The playhead is the only thing drawn at 0.95 alpha; loop knobs use 0.9/0.4
// and the shaded region 0.18/0.07. That makes it the reliable discriminator,
// since moveTo and arc are shared with the loop handles.
function playheadX(calls: Ctx2DCall[]): number | null {
  const i = calls.findIndex((c) => c.method === 'set:globalAlpha' && c.args[0] === 0.95)
  if (i === -1) return null
  const move = calls.slice(i).find((c) => c.method === 'moveTo')
  return move ? (move.args[0] as number) : null
}

describe('Waveform', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  })
  afterEach(() => { resetDom(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  describe('progress and loop state', () => {
    it.each([[0.25, 0.25], [0.4, 0.4], [0.9, 0.9]])(
      'puts the playhead at %s of the width', (input, expected) => {
        const { wf } = build()
        wf.setData(peaks())
        noLoop(wf)
        draws.length = 0
        wf.setProgress(input)
        expect(playheadX(draws)).toBeCloseTo(expected * W, 5)
      })

    it.each([-0.5, 0, 1, 1.7])('draws no playhead at a progress of %s', (input) => {
      const { wf } = build()
      wf.setData(peaks())
      noLoop(wf)
      draws.length = 0
      wf.setProgress(input)

      // Note the clamp in setProgress is defensive only: the draw pass already
      // gates the playhead on `progress > 0 && progress < 1`, so an out-of-range
      // value and its clamped form render identically. This asserts the visible
      // contract rather than pretending to cover the clamp.
      expect(playheadX(draws)).toBeNull()
    })

    it('clamps loop markers into the track', () => {
      const { wf } = build()
      wf.setLoop(-1, 4)
      expect(wf.getLoop()).toEqual({ start: 0, end: 1 })
    })

    it('reports the markers it was given', () => {
      const { wf } = build()
      wf.setLoop(0.25, 0.75)
      expect(wf.getLoop()).toEqual({ start: 0.25, end: 0.75 })
    })
  })

  describe('seeking', () => {
    it('maps a click to the matching position in the track', () => {
      const { wf, canvas } = build()
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', W * 0.25)
      expect(seeks).toEqual([0.25])
    })

    it('continues seeking while the mouse is dragged', () => {
      const { wf, canvas } = build()
      noLoop(wf)
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', W * 0.1)
      mouse(window, 'mousemove', W * 0.5)
      mouse(window, 'mousemove', W * 0.9)
      expect(seeks).toEqual([0.1, 0.5, 0.9])
    })

    it('stops seeking after the button is released', () => {
      const { wf, canvas } = build()
      noLoop(wf)
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', W * 0.1)
      mouse(window, 'mouseup', 0)
      mouse(window, 'mousemove', W * 0.9)
      expect(seeks).toEqual([0.1])
    })

    it('clamps a click past the edge into the track', () => {
      const { wf, canvas } = build()
      noLoop(wf)
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', -50)
      mouse(canvas, 'mousedown', W + 50)
      expect(seeks).toEqual([0, 1])
    })

    it('grabs a marker rather than seeking when the loop spans the whole track', () => {
      // The markers default to 0 and 1, which puts them exactly on both canvas
      // edges -- so an edge click is a handle grab, not a seek to the start.
      const { wf, canvas } = build()
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', 0)
      expect(seeks).toEqual([])
    })
  })

  describe('loop handles', () => {
    it('grabs the nearest handle instead of seeking', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.25, 0.75)
      const seeks: number[] = []
      wf.onSeek = (r) => seeks.push(r)

      mouse(canvas, 'mousedown', W * 0.25)

      // Pressing on a marker must not also jump playback there.
      expect(seeks).toEqual([])
    })

    it('moves the start marker and reports the new region', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.25, 0.75)
      const changes: [number, number][] = []
      wf.onLoopChange = (s, e) => changes.push([s, e])

      mouse(canvas, 'mousedown', W * 0.25)
      mouse(window, 'mousemove', W * 0.4)

      expect(changes).toEqual([[0.4, 0.75]])
    })

    it('keeps the markers from crossing', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.25, 0.75)

      mouse(canvas, 'mousedown', W * 0.25)
      mouse(window, 'mousemove', W * 0.95)

      // A zero-or-inverted loop would make the engine loop nothing at all, so
      // the start is held a fixed margin below the end.
      const { start, end } = wf.getLoop()
      expect(start).toBeCloseTo(end - 0.01, 6)
      expect(start).toBeLessThan(end)
    })

    it('keeps the end marker above the start when dragged left', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.25, 0.75)

      mouse(canvas, 'mousedown', W * 0.75)
      mouse(window, 'mousemove', 0)

      const { start, end } = wf.getLoop()
      expect(end).toBeCloseTo(start + 0.01, 6)
    })

    it('resets both markers on a double-click of a handle', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.3, 0.6)
      const changes: [number, number][] = []
      wf.onLoopChange = (s, e) => changes.push([s, e])

      mouse(canvas, 'dblclick', W * 0.3)

      expect(wf.getLoop()).toEqual({ start: 0, end: 1 })
      expect(changes).toEqual([[0, 1]])
    })

    it('ignores a double-click away from either handle', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.3, 0.6)
      mouse(canvas, 'dblclick', W * 0.45)
      expect(wf.getLoop()).toEqual({ start: 0.3, end: 0.6 })
    })

    it('shows a resize cursor only over a handle', () => {
      const { wf, canvas } = build()
      wf.setLoop(0.25, 0.75)

      mouse(window, 'mousemove', W * 0.25)
      expect(canvas.style.cursor).toBe('ew-resize')

      mouse(window, 'mousemove', W * 0.5)
      expect(canvas.style.cursor).toBe('default')
    })

    it('clears the hover highlight when the pointer leaves', () => {
      const { canvas } = build()
      mouse(window, 'mousemove', W * 0.5)
      canvas.dispatchEvent(new Event('mouseleave'))
      expect(canvas.style.cursor).toBe('default')
    })
  })

  describe('drawing', () => {
    it('draws placeholder bars before a track is loaded', () => {
      build()
      // 80 decorative bars, and no playhead: there is nothing to play yet.
      expect(fills(draws)).toHaveLength(80)
      expect(draws.some((c) => c.method === 'arc')).toBe(false)
    })

    it('clears the canvas before every pass', () => {
      const { wf } = build()
      draws.length = 0
      wf.setData(peaks())
      // Without the clear, bars from the previous frame stay on the canvas and
      // the waveform smears as it plays.
      expect(draws[0].method).toBe('clearRect')
    })

    it('draws one unplayed bar per sample once data arrives', () => {
      const { wf } = build()
      wf.setData(peaks(16))
      noLoop(wf)
      draws.length = 0
      wf.redraw()

      // 16 unplayed bars, no played overdraw at progress 0.
      expect(fills(draws)).toHaveLength(16)
    })

    it('overdraws only the bars left of the playhead', () => {
      const { wf } = build()
      wf.setData(peaks(16))
      noLoop(wf)
      draws.length = 0
      wf.setProgress(0.5)

      // 16 unplayed + 8 played, and the played ones all sit in the left half.
      const rects = fills(draws)
      expect(rects).toHaveLength(24)
      for (const r of rects.slice(16)) {
        expect(r.args[0] as number).toBeLessThan(W * 0.5)
      }
    })

    it('draws the playhead only while a track is part-played', () => {
      const { wf } = build()
      wf.setData(peaks())
      noLoop(wf)

      for (const [progress, drawn] of [[0, false], [0.5, true], [1, false]] as const) {
        draws.length = 0
        wf.setProgress(progress)
        expect(playheadX(draws) !== null, `progress ${progress}`).toBe(drawn)
      }
    })

    it('dims the loop region when looping is off, and brightens it when on', () => {
      const { wf } = build()
      wf.setData(peaks())
      wf.setLoop(0.2, 0.8)

      draws.length = 0
      wf.setLoopEnabled(false)
      const off = draws.filter((c) => c.method === 'set:globalAlpha').map((c) => c.args[0])

      draws.length = 0
      wf.setLoopEnabled(true)
      const on = draws.filter((c) => c.method === 'set:globalAlpha').map((c) => c.args[0])

      // Markers stay visible while disabled -- just fainter -- so the user can
      // still see where they set them.
      expect(off).toContain(0.07)
      expect(on).toContain(0.18)
    })

    it('skips the loop region when the markers are inverted', () => {
      const { wf } = build()
      wf.setData(peaks())
      wf.setLoop(0.8, 0.8)
      draws.length = 0
      wf.redraw()
      expect(draws.some((c) => c.method === 'set:globalAlpha')).toBe(false)
    })
  })

  describe('theme colours', () => {
    it('falls back to built-in colours when no theme is set', () => {
      build()
      // jsdom resolves no custom properties, so every colour comes from the
      // `|| '#...'` fallbacks -- which is what an unthemed first paint does.
      const colors = drawColors(draws)
      expect(colors.length).toBeGreaterThan(0)
      for (const c of colors) expect(c).not.toContain('undefined')
    })

    it('expands a minified 3-digit theme hex so the alpha survives', () => {
      // The CSS minifier shortens #7733dd to #73d. Appending an alpha byte to
      // that yields '#73d33', an invalid colour addColorStop throws on -- so
      // withAlpha refuses any hex that is not 6-digit. That guard alone would
      // silently drop the transparency, leaving translucent overlays opaque, so
      // what has to be asserted is that 8-digit colours still come out.
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (name: string) => (name === '--accent' ? '#73d' : '#0fa'),
      } as unknown as CSSStyleDeclaration)

      // The placeholder pass is the one that tints the accent, so this runs on
      // a fresh waveform with no data rather than a loaded one.
      build()

      const colors = drawColors(draws)
      // Raw theme values are passed straight through in places (shadowColor, the
      // opaque gradient stops), so a 3-digit hex is legal in the output -- it is
      // only invalid once an alpha byte is appended. Every hex must be a length
      // CSS actually accepts.
      for (const c of colors) {
        if (c.startsWith('#')) expect([4, 7, 9], `bad hex length in ${c}`).toContain(c.length)
      }
      // And the translucent overlay must still be translucent: expanded to six
      // digits, then given its alpha byte.
      expect(colors.some((c) => c.toLowerCase() === '#7733dd44')).toBe(true)
    })

    it('tints unplayed bars from the accent rather than a fixed grey', () => {
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (name: string) => (name === '--accent' ? '#ff0000' : '#00d4aa'),
      } as unknown as CSSStyleDeclaration)

      const { wf } = build()
      draws.length = 0
      wf.setData(peaks())

      const styles = draws.filter((c) => c.method === 'set:fillStyle').map((c) => c.args[0])
      // A red accent must pull the base bar colour red-ward of the #252538 base:
      // 12% of the way from 0x25 to 0xff on red, and toward 0 on green/blue.
      expect(styles).toContain('rgb(63,33,49)')
    })
  })

  describe('resize', () => {
    it('sizes the backing store to device pixels', () => {
      const { canvas } = build({ dpr: 2 })
      // A canvas sized in CSS pixels on a retina display renders soft; the
      // backing store has to be scaled up and the context scaled to match.
      expect(canvas.width).toBe(W * 2)
      expect(canvas.height).toBe(H * 2)
      expect(draws.some((c) => c.method === 'scale' && c.args[0] === 2)).toBe(true)
    })

    it('redraws when the window resizes', () => {
      build()
      draws.length = 0
      window.dispatchEvent(new Event('resize'))
      expect(draws.length).toBeGreaterThan(0)
    })

    it('keeps bar geometry in CSS pixels regardless of DPR', () => {
      // The context is pre-scaled, so draw coordinates must stay in CSS px --
      // multiplying them by DPR as well would draw at 4x on a retina screen.
      const { wf } = build({ dpr: 2 })
      wf.setData(peaks(8))
      draws.length = 0
      wf.redraw()

      for (const r of fills(draws)) {
        expect(r.args[0] as number).toBeLessThanOrEqual(W)
      }
    })
  })
})
