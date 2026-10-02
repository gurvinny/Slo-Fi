// Live measurement of the player chrome, published as CSS custom properties so
// the fixed flyout panels can be bounded by the real layout instead of by
// hardcoded offsets that drift from it.
// Author: gurvinny

export interface ChromeInsets {
  /** Distance from the viewport top to the bottom edge of the top HUD. */
  top: number
  /** Height of the fixed bottom bar (waveform + transport, + nav on phones). */
  bar: number
  /** Distance from the viewport bottom to the highest bottom chrome a panel
   *  could cover: the bar, or the desktop dock floating above it when a panel
   *  shares its columns. */
  bottom: number
}

// A display:none element (the header and dock on phones, the whole player
// before a track loads) reports an all-zero rect. That reads as zero bounds on
// its own, and as a zero-width span it can only overlap a panel's columns under
// a non-strict comparison -- which is why the overlap test below is strict.
function boxOf(el: Element | null): DOMRect | null {
  return el ? el.getBoundingClientRect() : null
}

/**
 * The dock floats centred above the bar while the panels hug the sides, so on a
 * wide window they never meet and clearing the dock would only cost every panel
 * its height. Count it only when some panel's columns overlap the dock's.
 * Panels are measured while closed: they hide by opacity and a small slide, not
 * display:none, so their horizontal span is already laid out.
 */
export function measureChromeInsets(
  hud: Element | null,
  bar: Element | null,
  dock: Element | null,
  panels: readonly Element[],
  viewportHeight: number,
): ChromeInsets {
  const hudBox = boxOf(hud)
  const barBox = boxOf(bar)
  const dockBox = boxOf(dock)

  const top = hudBox ? Math.round(hudBox.bottom) : 0
  const barH = barBox ? Math.round(barBox.height) : 0
  const dockInTheWay = dockBox !== null && panels.some((p) => {
    const b = boxOf(p)
    return b !== null && b.left < dockBox.right && dockBox.left < b.right
  })
  const dockReach = dockInTheWay ? Math.round(viewportHeight - dockBox.top) : 0
  return { top, bar: barH, bottom: Math.max(barH, dockReach) }
}

/**
 * Writes `--chrome-top`, `--bottombar-h` and `--chrome-bottom` on `root`, but only
 * when a value actually changes. Every custom-property write on :root repaints
 * each backdrop-filter layer, so a no-op write is not free. A zero measurement
 * means the chrome is not laid out yet (the player is still hidden) and is
 * skipped, leaving the stylesheet fallback in charge.
 */
export class ChromeVars {
  private readonly written = new Map<string, string>()

  constructor(private readonly root: HTMLElement) {}

  apply(insets: ChromeInsets): number {
    let writes = 0
    const entries: [string, number][] = [
      ['--chrome-top', insets.top],
      ['--bottombar-h', insets.bar],
      ['--chrome-bottom', insets.bottom],
    ]
    for (const [name, px] of entries) {
      if (px <= 0) continue
      const value = `${px}px`
      if (this.written.get(name) === value) continue
      this.root.style.setProperty(name, value)
      this.written.set(name, value)
      writes++
    }
    return writes
  }
}
