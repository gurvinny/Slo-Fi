// Author: gurvinny
//
// Layer 5: App.ts through the real page.
//
// App owns no seams -- it reaches ~60 element ids in class-field initializers
// and wires everything in its constructor -- so the only honest way to test it
// is to mount the shipping index.html and drive the DOM the way a user does.
// The fixture is `body`: a hand-written slice would rot the first time an id is
// renamed, and the whole point of this layer is to notice that.
//
// Scope boundary is AudioEngine.ensureContext(). Only loadFile() and play()
// reach it; every other engine setter guards on `this.context` and no-ops, so
// the entire constructor path and all the UI wiring below run in jsdom with no
// Web Audio at all. Anything crossing loadFile()/play() belongs to the browser
// suite, not here.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { App } from '../../src/ui/App'
import { DEFAULTS } from '../../src/config/defaults'
import {
  mountFixture, resetDom, recordCanvas2D, stubMatchMedia, stubResizeObserver,
  stubUserAgent, stubBoundingRect, type Ctx2DCall,
} from '../helpers/dom'

// ── The private seam ────────────────────────────────────────────────────────
// Playlist state only ever arrives through loadFile(), which is out of scope,
// so these tests seed the array and call the real render. Everything after
// that -- every click, drag and key -- goes through the page. `private` in
// TypeScript is a compile-time marker, not a runtime one; reaching past it
// here is the workaround for App having no constructor injection.
type TrackMeta = { duration: number; key: string; bpm: number }
type Internals = {
  playlist: File[]
  currentTrackIndex: number
  _trackMeta: Map<number, TrackMeta>
  renderPlaylist(): void
  openTrackMenu(index: number, li: HTMLElement): void
  closeTrackMenu(): void
  starOverlay: { destroy(): void }
}
const inner = (app: App) => app as unknown as Internals

const SETTINGS_KEY = 'slofi-settings'
const LITE_KEY = 'slofi-lite-visual'

const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36'
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const slider = (id: string) => el<HTMLInputElement>(id)
const toggle = (id: string) => el<HTMLInputElement>(id)
const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel) as T
const qa = <T extends HTMLElement>(sel: string) => Array.from(document.querySelectorAll<T>(sel))

function click(target: Element): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

function key(k: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}

function audioFile(name: string): File {
  return new File(['data'], name, { type: 'audio/mpeg' })
}

// ── requestAnimationFrame ───────────────────────────────────────────────────
// A queue, not a synchronous passthrough: StarOverlay's loop re-arms itself on
// every frame, so running callbacks inline would recurse forever. cancel
// actually removes the entry, which is what makes "the Lite loop stopped"
// observable -- otherwise stopLiteLoop() has no effect anything can read.
let frames: Map<number, FrameRequestCallback>
let nextFrameId: number

function installRaf(): void {
  frames = new Map()
  nextFrameId = 1
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextFrameId++
    frames.set(id, cb)
    return id
  }) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = ((id: number) => { frames.delete(id) }) as typeof window.cancelAnimationFrame
}

/** Run whatever is queued now; callbacks queued by those callbacks wait. */
function flushFrames(): void {
  const queued = [...frames.entries()]
  for (const [id, cb] of queued) {
    frames.delete(id)
    cb(performance.now())
  }
}

// jsdom implements <dialog> without showModal/close, so the help modal throws
// the moment anything opens it. Counting calls is enough here: whether a
// modal actually renders is the browser suite's business.
//
// Each stub closes over its own counter rather than the module-level binding.
// App wires its keyboard shortcuts to `document`, which outlives every test in
// the file, so the apps built by earlier tests still handle '?' -- with a
// shared counter their stale handlers reported as this test's clicks (53 of
// them). Their own elements are detached by then, so the scoped counter is
// what keeps the attribution honest.
let dialogCalls: { open: number; close: number }

function stubDialog(): void {
  const d = el<HTMLDialogElement>('help-modal')
  const calls = { open: 0, close: 0 }
  dialogCalls = calls
  d.showModal = () => { calls.open++; d.setAttribute('open', '') }
  d.close = () => { calls.close++; d.removeAttribute('open') }
}

type BatteryStub = { bat: { level: number; charging: boolean }; fire(): void }
let batteryListeners: (() => void)[] = []

function stubBattery(level: number, charging: boolean): BatteryStub {
  const bat = { level, charging, addEventListener: (_t: string, fn: () => void) => { batteryListeners.push(fn) } }
  Object.defineProperty(navigator, 'getBattery', {
    configurable: true, writable: true, value: () => Promise.resolve(bat),
  })
  return { bat, fire: () => { for (const fn of [...batteryListeners]) fn() } }
}

/** navigator properties jsdom does not implement survive between tests. */
function removeBattery(): void {
  batteryListeners = []
  delete (navigator as Navigator & { getBattery?: unknown }).getBattery
}

