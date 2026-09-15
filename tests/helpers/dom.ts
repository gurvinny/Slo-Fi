// Fixture helpers for the jsdom suite.
// Author: gurvinny
//
// Fixtures are sliced out of the shipping index.html rather than hand-written
// here. A copied fixture is the DOM equivalent of a test that re-implements the
// thing it tests: rename `.toast-msg` in the real page and a test holding its
// own copy of the markup keeps passing against a selector that no longer
// exists anywhere. Reading the real file means that rename turns the suite red.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const HTML = readFileSync(join(process.cwd(), 'index.html'), 'utf8')

// Parsed once. Every mount imports a fresh deep clone, so a test mutating its
// fixture cannot leak into the next one.
const source = new DOMParser().parseFromString(HTML, 'text/html')

/**
 * Append the real page's subtree for `selector` to document.body.
 *
 * Throws rather than returning null when the selector is gone: a silently
 * absent fixture would make the controller's own "missing element" branch look
 * like the code under test, when it is really the fixture that broke.
 */
export function mountFixture(selector: string): HTMLElement {
  const found = source.querySelector(selector)
  if (!found) {
    throw new Error(
      `index.html has no "${selector}" -- the markup moved or was renamed, so this fixture is stale`,
    )
  }
  const node = document.importNode(found, true) as HTMLElement
  document.body.appendChild(node)
  return node
}

/** Wipe every piece of state that survives between tests in one jsdom window. */
export function resetDom(): void {
  document.body.innerHTML = ''
  document.documentElement.className = ''
  document.documentElement.removeAttribute('style')
  try { localStorage.clear() } catch { /* jsdom can refuse on opaque origins */ }
  try { sessionStorage.clear() } catch { /* ditto */ }
}

/**
 * jsdom implements no matchMedia at all, so any controller that asks about
 * display-mode or a breakpoint throws before its logic runs.
 *
 * `matches` maps a substring of the query to the answer; anything unlisted is
 * false. Substring rather than exact match because the queries carry pixel
 * values that would otherwise have to be duplicated in every test.
 */
export function stubMatchMedia(matches: Record<string, boolean> = {}): void {
  const listeners = new Set<() => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      const hit = Object.entries(matches).find(([frag]) => query.includes(frag))
      return {
        matches: hit ? hit[1] : false,
        media: query,
        onchange: null,
        addListener: (fn: () => void) => listeners.add(fn),
        removeListener: (fn: () => void) => listeners.delete(fn),
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        dispatchEvent: () => true,
      } as unknown as MediaQueryList
    },
  })
}

/**
 * Several controllers read navigator.userAgent in a field initializer, which
 * runs before the constructor body -- so this has to be called before `new`.
 */
export function stubUserAgent(ua: string): void {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  })
}

export type Ctx2DCall = { method: string; args: unknown[] }

/**
 * Replace the 2D canvas context with one that records calls.
 *
 * jsdom paints nothing, so there are no pixels to read back. Asserting on the
 * call sequence is the only honest option: it proves the draw code ran and in
 * what order, and says nothing about what it looked like. Pixel truth is the
 * browser suite's job.
 *
 * Property assignments (fillStyle, strokeStyle, globalAlpha, ...) are recorded
 * as `set:<prop>` and gradient stops as `addColorStop`, because the colour
 * strings are computed -- a theme hex that arrives 3-digit and gets an alpha
 * byte appended produces an invalid colour, and the recorded value is the only
 * place that is visible outside a real canvas.
 */
export function recordCanvas2D(): Ctx2DCall[] {
  const calls: Ctx2DCall[] = []
  const methods = [
    'beginPath', 'closePath', 'clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'save', 'restore', 'translate',
    'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText',
    'createLinearGradient', 'createRadialGradient', 'setLineDash', 'quadraticCurveTo',
    'bezierCurveTo', 'putImageData', 'getImageData', 'measureText', 'clip',
  ]

  const target: Record<string, unknown> = {}
  for (const m of methods) {
    target[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      // The gradient builders and measureText are used for their return value,
      // not their effect -- handing back undefined makes the caller throw.
      if (m === 'createLinearGradient' || m === 'createRadialGradient') {
        return {
          addColorStop: (offset: number, color: string) => {
            calls.push({ method: 'addColorStop', args: [offset, color] })
          },
        }
      }
      if (m === 'measureText') return { width: 0 }
      if (m === 'getImageData') return { data: new Uint8ClampedArray(4), width: 1, height: 1 }
      return undefined
    }
  }

  const ctx = new Proxy(target, {
    set(obj, prop, value) {
      calls.push({ method: `set:${String(prop)}`, args: [value] })
      obj[String(prop)] = value
      return true
    },
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: (kind: string) => (kind === '2d' ? ctx : null),
  })

  return calls
}

/** Every colour string the draw pass produced, from styles and gradient stops. */
export function drawColors(calls: Ctx2DCall[]): string[] {
  return calls
    .filter((c) => c.method === 'addColorStop' || /^set:(fill|stroke|shadowColor)/.test(c.method))
    .map((c) => String(c.args[c.method === 'addColorStop' ? 1 : 0]))
}

/** Names of the recorded calls, for asserting a draw sequence. */
export function drawSequence(calls: Ctx2DCall[]): string[] {
  return calls.map((c) => c.method)
}

