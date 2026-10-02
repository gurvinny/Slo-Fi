// Track-time formatting shared by the transport readout, the playlist rows and
// the track meta line.
// Author: gurvinny

const pad = (n: number): string => n.toString().padStart(2, '0')

/**
 * `mm:ss` below an hour, `h:mm:ss` from one hour up. Minutes are zero-padded so
 * the readout holds a fixed width as it counts. A value that is not a finite,
 * non-negative number (an undecoded buffer, an overshooting seek) reads as zero.
 */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}
