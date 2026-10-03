// Author: gurvinny
//
// The index bookkeeping behind every playlist move and removal (#164). Expected
// values are written out by hand from the list as a person would read it,
// never derived by splicing an array here: a test that re-implements the move
// agrees with the bug it was written to catch.
import { describe, it, expect } from 'vitest'
import {
  currentAfterMove, metaAfterMove, metaAfterRemove, playNextTarget,
  keyboardMoveTarget, isFileDrag, audioFiles,
} from '../../src/ui/playlistOrder'

const entries = <T>(m: Map<number, T>) => [...m.entries()].sort((a, b) => a[0] - b[0])

describe('currentAfterMove', () => {
  // [a b C d e], C playing at 2.
  it('follows the playing track when it is the one moved', () => {
    expect(currentAfterMove(2, 2, 4)).toBe(4)
    expect(currentAfterMove(2, 2, 0)).toBe(0)
  })

  it('steps back when a track from before it moves past it', () => {
    expect(currentAfterMove(2, 0, 3)).toBe(1) // [b C d a e]
    expect(currentAfterMove(2, 1, 2)).toBe(1) // [a C b d e]: lands exactly on its slot
  })

  it('steps forward when a track from after it moves in front of it', () => {
    expect(currentAfterMove(2, 4, 0)).toBe(3) // [e a b C d]
    expect(currentAfterMove(2, 3, 2)).toBe(3) // [a b d C e]: lands exactly on its slot
  })

  it('stays put when the move happens entirely on one side of it', () => {
    expect(currentAfterMove(2, 0, 1)).toBe(2)
    expect(currentAfterMove(2, 4, 3)).toBe(2)
  })

  it('leaves "nothing playing" alone', () => {
    expect(currentAfterMove(-1, 0, 3)).toBe(-1)
  })
})

describe('metaAfterMove', () => {
  // Analysis exists for a(0), c(2) and e(4); b and d are still unanalysed.
  const meta = new Map([[0, 'a'], [2, 'c'], [4, 'e']])

  it('carries every entry with its track on a forward move', () => {
    // a to the end: [b c d e a]
    expect(entries(metaAfterMove(meta, 0, 4))).toEqual([[1, 'c'], [3, 'e'], [4, 'a']])
  })

  it('carries every entry with its track on a backward move', () => {
    // e to the front: [e a b c d]
    expect(entries(metaAfterMove(meta, 4, 0))).toEqual([[0, 'e'], [1, 'a'], [3, 'c']])
  })

  it('moves an unanalysed track without inventing or losing analysis', () => {
    // d (no entry) to the front: [d a b c e]
    expect(entries(metaAfterMove(meta, 3, 0))).toEqual([[1, 'a'], [3, 'c'], [4, 'e']])
  })

  it('does not mutate the map it was given', () => {
    metaAfterMove(meta, 0, 4)
    expect(entries(meta)).toEqual([[0, 'a'], [2, 'c'], [4, 'e']])
  })
})

describe('metaAfterRemove', () => {
  it('drops the removed entry and closes the gap behind it', () => {
    const meta = new Map([[0, 'a'], [1, 'b'], [3, 'd']])
    expect(entries(metaAfterRemove(meta, 1))).toEqual([[0, 'a'], [2, 'd']])
  })
})

describe('playNextTarget', () => {
  // [a B c d], B playing at 1. The answer is wherever the track has to land
  // to sit directly after B once it is lifted out.
  it('queues a later track straight after the current one', () => {
    expect(playNextTarget(3, 1, 4)).toBe(2) // [a B d c]
  })

  it('queues an earlier track into the slot the current one vacates', () => {
    // Lifting a shifts B to 0, so "after B" is index 1: [B a c d].
    expect(playNextTarget(0, 1, 4)).toBe(1)
  })

  it('queues after the first track when nothing is playing', () => {
    expect(playNextTarget(3, -1, 4)).toBe(1)
  })

  it('never points past the end of the list', () => {
    // Only the playing track itself, sitting last, asks for a slot past the
    // end: "after itself" is length. It has to stay put instead.
    expect(playNextTarget(3, 3, 4)).toBe(3)
    expect(playNextTarget(0, -1, 1)).toBe(0)
  })
})

describe('keyboardMoveTarget', () => {
  it('moves one slot when every row is visible', () => {
    const all = [true, true, true, true]
    expect(keyboardMoveTarget(1, -1, all)).toBe(0)
    expect(keyboardMoveTarget(1, 1, all)).toBe(2)
  })

  it('skips rows the search filter hides', () => {
    const shown = [true, false, false, true]
    expect(keyboardMoveTarget(0, 1, shown)).toBe(3)
    expect(keyboardMoveTarget(3, -1, shown)).toBe(0)
  })

  it('refuses to move past either end', () => {
    expect(keyboardMoveTarget(0, -1, [true, true])).toBe(-1)
    expect(keyboardMoveTarget(1, 1, [true, true])).toBe(-1)
    expect(keyboardMoveTarget(0, 1, [true, false])).toBe(-1)
  })
})

describe('drop classification', () => {
  const dt = (types: string[]) => ({ types }) as unknown as DataTransfer

  it('recognises a drag of files from the OS', () => {
    expect(isFileDrag(dt(['Files']))).toBe(true)
    expect(isFileDrag(dt(['application/x-moz-file', 'Files']))).toBe(true)
  })

  it('does not mistake a row being reordered for a file drop', () => {
    expect(isFileDrag(dt(['text/plain']))).toBe(false)
    expect(isFileDrag(null)).toBe(false)
  })

  it('keeps audio and untyped files and rejects everything else', () => {
    const f = (name: string, type: string) => new File(['x'], name, { type })
    const kept = audioFiles([f('a.mp3', 'audio/mpeg'), f('b.flac', ''), f('c.png', 'image/png'), f('d.txt', 'text/plain')])
    expect(kept.map((x) => x.name)).toEqual(['a.mp3', 'b.flac'])
  })
})
