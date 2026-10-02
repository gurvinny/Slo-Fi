// Defects tests/dom/chrome.test.ts must catch.
// Author: gurvinny
//
// These numbers bound every flyout panel. A wrong one does not throw or log; a
// panel just slides under the HUD, over the waveform, or collapses, and only on
// the layouts where the chrome differs from the one the author was looking at.
export const TARGET = 'src/ui/chrome.ts'
export const TESTS = 'tests/dom/chrome.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  ['the top bound reads the HUD height instead of its bottom edge (ignores the header above it)',
   'const top = hudBox ? Math.round(hudBox.bottom) : 0',
   'const top = hudBox ? Math.round(hudBox.height) : 0',
   'reads the top bound from the HUD bottom edge, not its height'],

  ['the dock is never cleared, so a narrow window covers it',
   'bottom: Math.max(barH, dockReach)',
   'bottom: barH',
   'raises the bottom bound to clear the dock when a panel shares its columns'],

  ['the dock is always cleared, costing every wide-window panel its height',
   'const dockReach = dockInTheWay ? Math.round',
   'const dockReach = dockBox ? Math.round',
   'leaves the dock out when it sits between the panels'],

  ['the column overlap test is one-sided',
   'b.left < dockBox.right && dockBox.left < b.right',
   'b.left < dockBox.right',
   'leaves the dock out when it sits between the panels'],

  ['the overlap test turns non-strict, so a display:none dock at the origin counts as in the way',
   'b.left < dockBox.right && dockBox.left < b.right',
   'b.left <= dockBox.right && dockBox.left <= b.right',
   'ignores a hidden dock instead of reading its zero rect as a box at the origin'],

  ['an unchanged value is rewritten (repaints every backdrop-filter layer)',
   '      if (this.written.get(name) === value) continue\n',
   '',
   'writes nothing when a measurement repeats'],

  ['an unmeasured zero overwrites the stylesheet fallback',
   '      if (px <= 0) continue\n',
   '',
   'leaves the stylesheet fallback alone while the chrome is unmeasured'],
]

export const SURVIVORS = {}
