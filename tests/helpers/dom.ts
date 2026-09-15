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
 */
export function recordCanvas2D(): Ctx2DCall[] {
  const calls: Ctx2DCall[] = []
  const methods = [
    'beginPath', 'closePath', 'clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'save', 'restore', 'translate',
    'scale', 'rotate', 'setTransform', 'drawImage', 'fillText', 'strokeText',
    'createLinearGradient', 'createRadialGradient', 'setLineDash', 'quadraticCurveTo',
    'bezierCurveTo', 'putImageData', 'getImageData', 'measureText',
  ]

  const ctx: Record<string, unknown> = {}
  for (const m of methods) {
    ctx[m] = (...args: unknown[]) => {
      calls.push({ method: m, args })
      // The gradient builders and measureText are used for their return value,
      // not their effect -- handing back undefined makes the caller throw.
      if (m === 'createLinearGradient' || m === 'createRadialGradient') {
        return { addColorStop: () => {} }
      }
      if (m === 'measureText') return { width: 0 }
      if (m === 'getImageData') return { data: new Uint8ClampedArray(4), width: 1, height: 1 }
      return undefined
    }
  }

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: (kind: string) => (kind === '2d' ? ctx : null),
  })

  return calls
}

/** Names of the recorded calls, for asserting a draw sequence. */
export function drawSequence(calls: Ctx2DCall[]): string[] {
  return calls.map((c) => c.method)
}