// ── Mobile browser APIs ──────────────────────────────────────────────────────
// jsdom implements none of the following. Each one is reached through an
// `in navigator` / optional-call guard in the source, so leaving them absent
// tests only the unsupported-browser path -- which is a real branch, but not
// the one the mobile behaviour lives in.

export type MediaSessionStub = {
  handlers: Map<string, ((details: { seekTime?: number; seekOffset?: number }) => void) | null>
  metadata: unknown
  playbackState: string
  positionStates: unknown[]
  invoke(action: string, details?: { seekTime?: number; seekOffset?: number }): void
}

/** Install a recording navigator.mediaSession plus the MediaMetadata ctor. */
export function stubMediaSession(opts: { positionStateThrows?: boolean } = {}): MediaSessionStub {
  const handlers = new Map<string, ((d: never) => void) | null>()
  const positionStates: unknown[] = []

  const ms = {
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler: (action: string, fn: ((d: never) => void) | null) => {
      handlers.set(action, fn)
    },
    setPositionState: (state: unknown) => {
      if (opts.positionStateThrows) throw new Error('position > duration')
      positionStates.push(state)
    },
  }

  Object.defineProperty(window.navigator, 'mediaSession', {
    configurable: true, writable: true, value: ms,
  })
  ;(window as unknown as Record<string, unknown>).MediaMetadata =
    class { constructor(init: unknown) { Object.assign(this, init) } }

  return {
    handlers: handlers as MediaSessionStub['handlers'],
    positionStates,
    get metadata() { return ms.metadata },
    get playbackState() { return ms.playbackState },
    invoke(action, details) {
      const fn = handlers.get(action)
      if (!fn) throw new Error(`no mediaSession handler registered for "${action}"`)
      fn((details ?? {}) as never)
    },
  }
}

/** Remove navigator.mediaSession so the `in navigator` guards take the else path. */
export function removeMediaSession(): void {
  // `delete` does not work on jsdom's navigator, so the property is redefined
  // as absent instead -- `in` still reports true for an own property set to
  // undefined, hence configurable redefinition rather than assignment.
  Reflect.deleteProperty(window.navigator, 'mediaSession')
}

export function stubVibration(): number[][] {
  const patterns: number[][] = []
  Object.defineProperty(window.navigator, 'vibrate', {
    configurable: true, writable: true,
    value: (p: number[]) => { patterns.push(p); return true },
  })
  return patterns
}

export type WakeLockStub = { requests: number; releases: number; deny: boolean }

export function stubWakeLock(deny = false): WakeLockStub {
  const state: WakeLockStub = { requests: 0, releases: 0, deny }
  Object.defineProperty(window.navigator, 'wakeLock', {
    configurable: true, writable: true,
    value: {
      request: async () => {
        state.requests++
        if (state.deny) throw new Error('wake lock denied')
        return { release: async () => { state.releases++ } }
      },
    },
  })
  return state
}

/** document.visibilityState is a getter, so it cannot simply be assigned. */
export function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => value,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

export type FullscreenStub = { requests: number; exits: number; element: Element | null }

export function stubFullscreen(opts: { denyRequest?: boolean } = {}): FullscreenStub {
  const state: FullscreenStub = { requests: 0, exits: 0, element: null }
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true, get: () => state.element,
  })
  // The prefixed property is not a jsdom member, so a test that defines it
  // leaves every later fullscreen check reading "already fullscreen" from a
  // stale getter. Reset it here rather than trusting each test to undo it.
  Object.defineProperty(document, 'webkitFullscreenElement', {
    configurable: true, get: () => null,
  })
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true, writable: true,
    value: () => {
      state.requests++
      if (opts.denyRequest) return Promise.reject(new Error('denied'))
      state.element = document.documentElement
      return Promise.resolve()
    },
  })
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true, writable: true,
    value: () => { state.exits++; state.element = null; return Promise.resolve() },
  })
  return state
}

export type ResizeObserverStub = { instances: number; trigger(): void }

/**
 * jsdom has no ResizeObserver, and EffectsController constructs one while
 * building its EQ DOM -- so without this the constructor throws before any of
 * its wiring runs.
 *
 * The stub never observes anything on its own; `trigger()` fires every
 * registered callback, which is how the drawer-opens-at-zero-width path gets
 * exercised deliberately rather than by accident.
 */
export function stubResizeObserver(): ResizeObserverStub {
  const callbacks: (() => void)[] = []
  const state: ResizeObserverStub = {
    instances: 0,
    trigger: () => { for (const cb of callbacks) cb() },
  }
  ;(window as unknown as Record<string, unknown>).ResizeObserver =
    class {
      constructor(cb: () => void) { state.instances++; callbacks.push(cb) }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  ;(globalThis as unknown as Record<string, unknown>).ResizeObserver =
    (window as unknown as Record<string, unknown>).ResizeObserver
  return state
}

/**
 * Give an element a real-looking box. jsdom reports an all-zero rect, and any
 * code that divides by width or bails on `!W` reads that as "not laid out yet"
 * -- so a canvas test without this silently exercises the early return.
 */
export function stubBoundingRect(
  el: Element,
  box: { width: number; height: number; left?: number; top?: number },
): void {
  const { width, height, left = 0, top = 0 } = box
  el.getBoundingClientRect = () => ({
    width, height, left, top,
    right: left + width, bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  }) as DOMRect
}
