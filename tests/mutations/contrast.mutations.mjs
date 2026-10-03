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

  ['the transport deck base colour drops to the border token',
   '  border-radius: 50%;\n  cursor: pointer;\n  color: var(--text-dim);',
   '  border-radius: 50%;\n  cursor: pointer;\n  color: var(--color-border);',
   'renders the transport deck control .btn above the UI-component floor in every theme'],

  ['an icon button fades out under the pointer',
   '.btn-icon:hover {\n  background: rgba(124, 77, 255, 0.08);\n  border-color: rgba(124, 77, 255, 0.28);\n  color: var(--accent-bright);',
   '.btn-icon:hover {\n  background: rgba(124, 77, 255, 0.08);\n  border-color: rgba(124, 77, 255, 0.28);\n  color: var(--color-border);',
   'renders the transport deck control .btn-icon:hover above the UI-component floor in every theme'],

  ['the engaged loop button loses its glyph',
   '.btn-loop--active {\n  border-color: var(--accent);\n  color: var(--accent-bright);',
   '.btn-loop--active {\n  border-color: var(--accent);\n  color: var(--color-border);',
   'renders the transport deck control .btn-loop--active above the UI-component floor in every theme'],

  ['the bottom nav labels revert to the muted token',
   '    border: 0;\n    color: var(--text-dim);',
   '    border: 0;\n    color: var(--text-muted);',
   'renders the bottom nav tab .nav-tab as legible text in every theme'],

  ['the Void theme accent reverts below the text floor (only one theme fails)',
   '  --accent-bright: #7b5cff;',
   '  --accent-bright: #7755ff;',
   'renders the bottom nav tab .nav-tab.panel-trigger--active as legible text in every theme'],
]

export const SURVIVORS = {}