/** Let the Battery promise chain settle without leaning on a timer. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

type BuildOpts = {
  mobile?: boolean
  settings?: Record<string, unknown>
  settingsRaw?: string
  lite?: boolean
}

let app: App
let draws: Ctx2DCall[]

function build(opts: BuildOpts = {}): App {
  resetDom()
  // resetDom clears class and style but not data-theme, and applyDefaults
  // writes one on every construction -- left behind it makes the next test's
  // theme assertions pass against the previous test's value.
  delete document.documentElement.dataset.theme

  stubMatchMedia()
  stubResizeObserver()
  draws = recordCanvas2D()
  installRaf()

  if (opts.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(opts.settings))
  if (opts.settingsRaw !== undefined) localStorage.setItem(SETTINGS_KEY, opts.settingsRaw)
  if (opts.lite) localStorage.setItem(LITE_KEY, '1')

  mountFixture('body')
  stubDialog()
  // jsdom reports an all-zero rect, and updateBottomBarHeight only publishes a
  // height above zero -- without a box it looks like the feature is missing.
  stubBoundingRect(q('.player-bottom'), { width: 390, height: 120 })
  // _isMobile is a field initializer, so the UA has to be in place before new.
  stubUserAgent(opts.mobile ? IPHONE_UA : DESKTOP_UA)

  app = new App()
  return app
}

/** Seed playlist state and render it through the real method. */
function seedPlaylist(names: string[], current = -1, meta?: Map<number, TrackMeta>): void {
  const i = inner(app)
  i.playlist = names.map(audioFile)
  i.currentTrackIndex = current
  if (meta) i._trackMeta = meta
  i.renderPlaylist()
}

const items = () => qa<HTMLElement>('.playlist-item')
const names = () => items().map((li) => li.querySelector('.playlist-item-name')?.textContent ?? '')

