// Defects tests/dom/App.test.ts must catch in the player chrome wiring (#163).
// Author: gurvinny
//
// src/ui/chrome.ts is proven by its own catalogue. These cover the seam: App
// has to feed it the right elements and call it at the right times, and the
// desktop Help route has to stay wired once the corner button is hidden there.
export const TARGET = 'src/ui/App.ts'
export const TESTS = 'tests/dom/App.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  ['the dock Help button is no longer wired (desktop loses its only visible route)',
   "    document.querySelectorAll<HTMLElement>('[data-help]').forEach((btn) =>\n      btn.addEventListener('click', () => this.helpModal.showModal()))\n",
   '',
   'opens from the control dock Help button, the desktop route'],

  ['the HUD is not passed in, so panels lose their top bound',
   '      this._playerTop, this._playerBottom, this._controlDock,',
   '      null, this._playerBottom, this._controlDock,',
   'publishes the measured chrome as the panel bounds'],

  ['the chrome is not observed, so only a window resize re-measures it',
   '    for (const el of [this._playerTop, this._playerBottom, this._controlDock]) if (el) ro.observe(el)\n',
   '',
   're-measures when the chrome changes size, without a panel being opened'],
]

export const SURVIVORS = {}
