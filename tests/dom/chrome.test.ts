// Author: gurvinny
//
// The panel bounds are only as good as these numbers. Each case here is a way
// the chrome really differs between layouts: the header vanishes below 600px,
// the dock only exists on desktop, and the player is display:none until a
// track loads.
import { describe, it, expect, beforeEach } from 'vitest'
import { measureChromeInsets, ChromeVars } from '../../src/ui/chrome'
import { stubBoundingRect } from '../helpers/dom'

function box(width: number, height: number, top = 0, left = 0): HTMLElement {
  const el = document.createElement('div')
  stubBoundingRect(el, { width, height, top, left })
  return el
}

describe('measureChromeInsets', () => {
  it('reads the top bound from the HUD bottom edge, not its height', () => {
    // Desktop: the HUD sits under a 46px header, so its bottom is 46 + 79.5.
    const hud = box(1440, 79.5, 46)
    expect(measureChromeInsets(hud, null, null, [], 900).top).toBe(126)
  })

  it('takes the bar height as the bottom bound when there is no dock', () => {
    const bar = box(390, 193, 844 - 193)
    const ins = measureChromeInsets(box(390, 169, 0), bar, null, [], 844)
    expect(ins.bar).toBe(193)
    expect(ins.bottom).toBe(193)
  })

  // A 768px window: the dock spans 204..564 and the right panel 438..748.
  it('raises the bottom bound to clear the dock when a panel shares its columns', () => {
    const bar = box(768, 178, 1024 - 178)
    const dock = box(360, 44, 1024 - 178 - 10 - 44, 204)
    const left = box(290, 600, 138, 20)
    const right = box(310, 600, 138, 438)
    const ins = measureChromeInsets(box(768, 80, 46), bar, dock, [left, right], 1024)
    expect(ins.bar).toBe(178)
    expect(ins.bottom).toBe(178 + 10 + 44)
  })

  // A 1440px window: the dock spans 540..900, the panels 20..310 and 1110..1420.
  it('leaves the dock out when it sits between the panels', () => {
    const bar = box(1440, 178, 900 - 178)
    const dock = box(360, 44, 900 - 178 - 10 - 44, 540)
    const left = box(290, 500, 138, 20)
    const right = box(310, 500, 138, 1110)
    expect(measureChromeInsets(box(1440, 80, 46), bar, dock, [left, right], 900).bottom).toBe(178)
  })

  it('ignores a hidden dock instead of reading its zero rect as a box at the origin', () => {
    // A display:none dock reports top 0. Read naively that is a dock reaching
    // the full viewport height, which would collapse every panel to nothing.
    const bar = box(390, 193, 651)
    const hidden = box(0, 0, 0)
    const sheet = box(390, 400, 177)
    expect(measureChromeInsets(box(390, 169), bar, hidden, [sheet], 844).bottom).toBe(193)
  })

  it('reports zero for chrome that is not laid out', () => {
    expect(measureChromeInsets(box(0, 0), box(0, 0), null, [], 900)).toEqual({ top: 0, bar: 0, bottom: 0 })
  })
})

describe('ChromeVars', () => {
  let root: HTMLElement
  let writes: string[]

  beforeEach(() => {
    root = document.createElement('div')
    writes = []
    const set = root.style.setProperty.bind(root.style)
    root.style.setProperty = (name: string, value: string | null) => {
      writes.push(`${name}=${value}`)
      set(name, value)
    }
  })

  it('publishes all three bounds as px custom properties', () => {
    new ChromeVars(root).apply({ top: 126, bar: 178, bottom: 232 })
    expect(root.style.getPropertyValue('--chrome-top')).toBe('126px')
    expect(root.style.getPropertyValue('--bottombar-h')).toBe('178px')
    expect(root.style.getPropertyValue('--chrome-bottom')).toBe('232px')
  })

  it('writes nothing when a measurement repeats', () => {
    // Every :root write repaints each backdrop-filter layer.
    const vars = new ChromeVars(root)
    vars.apply({ top: 126, bar: 178, bottom: 232 })
    writes.length = 0
    expect(vars.apply({ top: 126, bar: 178, bottom: 232 })).toBe(0)
    expect(writes).toEqual([])
  })

  it('rewrites only the value that changed', () => {
    const vars = new ChromeVars(root)
    vars.apply({ top: 126, bar: 178, bottom: 232 })
    writes.length = 0
    vars.apply({ top: 126, bar: 178, bottom: 250 })
    expect(writes).toEqual(['--chrome-bottom=250px'])
  })

  it('leaves the stylesheet fallback alone while the chrome is unmeasured', () => {
    new ChromeVars(root).apply({ top: 0, bar: 0, bottom: 0 })
    expect(writes).toEqual([])
  })
})
