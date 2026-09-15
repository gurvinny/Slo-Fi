// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EffectsController } from '../../src/ui/EffectsController'
import {
  mountFixture, resetDom, recordCanvas2D, stubResizeObserver, stubBoundingRect,
  drawSequence, type Ctx2DCall,
} from '../helpers/dom'

// Every engine method the controller reaches for, recording rather than acting.
// The DSP behind these is already covered by the browser suite; what is under
// test here is that a control movement reaches the right setter with the right
// value in the right unit.
function fakeEngine() {
  const calls: { fn: string; args: unknown[] }[] = []
  const rec = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }) }
  return {
    calls,
    // getEQNodes returning undefined sends _drawEQCurve down its flat-curve
    // fallback, which is the honest state before any audio is loaded.
    effectsChain: null as null | { getEQNodes(): unknown[] },
    analyserNode: null,
    analyserPreEQ: null,
    setEQ: rec('setEQ'),
    setEQFreq: rec('setEQFreq'),
    setEQQ: rec('setEQQ'),
    setEQSlope: rec('setEQSlope'),
    setChorusRate: rec('setChorusRate'),
    setChorusDepth: rec('setChorusDepth'),
    setSaturationDrive: rec('setSaturationDrive'),
    setAbyssDepth: rec('setAbyssDepth'),
    setAbyssResonance: rec('setAbyssResonance'),
    setHzFrequency: rec('setHzFrequency'),
    set8DEnabled: rec('set8DEnabled'),
    set8DSpeed: rec('set8DSpeed'),
  }
}

type Engine = ReturnType<typeof fakeEngine>

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const slider = (id: string) => el<HTMLInputElement>(id)
const canvas = () => el<HTMLCanvasElement>('eqCurveCanvas')

// The canvas is 600x200 CSS px in these tests so the log-frequency and dB maps
// have a real box to work against; jsdom's zero rect makes the draw path bail.
const W = 600
const H = 200

let draws: Ctx2DCall[]
let engine: Engine
let frames: FrameRequestCallback[]

/**
 * Run the queued animation frames.
 *
 * A synchronous requestAnimationFrame stub cannot be used here:
 * _scheduleCurveDraw guards on `if (this._curveRafId !== null) return` and
 * assigns the handle *after* the call returns, so a callback that runs inline
 * nulls the handle first and then has 1 written back over it -- leaving the
 * guard permanently latched and every later draw skipped. Queueing keeps the
 * real ordering.
 */
function flushFrames(): void {
  const queued = frames.splice(0)
  for (const cb of queued) cb(0)
}

function build() {
  mountFixture('#soundTab-effects')
  draws = recordCanvas2D()
  stubResizeObserver()
  engine = fakeEngine()
  const controller = new EffectsController(engine as never)
  stubBoundingRect(canvas(), { width: W, height: H })
  return controller
}

/** Move a range input the way a user does: set value, then fire `input`. */
function move(id: string, value: number | string): void {
  const s = slider(id)
  s.value = String(value)
  s.dispatchEvent(new Event('input', { bubbles: true }))
}

function argsFor(fn: string): unknown[][] {
  return engine.calls.filter((c) => c.fn === fn).map((c) => c.args)
}

// Reach the private coordinate maps. They are the arithmetic every pointer
// interaction depends on, and testing them through a drag would only prove the
// composition, not the mapping.
type Internals = {
  _xToFreq(x: number, w: number): number
  _freqToX(hz: number, w: number): number
  _dbToY(db: number, h: number): number
  _eqNodeState: { db: number; freq: number; q: number; slope: number }[]
  EQ_BANDS: { band: string; freqMin: number; freqMax: number; isShelf: boolean }[]
  _eqTooltip: HTMLElement | null
}
const inner = (c: EffectsController) => c as unknown as Internals

function pointer(type: string, x: number, y: number, id = 1): void {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event &
    { clientX: number; clientY: number; pointerId: number }
  Object.assign(e, { clientX: x, clientY: y, pointerId: id })
  canvas().dispatchEvent(e)
}