afterEach(() => {
  // StarOverlay starts an unbounded rAF loop in its constructor and can leave
  // a 15fps setInterval behind; the track menu parks capture listeners on
  // document, which survives every test in the file.
  inner(app).closeTrackMenu()
  inner(app).starOverlay.destroy()
  removeBattery()
  vi.useRealTimers()
  resetDom()
  delete document.documentElement.dataset.theme
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — defaults on a first visit', () => {
  beforeEach(() => { build() })

  it('applies every defaults.ts audio value to slider, label and aria', () => {
    expect(slider('speedSlider').value).toBe(String(Math.round(DEFAULTS.speed * 100)))
    expect(el('speedValue').textContent).toBe('1.00x')
    expect(slider('speedSlider').getAttribute('aria-valuetext')).toBe('1.00x')

    expect(slider('pitchSlider').value).toBe('0')
    expect(el('pitchValue').textContent).toBe('0 st')
    expect(slider('pitchSlider').getAttribute('aria-valuetext')).toBe('0 semitones')

    expect(slider('reverbSlider').value).toBe('20')
    expect(el('reverbValue').textContent).toBe('20%')
    expect(slider('reverbSlider').getAttribute('aria-valuetext')).toBe('20%')

    expect(slider('decaySlider').value).toBe('25')
    expect(el('decayValue').textContent).toBe('2.5s')
    expect(slider('decaySlider').getAttribute('aria-valuetext')).toBe('2.5 seconds')

    expect(slider('preDelaySlider').value).toBe('5')
    expect(el('preDelayValue').textContent).toBe('5 ms')
    expect(slider('preDelaySlider').getAttribute('aria-valuetext')).toBe('5 milliseconds')

    expect(slider('dampingSlider').value).toBe('35')
    expect(el('dampingValue').textContent).toBe('35%')
    expect(slider('dampingSlider').getAttribute('aria-valuetext')).toBe('35%')

    expect(slider('volumeSlider').value).toBe('80')
    expect(el('volumeValue').textContent).toBe('80%')
    expect(slider('volumeSlider').getAttribute('aria-valuetext')).toBe('80%')
  })

  it('applies the default reverb type to the button group', () => {
    const active = qa<HTMLButtonElement>('.btn-reverb-type')
      .filter((b) => b.classList.contains('btn-reverb-type--active'))
    expect(active).toHaveLength(1)
    expect(active[0].dataset.reverbType).toBe(DEFAULTS.reverbType)
    expect(active[0].getAttribute('aria-pressed')).toBe('true')
    expect(el('reverbTypeValue').textContent).toBe(active[0].textContent)
  })

  it('applies every defaults.ts visual value', () => {
    expect(slider('orbReactivitySlider').value).toBe('80')
    expect(el('orbReactivityValue').textContent).toBe('80%')
    expect(slider('orbGlowSlider').value).toBe('100')
    expect(el('orbGlowValue').textContent).toBe('100%')
    expect(slider('orbSizeSlider').value).toBe('100')
    expect(el('orbSizeValue').textContent).toBe('100%')
    expect(slider('rotationSpeedSlider').value).toBe('100')
    expect(el('rotationSpeedValue').textContent).toBe('1.0×')
    expect(slider('particleCountSlider').value).toBe('500')
    expect(el('particleCountValue').textContent).toBe('500')
    expect(slider('starsSlider').value).toBe('70')
    expect(el('starsValue').textContent).toBe('70%')

    expect(toggle('wireframeToggle').checked).toBe(DEFAULTS.wireframe)
    expect(toggle('bassPulseToggle').checked).toBe(DEFAULTS.bassPulse)
    expect(toggle('lightningToggle').checked).toBe(DEFAULTS.lightning)
    expect(toggle('crackToggle').checked).toBe(DEFAULTS.crack)
    expect(toggle('crystalToggle').checked).toBe(DEFAULTS.crystal)
    expect(toggle('glitchToggle').checked).toBe(DEFAULTS.glitch)
  })

  it('applies the default colour theme to the document and the chip row', () => {
    expect(document.documentElement.dataset.theme).toBe(DEFAULTS.colorTheme)
    const active = qa('.theme-chip').filter((c) => c.classList.contains('theme-chip--active'))
    expect(active).toHaveLength(1)
    expect((active[0] as HTMLElement).dataset.theme).toBe(DEFAULTS.colorTheme)
  })

  it('publishes the live bottom-bar height for the mobile sheets', () => {
    expect(document.documentElement.style.getPropertyValue('--bottombar-h')).toBe('120px')
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — saved settings', () => {
  it('restores saved values over the defaults', () => {
    build({
      settings: {
        theme: 'ember', speed: '150', pitch: '-3', volume: '40', damping: '10',
        stars: '10', rotationSpeed: '150', glitch: true, wireframe: false,
      },
    })

    expect(document.documentElement.dataset.theme).toBe('ember')
    expect(slider('speedSlider').value).toBe('150')
    expect(el('speedValue').textContent).toBe('1.50x')
    expect(slider('pitchSlider').value).toBe('-3')
    expect(el('pitchValue').textContent).toBe('-3 st')
    expect(slider('volumeSlider').value).toBe('40')
    expect(el('volumeValue').textContent).toBe('40%')
    expect(el('dampingValue').textContent).toBe('10%')
    expect(el('starsValue').textContent).toBe('10%')
    expect(el('rotationSpeedValue').textContent).toBe('1.5×')
    expect(toggle('glitchToggle').checked).toBe(true)
    expect(toggle('wireframeToggle').checked).toBe(false)
  })

  it('keeps the defaults when the stored blob is not JSON', () => {
    build({ settingsRaw: '{not json' })
    expect(el('speedValue').textContent).toBe('1.00x')
    expect(document.documentElement.dataset.theme).toBe(DEFAULTS.colorTheme)
  })

  it('ignores a stored value of the wrong type instead of writing NaN', () => {
    build({ settings: { speed: 42, volume: null, glitch: 'yes' } })
    expect(slider('speedSlider').value).toBe('100')
    expect(slider('volumeSlider').value).toBe('80')
    // 'yes' is not a boolean, so the default survives
    expect(toggle('glitchToggle').checked).toBe(DEFAULTS.glitch)
  })

  it('persists a theme change back to storage', () => {
    build()
    click(q('.theme-chip[data-theme="void"]'))
    expect(document.documentElement.dataset.theme).toBe('void')
    expect(q('.theme-chip[data-theme="void"]').classList.contains('theme-chip--active')).toBe(true)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).theme).toBe('void')
  })

  it('stores prism as the absence of a theme attribute', () => {
    build()
    click(q('.theme-chip[data-theme="prism"]'))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).theme).toBe('prism')
  })

  it('redraws the waveform a frame after the theme changes', () => {
    build()
    // draw() reads the CSS custom properties fresh, so the redraw is what makes
    // a theme switch visible on the waveform at all. A real canvas width is
    // what separates it from StarOverlay's own 0x0 frame in the same flush.
    const wf = el<HTMLCanvasElement>('waveform')
    wf.width = 600
    wf.height = 120
    draws.length = 0

    const before = frames.size
    click(q('.theme-chip[data-theme="neon"]'))
    expect(frames.size).toBe(before + 1)

    flushFrames()
    expect(draws.some((c) => c.method === 'clearRect' && c.args[2] === 600)).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — playlist rendering', () => {
  beforeEach(() => { build() })

  it('counts tracks with the right plural', () => {
    seedPlaylist([])
    expect(el('playlistCount').textContent).toBe('0 tracks')
    seedPlaylist(['one.mp3'])
    expect(el('playlistCount').textContent).toBe('1 track')
    seedPlaylist(['one.mp3', 'two.mp3', 'three.mp3'])
    expect(el('playlistCount').textContent).toBe('3 tracks')
  })

  it('numbers items from 01 and drops the extension from the label', () => {
    seedPlaylist(['first song.mp3', 'second.flac'])
    expect(names()).toEqual(['01. first song', '02. second'])
    const first = items()[0].querySelector<HTMLElement>('.playlist-item-name')!
    expect(first.title).toBe('first song.mp3')
  })

  it('shows em dashes until a track has analysed metadata', () => {
    seedPlaylist(['a.mp3', 'b.mp3'], 0, new Map([[1, { duration: 185, key: 'A min', bpm: 90.4 }]]))
    const meta = items().map((li) => li.querySelector('.playlist-item-meta')?.textContent)
    expect(meta[0]).toBe('— · — · —')
    expect(meta[1]).toBe('3:05 · A min · 90 BPM')
  })

  it('marks only the current track with aria-current', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 1)
    expect(items().map((li) => li.getAttribute('aria-current'))).toEqual([null, 'true', null])
  })

  it('labels each remove button with the file it removes', () => {
    seedPlaylist(['a.mp3', 'b.mp3'])
    const labels = qa('.playlist-item-remove').map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Remove a.mp3', 'Remove b.mp3'])
  })

  it('bounds the prev/next buttons to the playlist', () => {
    const prev = () => el<HTMLButtonElement>('prevBtn').disabled
    const next = () => el<HTMLButtonElement>('nextBtn').disabled

    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 0)
    expect([prev(), next()]).toEqual([true, false])

    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 1)
    expect([prev(), next()]).toEqual([false, false])

    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 2)
    expect([prev(), next()]).toEqual([false, true])

    seedPlaylist(['a.mp3', 'b.mp3'], -1)
    expect([prev(), next()]).toEqual([true, true])
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — playlist editing', () => {
  beforeEach(() => { build() })

  it('removes the clicked track and renumbers the rest', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 0)
    click(items()[1].querySelector('.playlist-item-remove')!)
    expect(names()).toEqual(['01. a', '02. c'])
    expect(el('playlistCount').textContent).toBe('2 tracks')
  })

  it('keeps aria-current on the same file when an earlier track is removed', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 2)
    click(items()[0].querySelector('.playlist-item-remove')!)
    const current = items().findIndex((li) => li.getAttribute('aria-current') === 'true')
    expect(current).toBe(1)
    expect(names()[current]).toBe('02. c')
  })

  it('shifts analysed metadata down with the tracks it belongs to', () => {
    const meta = new Map<number, TrackMeta>([
      [0, { duration: 60, key: 'C maj', bpm: 100 }],
      [2, { duration: 120, key: 'G min', bpm: 80 }],
    ])
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 0, meta)
    click(items()[1].querySelector('.playlist-item-remove')!)
    const shown = items().map((li) => li.querySelector('.playlist-item-meta')?.textContent)
    expect(shown).toEqual(['1:00 · C maj · 100 BPM', '2:00 · G min · 80 BPM'])
  })

  it('empties the list when the last track is removed', () => {
    seedPlaylist(['only.mp3'], 0)
    click(items()[0].querySelector('.playlist-item-remove')!)
    expect(items()).toHaveLength(0)
    expect(el('playlistCount').textContent).toBe('0 tracks')
    expect(el<HTMLButtonElement>('prevBtn').disabled).toBe(true)
    expect(el<HTMLButtonElement>('nextBtn').disabled).toBe(true)
  })

  it('clears the whole playlist from the clear button', () => {
    seedPlaylist(['a.mp3', 'b.mp3'], 1)
    click(el('playlistClearBtn'))
    expect(items()).toHaveLength(0)
    expect(el('playlistCount').textContent).toBe('0 tracks')
  })

  it('leaves the count untouched when clear is pressed on an empty playlist', () => {
    seedPlaylist(['a.mp3'])
    el('playlistCount').textContent = 'sentinel'
    seedPlaylist([])
    el('playlistCount').textContent = 'sentinel'
    click(el('playlistClearBtn'))
    // The early return means no re-render, so the sentinel survives.
    expect(el('playlistCount').textContent).toBe('sentinel')
  })

  it('filters rendered items by the search box and restores them when cleared', () => {
    seedPlaylist(['midnight drive.mp3', 'sunrise.mp3', 'drive fast.mp3'])
    const search = el<HTMLInputElement>('playlistSearch')

    search.value = 'drive'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(items().map((li) => li.style.display)).toEqual(['', 'none', ''])

    search.value = ''
    search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(items().map((li) => li.style.display)).toEqual(['', '', ''])
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — drag to reorder', () => {
  beforeEach(() => { build() })

  const drag = (from: number, to: number) => {
    const rows = items()
    rows[from].dispatchEvent(new Event('dragstart', { bubbles: true }))
    rows[to].dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    rows[to].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
  }

  it('moves the dragged track to the drop position', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'])
    drag(0, 2)
    expect(names()).toEqual(['01. b', '02. c', '03. a'])
  })

  it('carries the current track with it', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 0)
    drag(0, 2)
    const current = items().findIndex((li) => li.getAttribute('aria-current') === 'true')
    expect(names()[current]).toBe('03. a')
  })

  it('shifts the current index when a track moves across it', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'], 1)
    drag(0, 2)
    const current = items().findIndex((li) => li.getAttribute('aria-current') === 'true')
    expect(names()[current]).toBe('01. b')
  })

  it('leaves the order alone when a row is dropped on itself', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'])
    drag(1, 1)
    expect(names()).toEqual(['01. a', '02. b', '03. c'])
  })

  it('marks the row being dragged and the row under the pointer', () => {
    seedPlaylist(['a.mp3', 'b.mp3'])
    const [first, second] = items()

    first.dispatchEvent(new Event('dragstart', { bubbles: true }))
    expect(first.classList.contains('dragging')).toBe(true)

    second.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }))
    expect(second.classList.contains('drag-over')).toBe(true)

    second.dispatchEvent(new Event('dragleave', { bubbles: true }))
    expect(second.classList.contains('drag-over')).toBe(false)

    first.dispatchEvent(new Event('dragend', { bubbles: true }))
    expect(first.classList.contains('dragging')).toBe(false)
  })

  it('ignores a drop that was not preceded by a dragstart', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'])
    // Dropped on the FIRST row on purpose. With no dragstart the index is -1,
    // and splice(-1, 1) lifts the last track -- dropping that back at the end
    // reassembles the same order, so a drop on the last row cannot tell the
    // guard from its absence. Only a drop at the top can.
    items()[0].dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
    expect(names()).toEqual(['01. a', '02. b', '03. c'])
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — track context menu', () => {
  beforeEach(() => { build({ mobile: true }) })

  const menu = () => el('trackMenu')
  const action = (name: string) => q<HTMLButtonElement>(`#trackMenu [data-action="${name}"]`)

  const open = (index: number, box = { width: 300, height: 40, left: 20, top: 100 }) => {
    const li = items()[index]
    stubBoundingRect(li, box)
    inner(app).openTrackMenu(index, li)
  }

  it('anchors below the row it was opened from', () => {
    seedPlaylist(['a.mp3', 'b.mp3'])
    open(1)
    expect(menu().classList.contains('track-menu--visible')).toBe(true)
    expect(menu().getAttribute('aria-hidden')).toBe('false')
    expect(menu().style.top).toBe('146px')
    expect(menu().style.left).toBe('32px')
  })

  it('flips above the row when there is no room below', () => {
    seedPlaylist(['a.mp3'])
    open(0, { width: 300, height: 40, left: 20, top: window.innerHeight - 8 })
    expect(menu().style.top).toBe(`${window.innerHeight - 14}px`)
  })

  it('clamps to the left edge of the viewport', () => {
    seedPlaylist(['a.mp3'])
    open(0, { width: 300, height: 40, left: -100, top: 100 })
    expect(menu().style.left).toBe('8px')
  })

  it('moves a track to the top and closes', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'])
    open(2)
    click(action('move-top'))
    expect(names()).toEqual(['01. c', '02. a', '03. b'])
    expect(menu().classList.contains('track-menu--visible')).toBe(false)
    expect(menu().getAttribute('aria-hidden')).toBe('true')
  })

  it('queues a track to play next after the current one', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3'], 0)
    open(3)
    click(action('play-next'))
    expect(names()).toEqual(['01. a', '02. d', '03. b', '04. c'])
  })

  it('removes a track from the menu', () => {
    seedPlaylist(['a.mp3', 'b.mp3', 'c.mp3'])
    open(1)
    click(action('remove'))
    expect(names()).toEqual(['01. a', '02. c'])
  })

  it('ignores an action whose track is already gone', () => {
    seedPlaylist(['a.mp3', 'b.mp3'])
    open(1)
    // The playlist shrinks under the open menu (a remove elsewhere, an
    // autoplay advance). move-top rather than remove: removing a stale index
    // splices nothing and looks identical with or without the bounds check,
    // while reordering one would splice an undefined into the array and take
    // the next render down with it.
    inner(app).playlist = [audioFile('a.mp3')]
    inner(app).renderPlaylist()
    click(action('move-top'))
    expect(names()).toEqual(['01. a'])
    expect(el('playlistCount').textContent).toBe('1 track')
  })

  it('closes on the next interaction outside itself, not on the tap that opened it', () => {
    vi.useFakeTimers()
    installRaf()
    seedPlaylist(['a.mp3'])
    open(0)

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu().classList.contains('track-menu--visible')).toBe(true)

    vi.advanceTimersByTime(1)
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu().classList.contains('track-menu--visible')).toBe(false)
  })

  it('stays open when the interaction is inside the menu', () => {
    vi.useFakeTimers()
    installRaf()
    seedPlaylist(['a.mp3'])
    open(0)
    vi.advanceTimersByTime(1)

    action('move-top').dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(menu().classList.contains('track-menu--visible')).toBe(true)
  })

  it('opens from a long press on a row', () => {
    vi.useFakeTimers()
    installRaf()
    seedPlaylist(['a.mp3', 'b.mp3'])
    const li = items()[1]
    stubBoundingRect(li, { width: 300, height: 40, left: 20, top: 100 })

    li.dispatchEvent(new Event('touchstart', { bubbles: true }))
    vi.advanceTimersByTime(449)
    expect(menu().classList.contains('track-menu--visible')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(menu().classList.contains('track-menu--visible')).toBe(true)
  })

  it('cancels the long press when the finger moves', () => {
    vi.useFakeTimers()
    installRaf()
    seedPlaylist(['a.mp3', 'b.mp3'])
    const li = items()[1]
    stubBoundingRect(li, { width: 300, height: 40, left: 20, top: 100 })

    li.dispatchEvent(new Event('touchstart', { bubbles: true }))
    vi.advanceTimersByTime(200)
    li.dispatchEvent(new Event('touchmove', { bubbles: true }))
    vi.advanceTimersByTime(500)
    expect(menu().classList.contains('track-menu--visible')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — panels', () => {
  const trigger = (name: string) => q<HTMLElement>(`[data-panel="${name}"]`)
  const drawer = (id: string) => el(id).classList.contains('panel--visible')
  const activeTriggers = () => qa('[data-panel]')
    .filter((b) => b.classList.contains('panel-trigger--active'))
    .map((b) => b.dataset.panel)

  it('opens the panel its trigger names', () => {
    build()
    click(trigger('sound'))
    expect(drawer('soundDrawer')).toBe(true)
    expect(activeTriggers()).toEqual(['sound', 'sound'])
  })

  it('closes again when the same trigger is pressed twice', () => {
    build()
    click(trigger('visual'))
    click(trigger('visual'))
    expect(drawer('settingsDrawer')).toBe(false)
    expect(activeTriggers()).toEqual([])
  })

  it('keeps one panel open at a time', () => {
    build()
    click(trigger('playlist'))
    click(trigger('export'))
    expect(drawer('playlistDrawer')).toBe(false)
    expect(drawer('exportDrawer')).toBe(true)
    expect(activeTriggers()).toEqual(['export', 'export'])
  })

  it('closes from the panel close button', () => {
    build()
    click(trigger('playlist'))
    click(el('playlistCloseBtn'))
    expect(drawer('playlistDrawer')).toBe(false)
  })

  it('closes when the backdrop is tapped', () => {
    build({ mobile: true })
    click(trigger('sound'))
    expect(el('drawerBackdrop').classList.contains('backdrop--visible')).toBe(true)
    click(el('drawerBackdrop'))
    expect(drawer('soundDrawer')).toBe(false)
    expect(el('drawerBackdrop').classList.contains('backdrop--visible')).toBe(false)
  })

  it('does not dim the page behind a desktop panel', () => {
    build()
    click(trigger('sound'))
    expect(drawer('soundDrawer')).toBe(true)
    expect(el('drawerBackdrop').classList.contains('backdrop--visible')).toBe(false)
  })

  it('switches the sound panel sub-tabs', () => {
    build()
    const tabs = qa<HTMLElement>('.sound-tab')
    const effects = tabs.find((t) => t.dataset.tab === 'effects')!
    click(effects)

    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(effects.classList.contains('sound-tab--active')).toBe(true)
    expect(el('soundTab-effects').classList.contains('sound-tab-panel--hidden')).toBe(false)
    expect(el('soundTab-audio').classList.contains('sound-tab-panel--hidden')).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — help modal', () => {
  beforeEach(() => { build() })

  it('opens from the help button and closes from its close button', () => {
    click(el('helpBtn'))
    expect(dialogCalls.open).toBe(1)
    click(el('helpCloseBtn'))
    expect(dialogCalls.close).toBe(1)
  })

  it('closes when the backdrop area of the dialog is clicked', () => {
    click(el('helpBtn'))
    el('help-modal').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(dialogCalls.close).toBe(1)
  })

  it('keeps the dialog open when a click lands on its content', () => {
    click(el('helpBtn'))
    q('.help-tab').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(dialogCalls.close).toBe(0)
  })

  it('switches help tabs and their panels', () => {
    const tabs = qa<HTMLElement>('.help-tab')
    const guide = tabs.find((t) => t.dataset.tab === 'guide')!
    click(guide)

    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(guide.classList.contains('help-tab--active')).toBe(true)
    expect(el('helpTab-guide').classList.contains('help-tab-panel--hidden')).toBe(false)
    expect(el('helpTab-shortcuts').classList.contains('help-tab-panel--hidden')).toBe(true)
    expect(el('helpTab-about').classList.contains('help-tab-panel--hidden')).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — keyboard shortcuts without a loaded track', () => {
  beforeEach(() => { build() })

  it('opens help on ?', () => {
    key('?')
    expect(dialogCalls.open).toBe(1)
  })

  it('leaves ? to the text field when one has focus', () => {
    key('?', el<HTMLInputElement>('playlistSearch'))
    expect(dialogCalls.open).toBe(0)
  })

  it('steps the volume down and back up in tens', () => {
    key('[')
    expect(slider('volumeSlider').value).toBe('70')
    expect(el('volumeValue').textContent).toBe('70%')
    expect(slider('volumeSlider').getAttribute('aria-valuetext')).toBe('70%')

    key(']')
    expect(slider('volumeSlider').value).toBe('80')
    expect(el('volumeValue').textContent).toBe('80%')
  })

  // The Math.max(0, ...) / Math.min(100, ...) in these handlers survive
  // mutation: <input type="range"> sanitizes its own value, in jsdom and in
  // every browser, so the out-of-range assignment never lands either way.
  // Defensive, not dead -- the assertion is on the value a user would see.
  it('stops the volume at the ends of its range', () => {
    slider('volumeSlider').value = '5'
    key('[')
    expect(slider('volumeSlider').value).toBe('0')

    slider('volumeSlider').value = '95'
    key(']')
    expect(slider('volumeSlider').value).toBe('100')
  })

  it('leaves the volume keys to a focused text field', () => {
    key('[', el<HTMLInputElement>('playlistSearch'))
    expect(slider('volumeSlider').value).toBe('80')
  })

  it('does nothing on the transport keys while no buffer is loaded', () => {
    seedPlaylist(['a.mp3', 'b.mp3'], 0)
    key(' ')
    key('n')
    key('s')
    expect(items().findIndex((li) => li.getAttribute('aria-current') === 'true')).toBe(0)
    expect(el('playPauseBtn').classList.contains('playing')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// The defaults block above proves initAriaValueText; these prove the input
// handlers that maintain the same labels afterwards. Mutating
// `decay.toFixed(1)` in the handler survived until this block existed -- the
// identical expression in initAriaValueText made it look covered.
describe('App — moving the audio sliders', () => {
  beforeEach(() => { build() })

  const move = (id: string, value: string) => {
    slider(id).value = value
    slider(id).dispatchEvent(new Event('input', { bubbles: true }))
  }

  it('relabels the speed slider in rate, not percent', () => {
    move('speedSlider', '150')
    expect(el('speedValue').textContent).toBe('1.50x')
    expect(slider('speedSlider').getAttribute('aria-valuetext')).toBe('1.50x')
  })

  it('signs the pitch label and drops the sign at zero', () => {
    move('pitchSlider', '4')
    expect(el('pitchValue').textContent).toBe('+4 st')
    expect(slider('pitchSlider').getAttribute('aria-valuetext')).toBe('+4 semitones')

    move('pitchSlider', '-4')
    expect(el('pitchValue').textContent).toBe('-4 st')
    expect(slider('pitchSlider').getAttribute('aria-valuetext')).toBe('-4 semitones')

    move('pitchSlider', '0')
    expect(el('pitchValue').textContent).toBe('0 st')
    expect(slider('pitchSlider').getAttribute('aria-valuetext')).toBe('0 semitones')
  })

  it('relabels decay in seconds and pre-delay in milliseconds', () => {
    move('decaySlider', '37')
    expect(el('decayValue').textContent).toBe('3.7s')
    expect(slider('decaySlider').getAttribute('aria-valuetext')).toBe('3.7 seconds')

    move('preDelaySlider', '42')
    expect(el('preDelayValue').textContent).toBe('42 ms')
    expect(slider('preDelaySlider').getAttribute('aria-valuetext')).toBe('42 milliseconds')
  })

  it('relabels the percent sliders', () => {
    move('reverbSlider', '65')
    expect(el('reverbValue').textContent).toBe('65%')
    expect(slider('reverbSlider').getAttribute('aria-valuetext')).toBe('65%')

    move('dampingSlider', '5')
    expect(el('dampingValue').textContent).toBe('5%')
    expect(slider('dampingSlider').getAttribute('aria-valuetext')).toBe('5%')
  })

  it('persists a slider move', () => {
    move('reverbSlider', '65')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).reverb).toBe('65')
  })

  it('selects one reverb type at a time from the chip row', () => {
    const chips = qa<HTMLButtonElement>('.btn-reverb-type')
    const plate = chips.find((b) => b.dataset.reverbType === 'plate')!
    click(plate)

    expect(chips.filter((b) => b.classList.contains('btn-reverb-type--active'))).toEqual([plate])
    expect(chips.map((b) => b.getAttribute('aria-pressed')))
      .toEqual(chips.map((b) => String(b === plate)))
    expect(el('reverbTypeValue').textContent).toBe(plate.textContent)
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).reverbType).toBe('plate')
  })

  it('persists an orb toggle', () => {
    toggle('wireframeToggle').checked = false
    toggle('wireframeToggle').dispatchEvent(new Event('change'))
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).wireframe).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — the analysed BPM and key badge', () => {
  beforeEach(() => { build() })

  // _baseBpm and _detectedKey only ever arrive from a decoded buffer, which is
  // out of scope; what is in scope is the arithmetic that re-derives the badge
  // when the speed and pitch controls move.
  const seedAnalysis = (bpm: number, root: number, mode: string) => {
    const i = app as unknown as { _baseBpm: number; _detectedKey: { root: number; mode: string } }
    i._baseBpm = bpm
    i._detectedKey = { root, mode }
  }

  it('scales the BPM with the playback rate', () => {
    seedAnalysis(120, 0, 'maj')
    slider('speedSlider').value = '150'
    slider('speedSlider').dispatchEvent(new Event('input', { bubbles: true }))
    expect(el('trackBpm').textContent).toBe('180 BPM · C maj')
  })

  it('transposes the key by the pitch shift, wrapping the octave', () => {
    seedAnalysis(100, 10, 'min')
    slider('pitchSlider').value = '3'
    slider('pitchSlider').dispatchEvent(new Event('input', { bubbles: true }))
    expect(el('trackBpm').textContent).toBe('100 BPM · C# min')

    slider('pitchSlider').value = '-11'
    slider('pitchSlider').dispatchEvent(new Event('input', { bubbles: true }))
    expect(el('trackBpm').textContent).toBe('100 BPM · B min')
  })

  it('shows nothing at all until a track has been analysed', () => {
    slider('speedSlider').value = '150'
    slider('speedSlider').dispatchEvent(new Event('input', { bubbles: true }))
    expect(el('trackBpm').textContent).toBe('')
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — Lite visual mode', () => {
  const liteToggle = () => toggle('liteVisualToggle')

  it('turns the Lite aurora on and remembers it', () => {
    build()
    liteToggle().checked = true
    liteToggle().dispatchEvent(new Event('change'))

    expect(el('liteAurora').classList.contains('lite-aurora--on')).toBe(true)
    expect(localStorage.getItem(LITE_KEY)).toBe('1')
  })

  it('restores Lite mode on the next visit', () => {
    build({ lite: true })
    expect(liteToggle().checked).toBe(true)
    expect(el('liteAurora').classList.contains('lite-aurora--on')).toBe(true)
  })

  it('starts one CSS loop while on and cancels it when switched off', () => {
    build()
    const idle = frames.size

    liteToggle().checked = true
    liteToggle().dispatchEvent(new Event('change'))
    expect(frames.size).toBe(idle + 1)

    liteToggle().checked = false
    liteToggle().dispatchEvent(new Event('change'))
    expect(frames.size).toBe(idle)
    expect(document.documentElement.style.getPropertyValue('--lite-bass')).toBe('0')
    expect(localStorage.getItem(LITE_KEY)).toBe('0')
    expect(el('liteAurora').classList.contains('lite-aurora--on')).toBe(false)
  })

  it('does not stack a second loop when it is already running', () => {
    build({ lite: true })
    const running = frames.size
    liteToggle().dispatchEvent(new Event('change'))
    expect(frames.size).toBe(running)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — battery monitor', () => {
  it('offers Lite visual once when the battery is low and discharging', async () => {
    const battery = stubBattery(0.1, false)
    build()
    await settle()

    expect(el('toast').classList.contains('toast--visible')).toBe(true)
    expect(q('.toast-msg').textContent).toContain('Low battery')
    expect(q<HTMLButtonElement>('.toast-action').textContent).toBe('Lite')

    click(q('.toast-close'))
    battery.fire()
    expect(el('toast').classList.contains('toast--visible')).toBe(false)
  })

  it('switches to Lite visual from the toast action', async () => {
    stubBattery(0.1, false)
    build()
    await settle()

    click(q('.toast-action'))
    expect(el('liteAurora').classList.contains('lite-aurora--on')).toBe(true)
    expect(toggle('liteVisualToggle').checked).toBe(true)
  })

  it('says nothing while the battery is charging', async () => {
    stubBattery(0.1, true)
    build()
    await settle()
    expect(el('toast').classList.contains('toast--visible')).toBe(false)
  })

  it('says nothing above the low-battery threshold', async () => {
    const battery = stubBattery(0.2, false)
    build()
    await settle()
    expect(el('toast').classList.contains('toast--visible')).toBe(false)

    battery.bat.level = 0.19
    battery.fire()
    expect(el('toast').classList.contains('toast--visible')).toBe(true)
  })

  it('does not suggest Lite visual to someone already using it', async () => {
    stubBattery(0.1, false)
    build({ lite: true })
    await settle()
    expect(el('toast').classList.contains('toast--visible')).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('App — touch bridge for range inputs', () => {
  it('turns a touch on a slider into the value under the finger', () => {
    build({ mobile: true })
    const vol = slider('volumeSlider')
    stubBoundingRect(vol, { width: 200, height: 20, left: 0, top: 0 })

    const touch = (clientX: number) => {
      const ev = new Event('touchmove', { bubbles: true, cancelable: true }) as Event & {
        touches: { clientX: number }[]
      }
      Object.defineProperty(ev, 'touches', { value: [{ clientX, clientY: 0 }] })
      vol.dispatchEvent(ev)
    }

    touch(50)
    expect(vol.value).toBe('25')
    expect(el('volumeValue').textContent).toBe('25%')

    // Past either end the ratio is already clamped to 0-1 before the value is
    // computed, so the second Math.max(min, Math.min(max, ...)) survives
    // mutation: no shipping slider has a step that rounds past its own max
    // (checked across all 24 range inputs), which makes it unreachable rather
    // than untested. Do not "simplify" it away -- a future slider with an
    // awkward step would need it.
    touch(500)
    expect(vol.value).toBe('100')
    touch(-500)
    expect(vol.value).toBe('0')
  })
})
