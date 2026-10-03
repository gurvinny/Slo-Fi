// Playlist index bookkeeping, kept out of App so it can be proven directly.
// Author: gurvinny
//
// App keys per-track analysis (_trackMeta) and the playing track
// (currentTrackIndex) by POSITION, so every move or removal has to carry both
// along with the File it belongs to. Getting either wrong is silent: the list
// still renders, just with one track's BPM on another's row, or the highlight
// on a track that is not playing.

/** Where the playing track sits after the track at `from` moves to `to`. */
export function currentAfterMove(current: number, from: number, to: number): number {
  if (current === from) return to
  if (from < current && to >= current) return current - 1
  if (from > current && to <= current) return current + 1
  return current
}

/** Re-key `meta` so every entry follows its track through a move. */
export function metaAfterMove<T>(meta: ReadonlyMap<number, T>, from: number, to: number): Map<number, T> {
  const out = new Map<number, T>()
  meta.forEach((v, k) => out.set(currentAfterMove(k, from, to), v))
  return out
}

/** Re-key `meta` after the track at `index` is removed; its own entry is dropped. */
export function metaAfterRemove<T>(meta: ReadonlyMap<number, T>, index: number): Map<number, T> {
  const out = new Map<number, T>()
  meta.forEach((v, k) => {
    if (k < index) out.set(k, v)
    else if (k > index) out.set(k - 1, v)
  })
  return out
}

/**
 * The destination that queues the track at `index` to play right after the
 * current one. A track BEFORE the current one shifts it up a slot when lifted,
 * so "after current" is the current slot itself, not the one past it.
 */
export function playNextTarget(index: number, current: number, length: number): number {
  const base = current < 0 ? 0 : current
  const to = index < base ? base : base + 1
  return Math.min(length - 1, to)
}

/**
 * The neighbour a keyboard move should land on: the nearest position in
 * `direction` that is still visible. While the search box hides rows, moving
 * by one raw index would swap with a hidden track and look like nothing
 * happened. Returns -1 at either end.
 */
export function keyboardMoveTarget(index: number, direction: -1 | 1, visible: readonly boolean[]): number {
  for (let k = index + direction; k >= 0 && k < visible.length; k += direction) {
    if (visible[k]) return k
  }
  return -1
}

/** True for a drag carrying files from the OS, as opposed to a row being reordered. */
export function isFileDrag(dt: DataTransfer | null | undefined): boolean {
  return !!dt && Array.from(dt.types ?? []).includes('Files')
}

/** The audio subset of a drop. An empty type is let through: some OSes report none for .flac/.opus. */
export function audioFiles(files: readonly File[]): File[] {
  return files.filter((f) => !f.type || f.type.startsWith('audio/'))
}
