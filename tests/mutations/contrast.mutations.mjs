// Defects tests/unit/contrast.test.ts must catch.
// Author: gurvinny
//
// The failure mode is a regression, not a bug: someone darkens a token to taste
// in a dark theme, it looks fine on their monitor, and the control dock drops
// back under the legibility floor. These assert the test notices.
export const TARGET = 'src/styles/main.css'
export const TESTS = 'tests/unit/contrast.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['the muted token is darkened back below the UI-component floor',
   '  --color-text-muted:   #66667e;',
   '  --color-text-muted:   #36364a;',
   'keeps the muted token above the UI-component floor'],

  ['the dim token is darkened back below the text floor',
   '  --color-text-dim:     #808098;',
   '  --color-text-dim:     #74748e;',
   'keeps the dim text token readable as text'],

  ['the control dock reverts to the decorative token',
   '  border-radius: 9px;\n  background: rgba(255, 255, 255, 0.03);\n  border: 1px solid rgba(255, 255, 255, 0.07);\n  color: var(--text-dim);',
   '  border-radius: 9px;\n  background: rgba(255, 255, 255, 0.03);\n  border: 1px solid rgba(255, 255, 255, 0.07);\n  color: var(--text-muted);',
   'renders .dock-btn as legible interactive text'],
]

export const SURVIVORS = {}