describe('EffectsController', () => {
  beforeEach(() => {
    // setPointerCapture is not implemented in jsdom, and a drag calls it first.
    HTMLElement.prototype.setPointerCapture = () => {}
    HTMLElement.prototype.releasePointerCapture = () => {}
    frames = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb); return frames.length
    })
  })
  afterEach(() => { resetDom(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  describe('EQ sliders', () => {
    it.each([
      ['eqLowSlider', 'low', 6],
      ['eqLowMidSlider', 'lowMid', -3],
      ['eqMidSlider', 'mid', 0],
      ['eqHighMidSlider', 'highMid', 4.5],
      ['eqHighSlider', 'high', -12],
    ])('%s sends %s to the engine in dB', (id, band, db) => {
      build()
      move(id, db)
      expect(argsFor('setEQ')).toEqual([[band, db]])
    })

    it.each([
      [6, '+6 dB'],
      [0, '0 dB'],
      [-3.5, '-3.5 dB'],
    ])('badges %s dB as "%s"', (db, text) => {
      build()
      move('eqLowSlider', db)
      // The leading + is only added for boosts; 0 and cuts read as-is.
      expect(el('eqLowValue').textContent).toBe(text)
    })

    it('notifies App.ts so the active preset can be cleared', () => {
      const controller = build()
      let changed = 0
      controller.onChanged = () => { changed++ }
      move('eqMidSlider', 2)
      expect(changed).toBe(1)
    })
  })

  describe('chorus, saturation and abyss', () => {
    it('sends the chorus rate in Hz, unscaled', () => {
      build()
      move('chorusRateSlider', 2.5)
      expect(argsFor('setChorusRate')).toEqual([[2.5]])
      expect(el('chorusRateValue').textContent).toBe('2.5 Hz')
    })

    it.each([
      ['chorusDepthSlider', 'setChorusDepth', 'chorusDepthValue', 40, 0.4],
      ['satDriveSlider', 'setSaturationDrive', 'satDriveValue', 75, 0.75],
      ['abyssDepthSlider', 'setAbyssDepth', 'abyssDepthValue', 60, 0.6],
      ['abyssResonanceSlider', 'setAbyssResonance', 'abyssResonanceValue', 25, 0.25],
    ])('%s reads a percent and sends a 0-1 fraction', (id, fn, badge, pct, expected) => {
      build()
      move(id, pct)
      // The slider is in percent and the engine takes a fraction. Getting this
      // conversion wrong is inaudible at small values and wildly wrong at large.
      expect(argsFor(fn)).toEqual([[expected]])
      expect(el(badge).textContent).toBe(`${pct}%`)
    })
  })

  describe('8D toggle', () => {
    function enable() {
      const toggle = el<HTMLInputElement>('eightDToggle')
      toggle.checked = true
      toggle.dispatchEvent(new Event('change', { bubbles: true }))
    }

    it('enables the effect and reveals its speed control', () => {
      build()
      enable()

      expect(argsFor('set8DEnabled')).toEqual([[true]])
      expect(el('eightDSpeedRow').style.display).toBe('')
      expect(el('eightDSpeedSlider').style.display).toBe('')
      expect(el('eightDSpeedTicks').style.display).toBe('')
      // The headphones hint is the inverse: it only makes sense while off.
      expect(el('eightDHint').style.display).toBe('none')
    })

    it('hides the speed control again when switched off', () => {
      build()
      enable()
      const toggle = el<HTMLInputElement>('eightDToggle')
      toggle.checked = false
      toggle.dispatchEvent(new Event('change', { bubbles: true }))

      expect(argsFor('set8DEnabled')).toEqual([[true], [false]])
      expect(el('eightDSpeedRow').style.display).toBe('none')
      expect(el('eightDHint').style.display).toBe('')
    })

    it('reports the enabled state and speed together, so the orb can follow', () => {
      const controller = build()
      const seen: [boolean, number][] = []
      controller.on8DChange = (enabled, speed) => { seen.push([enabled, speed]) }

      slider('eightDSpeedSlider').value = '15'
      enable()

      // The slider is in tenths of a Hz, so 15 means 1.5 Hz.
      expect(seen).toEqual([[true, 1.5]])
    })

    it('sends a speed change in Hz while staying enabled', () => {
      const controller = build()
      const seen: [boolean, number][] = []
      enable()
      controller.on8DChange = (enabled, speed) => { seen.push([enabled, speed]) }

      move('eightDSpeedSlider', 8)

      expect(argsFor('set8DSpeed')).toEqual([[0.8]])
      expect(el('eightDSpeedValue').textContent).toBe('0.8 Hz')
      expect(seen).toEqual([[true, 0.8]])
    })
  })

  describe('solfeggio frequency buttons', () => {
    const hzBtn = (hz: string) =>
      document.querySelector<HTMLButtonElement>(`.btn-hz[data-hz="${hz}"]`)!

    it('keeps exactly one frequency selected', () => {
      build()
      hzBtn('432').click()
      hzBtn('528').click()

      const active = Array.from(document.querySelectorAll('.btn-hz'))
        .filter((b) => b.classList.contains('btn-hz--active'))
      expect(active.map((b) => (b as HTMLElement).dataset.hz)).toEqual(['528'])
    })

    it('mirrors the selection into aria-pressed for screen readers', () => {
      build()
      hzBtn('639').click()
      expect(hzBtn('639').getAttribute('aria-pressed')).toBe('true')
      expect(hzBtn('432').getAttribute('aria-pressed')).toBe('false')
    })

    it('sends the frequency as a number', () => {
      build()
      hzBtn('741').click()
      expect(argsFor('setHzFrequency')).toEqual([[741]])
      expect(el('hzValue').textContent).toBe('741 Hz')
    })

    it('sends null for Off rather than a zero that would retune the track', () => {
      build()
      hzBtn('432').click()
      hzBtn('off').click()
      expect(argsFor('setHzFrequency')).toEqual([[432], [null]])
      expect(el('hzValue').textContent).toBe('Off')
    })

    it('labels the selected frequency with its description', () => {
      build()
      hzBtn('528').click()
      expect(el('hzHint').textContent).not.toBe('')
    })
  })

  describe('frequency and gain mapping', () => {
    it('round-trips a frequency through the log axis', () => {
      const c = build()
      for (const hz of [20, 100, 440, 2000, 20000]) {
        const x = inner(c)._freqToX(hz, W)
        expect(inner(c)._xToFreq(x, W)).toBeCloseTo(hz, 3)
      }
    })

    it('spans 20 Hz to 20 kHz across the full width', () => {
      const c = build()
      // The axis is decades of a log sweep, so the endpoints are the contract:
      // 20 Hz at x=0 and 20 kHz at x=W, with 632 Hz landing mid-canvas.
      expect(inner(c)._freqToX(20, W)).toBeCloseTo(0, 6)
      expect(inner(c)._freqToX(20000, W)).toBeCloseTo(W, 6)
      expect(inner(c)._xToFreq(W / 2, W)).toBeCloseTo(632.46, 1)
    })

    it('puts 0 dB on the centre line and boosts above it', () => {
      const c = build()
      expect(inner(c)._dbToY(0, H)).toBeCloseTo(H / 2, 6)
      // Canvas Y grows downward, so a boost must produce a smaller Y.
      expect(inner(c)._dbToY(12, H)).toBeLessThan(H / 2)
      expect(inner(c)._dbToY(-12, H)).toBeGreaterThan(H / 2)
    })

    it('keeps the ±12 dB clamp inside the ±15 dB axis', () => {
      const c = build()
      // The visual range is wider than the allowed range on purpose, so a
      // maxed-out band still has headroom drawn above it.
      expect(inner(c)._dbToY(12, H)).toBeGreaterThan(inner(c)._dbToY(15, H))
      expect(inner(c)._dbToY(15, H)).toBeGreaterThan(0)
    })
  })

  describe('dragging an EQ node', () => {
    /** Screen coordinates of a band's node, given the stubbed canvas box. */
    function nodeAt(c: EffectsController, idx: number) {
      const s = inner(c)._eqNodeState[idx]
      return { x: inner(c)._freqToX(s.freq, W), y: inner(c)._dbToY(s.db, H) }
    }

    it('ignores a press that misses every node', () => {
      build()
      // Bottom-left corner: far from any node at 0 dB on the centre line.
      pointer('pointerdown', 2, H - 2)
      expect(canvas().classList.contains('eq-dragging')).toBe(false)
    })

    it('starts a drag when a node is grabbed', () => {
      const c = build()
      const p = nodeAt(c, 2)
      pointer('pointerdown', p.x, p.y)

      expect(canvas().classList.contains('eq-dragging')).toBe(true)
      expect(inner(c)._eqTooltip!.classList.contains('eq-tooltip--visible')).toBe(true)
    })

    it('converts a vertical drag into a gain change and back into the slider', () => {
      const c = build()
      const p = nodeAt(c, 0)
      pointer('pointerdown', p.x, p.y)

      // Upward by a quarter of the gain half-range: H*0.45/15 px per dB.
      const pxPerDb = (H * 0.45) / 15
      pointer('pointermove', p.x, p.y - pxPerDb * 4)

      const [band, db] = argsFor('setEQ').at(-1)!
      expect(band).toBe('low')
      expect(db as number).toBeCloseTo(4, 5)
      // The slider and badge follow the node, or the two controls disagree
      // about the same band.
      expect(parseFloat(slider('eqLowSlider').value)).toBeCloseTo(4, 1)
      expect(el('eqLowValue').textContent).toBe('+4 dB')
    })

    it('clamps a drag past the top to +12 dB', () => {
      const c = build()
      const p = nodeAt(c, 0)
      pointer('pointerdown', p.x, p.y)
      pointer('pointermove', p.x, p.y - 10_000)

      expect(argsFor('setEQ').at(-1)![1]).toBe(12)
    })

    it('clamps a drag past the bottom to -12 dB', () => {
      const c = build()
      const p = nodeAt(c, 0)
      pointer('pointerdown', p.x, p.y)
      pointer('pointermove', p.x, p.y + 10_000)

      expect(argsFor('setEQ').at(-1)![1]).toBe(-12)
    })

    it('keeps a horizontal drag inside the band\'s own frequency range', () => {
      const c = build()
      const meta = inner(c).EQ_BANDS[1]
      const p = nodeAt(c, 1)
      pointer('pointerdown', p.x, p.y)
      pointer('pointermove', p.x + 10_000, p.y)

      const hz = argsFor('setEQFreq').at(-1)![1] as number
      // Bands must not trade places: each one owns a slice of the spectrum.
      expect(hz).toBeLessThanOrEqual(meta.freqMax)
      expect(hz).toBeGreaterThanOrEqual(meta.freqMin)
      expect(hz).toBeCloseTo(meta.freqMax, 5)
    })

    it('ends the drag and hides the tooltip on release', () => {
      const c = build()
      const p = nodeAt(c, 2)
      pointer('pointerdown', p.x, p.y)
      pointer('pointerup', p.x, p.y)

      expect(canvas().classList.contains('eq-dragging')).toBe(false)
      expect(inner(c)._eqTooltip!.classList.contains('eq-tooltip--visible')).toBe(false)
      expect(canvas().style.cursor).toBe('crosshair')
    })

    it('abandons the drag on pointercancel, so a node cannot get stuck', () => {
      const c = build()
      const p = nodeAt(c, 2)
      pointer('pointerdown', p.x, p.y)
      canvas().dispatchEvent(new Event('pointercancel', { bubbles: true }))

      expect(canvas().classList.contains('eq-dragging')).toBe(false)
      engine.calls.length = 0
      pointer('pointermove', p.x, p.y - 50)
      expect(argsFor('setEQ')).toEqual([])
    })

    it('shows a grab cursor on hover and a crosshair off it', () => {
      const c = build()
      const p = nodeAt(c, 3)

      pointer('pointermove', p.x, p.y)
      expect(canvas().style.cursor).toBe('grab')

      pointer('pointermove', 2, H - 2)
      expect(canvas().style.cursor).toBe('crosshair')
      expect(inner(c)._eqTooltip!.classList.contains('eq-tooltip--visible')).toBe(false)
    })
  })

  describe('EQ slider disclosure', () => {
    const toggleBtn = () => document.querySelector<HTMLButtonElement>('.eq-sliders-btn')!
    const groups = () => Array.from(document.querySelectorAll('.eq-sliders-hidden'))

    it('starts with the sliders collapsed behind the curve', () => {
      build()
      expect(groups()).toHaveLength(5)
      expect(toggleBtn().getAttribute('aria-label')).toBe('Show EQ sliders')
    })

    it('reveals and re-hides the five band sliders', () => {
      build()
      toggleBtn().click()
      expect(groups()).toHaveLength(0)
      expect(toggleBtn().getAttribute('aria-label')).toBe('Hide EQ sliders')

      toggleBtn().click()
      expect(groups()).toHaveLength(5)
      expect(toggleBtn().getAttribute('aria-label')).toBe('Show EQ sliders')
    })
  })

  describe('syncToParams', () => {
    const params = {
      eq: { low: 3, lowMid: -1.5, mid: 0, highMid: 2, high: -5 },
      chorus: { rate: 1.4, depth: 0.35 },
      saturationDrive: 0.2,
      abyss: { depth: 0.8, resonance: 0.45 },
      hzFrequency: 528,
    }

    it('drives every slider and badge from a preset', () => {
      const c = build()
      c.syncToParams(params as never)

      expect(slider('eqLowSlider').value).toBe('3')
      expect(el('eqLowValue').textContent).toBe('+3 dB')
      expect(el('eqHighValue').textContent).toBe('-5 dB')
      expect(slider('chorusRateSlider').value).toBe('1.4')
      expect(el('chorusRateValue').textContent).toBe('1.4 Hz')
      expect(slider('chorusDepthSlider').value).toBe('35')
      expect(slider('satDriveSlider').value).toBe('20')
      expect(slider('abyssDepthSlider').value).toBe('80')
      expect(slider('abyssResonanceSlider').value).toBe('45')
    })

    it('selects the preset\'s solfeggio frequency', () => {
      const c = build()
      c.syncToParams(params as never)
      expect(el('hzValue').textContent).toBe('528 Hz')
      expect(document.querySelector('.btn-hz--active')!.getAttribute('data-hz')).toBe('528')
    })

    it('shows Off when a preset declares no frequency', () => {
      const c = build()
      c.syncToParams({ ...params, hzFrequency: null } as never)
      expect(el('hzValue').textContent).toBe('Off')
    })

    it('moves the curve nodes with the sliders', () => {
      const c = build()
      c.syncToParams(params as never)
      expect(inner(c)._eqNodeState.map((s) => s.db)).toEqual([3, -1.5, 0, 2, -5])
    })

    it('does not write back to the engine, since the preset already did', () => {
      const c = build()
      engine.calls.length = 0
      c.syncToParams(params as never)
      // syncToParams reflects state the engine already holds. Echoing it back
      // would double-apply every preset change.
      expect(engine.calls).toEqual([])
    })
  })

  describe('curve rendering', () => {
    it('draws a flat curve before any audio graph exists', () => {
      const c = build()
      draws.length = 0
      c.syncToParams({
        eq: { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 },
        chorus: { rate: 1, depth: 0 }, saturationDrive: 0,
        abyss: { depth: 0, resonance: 0 }, hzFrequency: null,
      } as never)
      flushFrames()

      // No pixels to assert in jsdom -- what is provable is that the draw path
      // ran and scaled to device pixels first. Whether it looks right is the
      // browser suite's job.
      expect(drawSequence(draws)).toContain('setTransform')
      expect(draws.length).toBeGreaterThan(0)
    })

    it('redraws when the container resizes from zero width', () => {
      const ro = stubResizeObserver()
      build()
      draws.length = 0
      ro.trigger()
      flushFrames()
      // The drawer opens with the canvas at 0px; without this the EQ curve
      // stays blank until something else happens to trigger a draw.
      expect(draws.length).toBeGreaterThan(0)
    })
  })
})
