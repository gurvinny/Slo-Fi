// Defects tests/dom/EffectsController.test.ts must catch.
// Author: gurvinny
//
// The reported bug was "the equalizer stays Meridian-coloured on every theme",
// and it had two independent causes. This catalogue covers the reading half:
// the accent must be re-read on every repaint, and it must be parsed in every
// form the stylesheet can legally arrive in.
//
// Both readers fall back to '180,255,0', which IS Meridian's accent -- so any
// failure to read lands on the exact colour the user reported being stuck on.
// That makes the fallback the most dangerous line in the file: it disguises a
// parse failure as a theme.
export const TARGET = 'src/ui/EffectsController.ts'
export const TESTS = 'tests/dom/EffectsController.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  ['the accent is read once and cached instead of per draw',
   '    const accentRgb = this._getAccentRGB()',
   '    const accentRgb = ((this)._cachedAccent ??= this._getAccentRGB())',
   'picks up a new accent on the next repaint and drops the old one'],

  ['normHex is dropped, so a minified 3-digit theme hex becomes the Meridian fallback',
   "    const accent = normHex(cssVar('--accent'))\n    if (accent.startsWith('#')) {\n      const hex = accent.slice(1)\n      if (hex.length === 6) {\n        const r = parseInt",
   "    const accent = cssVar('--accent')\n    if (accent.startsWith('#')) {\n      const hex = accent.slice(1)\n      if (hex.length === 6) {\n        const r = parseInt",
   'expands a minified 3-digit theme hex instead of falling back'],

  // The anchor carries the signature, not just the read: the identical read
  // line appears in _getComplementaryRGB too, and the runner correctly refused
  // a 2-match anchor rather than mutating whichever one it found first.
  ['_getAccentRGB is pinned to its fallback, so every theme paints Meridian',
   "  private _getAccentRGB(): string {\n    // normHex expands a minified 3-digit theme hex; without it the positional\n    // slices below read #b4f as no colour and every theme painted the fallback.\n    const accent = normHex(cssVar('--accent'))",
   "  private _getAccentRGB(): string {\n    const accent = ''",
   'repaints the curve in the current accent when asked'],

  ['redrawCurve stops drawing',
   '  redrawCurve(): void {\n    this._drawEQCurve()',
   '  redrawCurve(): void {\n    if (false) this._drawEQCurve()',
   'repaints the curve in the current accent when asked'],
]

export const SURVIVORS = {}
