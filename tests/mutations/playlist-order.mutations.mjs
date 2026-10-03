// Defects tests/unit/playlistOrder.test.ts must catch (#164).
// Author: gurvinny
//
// Every one of these still renders a full, plausible playlist. The damage is a
// highlight on the wrong row, one track's BPM shown on another, or a queued
// track landing one slot late, none of which anyone notices until they are
// listening for it.
export const TARGET = 'src/ui/playlistOrder.ts'
export const TESTS = 'tests/unit/playlistOrder.test.ts'
export const CONFIG = 'vitest.config.ts'

export const MUTATIONS = [
  ['a backward move landing on the current slot is off by one',
   'if (from > current && to <= current) return current + 1',
   'if (from > current && to < current) return current + 1',
   'steps forward when a track from after it moves in front of it'],

  ['a forward move landing on the current slot is off by one',
   'if (from < current && to >= current) return current - 1',
   'if (from < current && to > current) return current - 1',
   'steps back when a track from before it moves past it'],

  ['the moved track does not take the current highlight with it',
   'if (current === from) return to',
   'if (current === from) return current',
   'follows the playing track when it is the one moved'],

  ['the metadata re-index is skipped on a move',
   'meta.forEach((v, k) => out.set(currentAfterMove(k, from, to), v))',
   'meta.forEach((v, k) => out.set(k, v))',
   'carries every entry with its track on a forward move'],

  ['a removal keeps the removed track\'s analysis',
   '    else if (k > index) out.set(k - 1, v)',
   '    else out.set(k - 1, v)',
   'drops the removed entry and closes the gap behind it'],

  ['play-next from before the current track lands one slot late',
   'const to = index < base ? base : base + 1',
   'const to = base + 1',
   'queues an earlier track into the slot the current one vacates'],

  ['play-next is not clamped to the list',
   'return Math.min(length - 1, to)',
   'return to',
   'never points past the end of the list'],

  ['a keyboard move swaps with a row the search hides',
   '    if (visible[k]) return k',
   '    return k',
   'skips rows the search filter hides'],

  ['a keyboard move at the end of the list does not refuse',
   '  }\n  return -1\n}',
   '  }\n  return index\n}',
   'refuses to move past either end'],

  ['a row being reordered is mistaken for a file drop',
   "Array.from(dt.types ?? []).includes('Files')",
   'Array.from(dt.types ?? []).length > 0',
   'does not mistake a row being reordered for a file drop'],

  ['a drop accepts a non-audio MIME type',
   "files.filter((f) => !f.type || f.type.startsWith('audio/'))",
   'files.filter((f) => !!f)',
   'keeps audio and untyped files and rejects everything else'],
]

export const SURVIVORS = {}
