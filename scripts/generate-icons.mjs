// Generates rasterized PNG icon files required by the PWA maskable-icon audit.
// Lighthouse 11 explicitly rejects SVG for the maskable icon check, so these
// PNG files must exist at build time. They are generated here rather than
// committed to the repo to keep binary blobs out of version control.
//
// Output:
//   public/icon-192.png               — 192px manifest entry (maskable, with mark)
//   public/icon-512.png               — 512px manifest entry (with mark)
//   public/icons/apple-touch-icon.png — 180px iOS homescreen icon (with mark)
//   public/icons/splash/splash-*.png  — iOS splash screens (solid bg, no mark needed)
//
// Uses `sharp` to composite the SVG mark over the dark background for the
// three icon sizes. Splash screens stay solid-fill (launch screens, not icons).
import { deflateSync } from 'zlib'
import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const sharp = require('sharp')

// ── Solid PNG encoder (used for splash screens only) ─────────────────────

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[i] = c
}

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const len = Buffer.allocUnsafe(4)
  len.writeUInt32BE(d.length)
  const crcBuf = Buffer.allocUnsafe(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])))
  return Buffer.concat([len, t, d, crcBuf])
}

function makeSolidRectPNG(w, h, r, g, b) {
  const rowLen = 1 + w * 3
  const raw = Buffer.alloc(rowLen * h)
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0
    for (let x = 0; x < w; x++) {
      const off = y * rowLen + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── SVG mark → PNG compositor ────────────────────────────────────────────

// Builds an SVG string for the icon at the given canvas size.
// The mark occupies 70% of the canvas (maskable safe-zone: 80%, mark at 70%).
function buildMarkSvg(canvasSize) {
  const markSize = Math.round(canvasSize * 0.70)
  const offset = Math.round((canvasSize - markSize) / 2)
  // Scale the mark from its 32×32 viewBox to markSize px
  const scale = markSize / 32
  // Hexagon points scaled and offset
  const pts = [
    [16, 2], [28, 9], [28, 23], [16, 30], [4, 23], [4, 9]
  ].map(([x, y]) => `${offset + x * scale},${offset + y * scale}`).join(' ')
  const innerPts = [
    [16, 8], [22, 11.5], [22, 18.5], [16, 22], [10, 18.5], [10, 11.5]
  ].map(([x, y]) => `${offset + x * scale},${offset + y * scale}`).join(' ')
  const sw = scale * 1.5   // stroke-width
  const bsw = scale * 1.6  // bar stroke-width
  // Bar coordinates
  const bx1 = offset + 12 * scale, bx2 = offset + 16 * scale, bx3 = offset + 20 * scale
  const by1s = offset + 20 * scale, by1e = offset + 15 * scale
  const by2e = offset + 12 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}">
  <rect width="${canvasSize}" height="${canvasSize}" rx="${Math.round(canvasSize * 0.18)}" fill="#020208"/>
  <polygon points="${pts}" fill="#7c4dff" fill-opacity="0.10" stroke="#7c4dff" stroke-width="${sw}"/>
  <polygon points="${innerPts}" stroke="#7c4dff" stroke-width="${sw * 0.55}" fill="none" opacity="0.4"/>
  <line x1="${bx1}" y1="${by1s}" x2="${bx1}" y2="${by1e}" stroke="#7c4dff" stroke-width="${bsw}" stroke-linecap="round"/>
  <line x1="${bx2}" y1="${by1s}" x2="${bx2}" y2="${by2e}" stroke="#7c4dff" stroke-width="${bsw}" stroke-linecap="round"/>
  <line x1="${bx3}" y1="${by1s}" x2="${bx3}" y2="${by1e}" stroke="#7c4dff" stroke-width="${bsw}" stroke-linecap="round"/>
</svg>`
}

async function writeIconPng(outPath, size) {
  const svgBuf = Buffer.from(buildMarkSvg(size))
  await sharp(svgBuf).png().toFile(outPath)
}

// ── Generate all icons ───────────────────────────────────────────────────

// App background colour (brand dark): #020208
const R = 0x02, G = 0x02, B = 0x08

await writeIconPng('public/icon-192.png', 192)
await writeIconPng('public/icon-512.png', 512)
console.log('generate-icons: icon-192.png and icon-512.png written to public/')

fs.mkdirSync('public/icons', { recursive: true })
await writeIconPng('public/icons/apple-touch-icon.png', 180)
console.log('generate-icons: apple-touch-icon.png written to public/icons/')

// iOS splash screens — solid bg, no mark (launch screens, not app icons)
fs.mkdirSync('public/icons/splash', { recursive: true })
const splashes = [
  [750,  1334],
  [1170, 2532],
  [1290, 2796],
  [1640, 2360],
  [2048, 2732],
]
for (const [w, h] of splashes) {
  fs.writeFileSync(`public/icons/splash/splash-${w}x${h}.png`, makeSolidRectPNG(w, h, R, G, B))
}
console.log(`generate-icons: ${splashes.length} splash screens written to public/icons/splash/`)
