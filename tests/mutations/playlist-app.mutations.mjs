// Defects tests/dom/App.test.ts must catch in the playlist wiring (#164).
// Author: gurvinny
//
// src/ui/playlistOrder.ts is proven by its own catalogue. These cover the
// seam: App has to call it, keep the reorder and file-drop paths from
// answering each other's events, and give the reorder a non-drag route.
export const TARGET = 'src/ui/App.ts'
export const TESTS = 'tests/dom/App.test.ts'
export const CONFIG = 'vitest.dom.config.ts'

export const MUTATIONS = [
  // ── File drop ─────────────────────────────────────────────────────────────
  ['the window-level drop is never wired (only the landing dropzone takes files)',
   '    this.wireFileDrop()\n',
   '',
   'adds audio dropped anywhere on the page to the end of the playlist'],

  ['the window drop fires while a row is being reordered',
   "    window.addEventListener('drop', (e) => {\n      clearTarget()\n      if (this._dragIndex !== -1 || !isFileDrag(e.dataTransfer)) return",
   "    window.addEventListener('drop', (e) => {\n      clearTarget()\n      if (!isFileDrag(e.dataTransfer)) return",
   'ignores the window drop while a row is being reordered'],

  ['the landing dropzone adds the files itself as well (every track twice)',
   "    this.dropzone.addEventListener('drop', () => {\n      this.dropzone.classList.remove('drag-over')\n    })",
   "    this.dropzone.addEventListener('drop', (e) => {\n      this.dropzone.classList.remove('drag-over')\n      const f = (e as DragEvent).dataTransfer?.files\n      if (f) this.addFilesToPlaylist(Array.from(f))\n    })",
   'takes a drop on the landing dropzone exactly once'],

  ['a drop with no audio is swallowed silently',
   "      if (!audioFiles(Array.from(files)).length) {\n        this._toast.show({ message: 'That is not an audio file.', duration: 3000 })\n        return\n      }\n",
   '',
   'rejects a drop with no audio in it and says why'],

  ['the playlist highlight is not cleared by the drop',
   "    window.addEventListener('drop', (e) => {\n      clearTarget()\n",
   "    window.addEventListener('drop', (e) => {\n",
   'lights the playlist only while a file is over it, and clears on drop or leaving the window'],

  ['a row marks itself for a file dragged in from the OS',
   '        if (this._dragIndex < 0) return\n        e.preventDefault()\n        this.markDropRow(li, this._dragIndex, i)',
   '        e.preventDefault()\n        this.markDropRow(li, this._dragIndex, i)',
   'accepts a file dropped straight onto a row without treating it as a reorder'],

  // ── Drag reorder ──────────────────────────────────────────────────────────
  ['a cancelled drag leaves its marker stuck',
   '        this.clearDropMarkers()\n        this._dragIndex = -1\n      })',
   '        this._dragIndex = -1\n      })',
   'sweeps the marker when the drag is cancelled without leaving the row'],

  ['crossing onto a row\'s own children clears its marker',
   '        if (li.contains(e.relatedTarget as Node | null)) return\n',
   '',
   'keeps the marker while the pointer crosses onto the row\'s own children'],

  ['dragleave no longer clears the marker',
   "        li.classList.remove('drag-over', 'drag-over--after')\n      })",
   '      })',
   'marks the row being dragged and the row under the pointer'],

  ['a reorder leaves the metadata where it was',
   '    this._trackMeta = metaAfterMove(this._trackMeta, from, to)\n',
   '',
   'carries analysed metadata with the track it belongs to'],

  ['a removal leaves the metadata where it was',
   '    this._trackMeta = metaAfterRemove(this._trackMeta, index)\n',
   '',
   'shifts analysed metadata down with the tracks it belongs to'],

  ['a re-render drops the active search filter',
   '    this.applyPlaylistFilter()\n\n',
   '\n',
   'keeps the search filter applied after a reorder'],

  ['Play next goes back to the old base + 1 arithmetic',
   'this.reorderTrack(i, playNextTarget(i, this.currentTrackIndex, this.playlist.length))',
   'this.reorderTrack(i, Math.min(this.playlist.length - 1, Math.max(0, this.currentTrackIndex) + 1))',
   'queues an earlier track directly after the current one, not one past it'],

  // ── Keyboard and touch ────────────────────────────────────────────────────
  ['the handle has no accessible name',
   "      handle.setAttribute('aria-label', `Move ${file.name}`)\n",
   '',
   'gives every row a focusable, named reorder handle'],

  ['focus is lost when the track moves',
   "    this.playlistList.querySelectorAll<HTMLButtonElement>('.playlist-drag-handle')[to]?.focus()\n",
   '',
   'moves a track down with Alt+Down and keeps focus on it'],

  ['plain arrows reorder (Alt is not required)',
   "if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return",
   "if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return",
   'does nothing at the ends of the list or without Alt'],

  ['a keyboard move ignores the search filter',
   "rows.map((li) => li.style.display !== 'none')",
   'rows.map(() => true)',
   'steps over rows the search hides, and the filter survives the move'],

  ['pressing the handle also plays the track',
   "      handle.addEventListener('click', (e) => e.stopPropagation())\n",
   '',
   'does not start playback when the handle is pressed'],

  ['a finger on the handle also arms the long-press menu',
   "        if ((e.target as Element).closest?.('.playlist-drag-handle')) return\n",
   '',
   'does not open the long-press menu for a finger resting on the handle'],

  ['a cancelled touch drag still reorders',
   "if (e.type === 'pointerup' && over >= 0) this.reorderTrack(from, over)",
   'if (over >= 0) this.reorderTrack(from, over)',
   'abandons a touch reorder the browser cancels'],

  ['a mouse takes the touch path too and fights the native drag',
   "        if (e.pointerType === 'mouse') return\n",
   '',
   'leaves a mouse to the native drag on the row'],
]

export const SURVIVORS = {}
