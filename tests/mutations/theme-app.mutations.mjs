// Defects tests/dom/App.test.ts must catch.
// Author: gurvinny
//
// applyTheme is the call site the bug actually lived at: it set data-theme,
// recoloured the orb, redrew the waveform, and never told EffectsController the
// cascade had changed. The orb got away with it because it has a live rAF loop;
// the EQ canvas kept its last painted pixels.
//
// The second mutation regression-locks the line that always worked, because a
// test that only covers the newly added call would let the original one be
// deleted silently.
export const TARGET = 'src/ui/App.ts'
export const TESTS = 'tests/dom/App.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  ['applyTheme stops repainting the equalizer (the reported bug)',
   '      this.waveform.redraw()\n      this.effects.redrawCurve()',
   '      this.waveform.redraw()',
   'repaints the equalizer a frame after the theme changes'],

  ['applyTheme stops repainting the waveform',
   '      this.waveform.redraw()\n      this.effects.redrawCurve()',
   '      this.effects.redrawCurve()',
   'redraws the waveform a frame after the theme changes'],

  ['applyTheme skips the frame entirely, so both canvases read a stale cascade',
   '    requestAnimationFrame(() => {\n      this.waveform.redraw()\n      this.effects.redrawCurve()\n    })',
   '    void 0',
   'repaints the equalizer a frame after the theme changes'],
]

export const SURVIVORS = {}
