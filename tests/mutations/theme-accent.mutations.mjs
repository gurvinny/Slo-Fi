// Defects tests/unit/theme-accent.test.ts must catch.
// Author: gurvinny
//
// The data half of the theme invariant. jsdom parses no stylesheet, so no dom
// test can say anything about the real palette -- getPropertyValue('--accent')
// is '' for every theme there and the canvases always paint their fallback.
// These assert that the values themselves are checked against the shipping CSS.
//
// Each of these is a plausible edit. Writing an accent as rgb() is ordinary
// CSS; it just happens to be unreadable to a positional hex parser, which then
// silently returns Meridian.
export const TARGET = 'src/styles/main.css'
export const TESTS = 'tests/unit/theme-accent.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['neon declares its accent in a form the canvases cannot parse',
   '  --accent:        #00ffcc;',
   '  --accent:        rgb(0, 255, 204);',
   'neon declares --accent as a hex the canvases can parse'],

  ['frost is given the same accent as neon, so the theme does nothing',
   '  --accent:        #66bbff;',
   '  --accent:        #00ffcc;',
   'gives the six themes distinct accents'],

  ['the mono palette is dropped while its chip stays in the page',
   '[data-theme="mono"] {',
   '[data-theme="mono-disabled"] {',
   'gives every chip in the page a palette'],

  ['prism falls through to a root accent that is not a hex',
   '  --color-accent:       #7c4dff;',
   '  --color-accent:       rebeccapurple;',
   'resolves prism to a hex through :root --color-accent'],
]

export const SURVIVORS = {}
