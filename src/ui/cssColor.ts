// Theme colour plumbing shared by every 2D canvas that follows the active
// theme. Both the waveform and the EQ curve read their colours out of the CSS
// cascade on each draw, and both have to cope with the minifier shortening a
// theme hex -- so the two helpers live here rather than being duplicated, and
// fixed, in one file at a time.

/** Reads a CSS custom property from :root. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Normalize a theme hex colour to 6-digit form. getComputedStyle returns custom
// properties as authored, and the CSS minifier shortens hexes where it can
// (#7733dd -> #73d), so a theme var may arrive 3-digit. Callers either append an
// alpha byte -- and '#73d' + '33' = '#73d33' is an invalid colour that throws in
// addColorStop -- or parse the pairs positionally, which reads a 3-digit hex as
// no colour at all. Non-hex values pass through unchanged.
export function normHex(color: string): string {
  const h = color.replace('#', '').trim()
  if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length >= 6)  return '#' + h.slice(0, 6)
  return color
}
