// Contrast floors for interactive UI.
// Author: gurvinny
//
// The control dock rendered its buttons at 1.76:1 against the page background
// -- below WCAG's 3:1 floor for UI components, let alone the 4.5:1 for text.
// That is not a taste question, and eyeballing a hex value in a dark theme will
// not catch it again, so the floors are asserted here against the real
// stylesheet rather than trusted to review.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CSS = readFileSync(join(process.cwd(), 'src/styles/main.css'), 'utf8')

function token(name: string): string {
  const m = CSS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`--${name} is not defined as a 6-digit hex in main.css`)
  return m[1]!
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** Worst case across every surface a control can sit on. */
function worstContrast(fg: string): number {
  return Math.min(contrast(fg, token('color-bg')), contrast(fg, token('color-surface')))
}

/** The colour token a selector's `color:` resolves to. */
function colorTokenOf(selector: string): string {
  const block = CSS.match(new RegExp(`^\\${selector}\\s*\\{[^}]*\\}`, 'm'))
  if (!block) throw new Error(`${selector} is not a top-level rule in main.css -- it moved or was renamed`)
  const m = block[0].match(/color:\s*var\(--([a-z-]+)\)/)
  if (!m) throw new Error(`${selector} does not set color from a custom property`)
  return m[1]!
}

describe('contrast floors', () => {
  it('keeps body text far above the readable minimum', () => {
    expect(worstContrast(token('color-text'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the dim text token readable as text', () => {
    // --text-dim labels real content, not decoration, so it owes the 4.5:1
    // text floor rather than the 3:1 component one.
    expect(worstContrast(token('color-text-dim'))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the muted token above the UI-component floor', () => {
    expect(worstContrast(token('color-text-muted'))).toBeGreaterThanOrEqual(3)
  })

  it.each(['.dock-btn', '.btn-playlist-clear'])(
    'renders %s as legible interactive text', (selector) => {
      // A control you are meant to click owes the text floor, not the
      // component one: it is a labelled button, and the label is the affordance.
      const value = token(`color-${colorTokenOf(selector)}`.replace('color-color-', 'color-'))
      expect(worstContrast(value)).toBeGreaterThanOrEqual(4.5)
    })
})
