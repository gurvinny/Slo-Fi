// Author: gurvinny
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PresetController } from '../../src/ui/PresetController'
import { PRESETS } from '../../src/presets'
import { mountFixture, resetDom } from '../helpers/dom'

// The controller reaches for exactly two AudioEngine methods, so a two-method
// fake is the whole dependency. Matching the real signatures at
// AudioEngine.ts:186 (applyPreset) and :541 (getParams).
function fakeEngine() {
  const applied: unknown[] = []
  const current = { playbackRate: 1.11, reverbMix: 0.33 }
  return {
    applied,
    current,
    applyPreset: (p: unknown) => { applied.push(p) },
    getParams: () => current,
  }
}

const cards = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.preset-card'))
const card = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.preset-card[data-preset="${id}"]`)!

// The handler reads e.clientX/clientY for the ripple origin, so a bare
// .click() would hand it undefined coordinates.
function clickCard(btn: HTMLButtonElement, x = 40, y = 12): void {
  btn.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
}

function build() {
  // querySelectorAll is snapshotted in the constructor, so the strip has to be
  // mounted first -- constructing against an empty document wires nothing and
  // every later assertion would pass vacuously.
  mountFixture('.preset-strip')
  const engine = fakeEngine()
  return { engine, controller: new PresetController(engine as never) }
}

describe('PresetController', () => {
  afterEach(() => { resetDom(); vi.restoreAllMocks() })

  it('wires every card in the shipping preset strip', () => {
    build()
    // Guards against the strip growing a card that nobody connected: five in
    // index.html, four real presets plus custom.
    expect(cards()).toHaveLength(PRESETS.length + 1)
  })

  it.each(PRESETS.map((p) => p.id))('applies the %s preset to the engine', (id) => {
    const { engine } = build()
    clickCard(card(id))

    const preset = PRESETS.find((p) => p.id === id)!
    expect(engine.applied).toEqual([preset.params])
  })

  it('passes the same params object to the engine and the callback', () => {
    const { engine, controller } = build()
    const seen: unknown[] = []
    controller.onPresetApplied = (p) => seen.push(p)

    clickCard(card('lofi'))

    // Not just equal -- identical. App.ts syncs its sliders from this object, and
    // a divergent copy is how the UI and the audio graph drift apart.
    expect(seen[0]).toBe(engine.applied[0])
  })

  it('forwards the theme and visual a preset declares', () => {
    const { controller } = build()
    const themes: string[] = []
    const visuals: unknown[] = []
    controller.onThemeApplied = (t) => themes.push(t)
    controller.onVisualApplied = (v) => visuals.push(v)

    clickCard(card('vaporwave'))

    const preset = PRESETS.find((p) => p.id === 'vaporwave')!
    expect(themes).toEqual([preset.theme])
    expect(visuals).toEqual([preset.visual])
  })

  it('reads live params for Custom instead of applying a preset', () => {
    const { engine, controller } = build()
    const seen: unknown[] = []
    const themes: string[] = []
    controller.onPresetApplied = (p) => seen.push(p)
    controller.onThemeApplied = (t) => themes.push(t)

    clickCard(card('custom'))

    expect(engine.applied).toEqual([])
    expect(seen[0]).toBe(engine.current)
    // Custom short-circuits before the theme/visual dispatch, so selecting it
    // must leave whatever look the user already has alone.
    expect(themes).toEqual([])
  })

  it('keeps exactly one card active as the selection moves', () => {
    build()
    clickCard(card('lofi'))
    expect(card('lofi').classList.contains('preset-card--active')).toBe(true)

    clickCard(card('ambient'))
    const active = cards().filter((b) => b.classList.contains('preset-card--active'))
    expect(active.map((b) => b.dataset.preset)).toEqual(['ambient'])
  })

  it('clears the selection when a slider is moved by hand', () => {
    const { controller } = build()
    clickCard(card('hyperpop'))
    controller.clearActive()

    expect(cards().some((b) => b.classList.contains('preset-card--active'))).toBe(false)
  })

  it('ignores a card with no data-preset without throwing', () => {
    mountFixture('.preset-strip')
    const stray = document.createElement('button')
    stray.className = 'preset-card'
    document.querySelector('.preset-strip')!.appendChild(stray)

    const engine = fakeEngine()
    new PresetController(engine as never)
    expect(() => clickCard(stray)).not.toThrow()
    expect(engine.applied).toEqual([])
  })

  it('spawns a ripple positioned from the click', () => {
    build()
    clickCard(card('lofi'), 40, 12)

    const ripple = card('lofi').querySelector<HTMLElement>('.ink-ripple')
    expect(ripple).not.toBeNull()
    // jsdom returns an all-zero bounding rect, so size is 0 and the offsets are
    // just the negated click coordinates. Asserting the arithmetic ran, not a
    // layout that jsdom cannot produce.
    expect(ripple!.style.left).toBe('40px')
    expect(ripple!.style.top).toBe('12px')
  })
})
