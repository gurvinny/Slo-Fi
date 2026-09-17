// Author: gurvinny
//
// The data half of the EQ/waveform theme invariant.
//
// The dom half (tests/dom/EffectsController.test.ts) proves the canvases read
// --accent fresh on every repaint, but it has to *stub* the cascade: jsdom
// parses no stylesheet, so getPropertyValue('--accent') is '' for every theme
// and a dom test can say nothing about the real palette. So the values
// themselves are asserted here, against the shipping stylesheet and the
// shipping markup, with no DOM at all.
//
// What makes this load-bearing rather than decorative: _getAccentRGB() and
// _getComplementaryRGB() in EffectsController parse --accent positionally and
// fall back to '180,255,0' -- Meridian's own accent -- for anything they cannot
// read. A theme whose accent is not a plain hex therefore renders as Meridian
// and looks like the theme switch failing, which is precisely the bug this
// suite exists to keep fixed.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../src/styles/main.css'), 'utf8')
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')

/** Every theme the shipping page offers, in chip order. */
function chipThemes(): string[] {
  return [...html.matchAll(/theme-chip"\s+data-theme="([a-z]+)"/g)].map((m) => m[1])
}

/** The `--accent` declared inside a given [data-theme] block. */
function themeAccent(theme: string): string | null {
  const block = new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css)
  if (!block) return null
  const decl = /--accent:\s*([^;]+);/.exec(block[1])
  return decl ? decl[1].trim() : null
}

/** A hex CSS accepts and _getAccentRGB can parse once normHex has run. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

describe('theme accents', () => {
  it('offers prism plus six themes, and the markup is the source of that list', () => {
    // Hard-coding the six here would let a seventh chip ship with no palette
    // and no failing test, so the list comes out of index.html.
    const themes = chipThemes()
    expect(themes).toContain('prism')
    expect(themes).toHaveLength(7)
  })

  it.each(['void', 'neon', 'ember', 'frost', 'mono', 'meridian'])(
    '%s declares --accent as a hex the canvases can parse',
    (theme) => {
      const accent = themeAccent(theme)
      expect(accent, `[data-theme="${theme}"] declares no --accent`).not.toBeNull()
      expect(accent).toMatch(HEX)
    },
  )

  it('gives every chip in the page a palette', () => {
    // prism is the exception by design: applyTheme removes data-theme entirely
    // and the page falls through to :root.
    for (const theme of chipThemes()) {
      if (theme === 'prism') continue
      expect(themeAccent(theme), `no [data-theme="${theme}"] block in main.css`).not.toBeNull()
    }
  })

  it('resolves prism to a hex through :root --color-accent', () => {
    // prism has no [data-theme] block, so --accent stays var(--color-accent)
    // from :root. getComputedStyle substitutes var() for custom properties, so
    // what the canvases actually read is whatever that resolves to -- it has to
    // bottom out in a hex or prism paints as Meridian.
    expect(themeAccent('prism')).toBeNull()
    const rootAccent = /--color-accent:\s*([^;]+);/.exec(css)
    expect(rootAccent?.[1].trim()).toMatch(HEX)
  })

  it('gives the six themes distinct accents', () => {
    // Two themes sharing an accent is not a crash, it is a theme that silently
    // does nothing to either canvas.
    const accents = ['void', 'neon', 'ember', 'frost', 'mono', 'meridian']
      .map((t) => themeAccent(t)?.toLowerCase())
    expect(new Set(accents).size).toBe(accents.length)
  })
})
