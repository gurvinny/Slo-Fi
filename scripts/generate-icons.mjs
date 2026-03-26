// Generates rasterized PNG icon files required by the PWA maskable-icon audit.
// Lighthouse 11 explicitly rejects SVG for the maskable icon check, so these
// PNG files must exist at build time.  They are generated here rather than
// committed to the repo to keep binary blobs out of version control.
//
// Output:
//   public/icon-192.png              — 192px manifest entry (maskable)
//   public/icon-512.png              — 512px manifest entry
//   public/icons/apple-touch-icon.png — 180px iOS homescreen icon
//   public/icons/splash/splash-*.png  — iOS splash screens for major viewports
//
// All files are a solid #080810 square/rect (app background colour) which
// satisfies the maskable safe-zone requirement.  The SVG favicon is still used
// for browser tabs.
import { deflateSync } from 'zlib'
import fs from 'fs'

// CRC32 lookup table for PNG chunk checksums
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

function makeSolidPNG(size, r, g, b) {
  return makeSolidRectPNG(size, size, r, g, b)
}

function makeSolidRectPNG(w, h, r, g, b) {
  // Each row: 1 filter byte (0 = None) + RGB pixels
  const rowLen = 1 + w * 3
  const raw = Buffer.alloc(rowLen * h)
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0  // filter byte
    for (let x = 0; x < w; x++) {
      const off = y * rowLen + 1 + x * 3
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b
    }
  }

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// App background colour: #080810
const R = 0x08, G = 0x08, B = 0x10

fs.writeFileSync('public/icon-192.png', makeSolidPNG(192, R, G, B))
fs.writeFileSync('public/icon-512.png', makeSolidPNG(512, R, G, B))
console.log('generate-icons: icon-192.png and icon-512.png written to public/')

// iOS homescreen icon (180×180, required by Safari — manifest SVG is ignored)
fs.mkdirSync('public/icons', { recursive: true })
fs.writeFileSync('public/icons/apple-touch-icon.png', makeSolidPNG(180, R, G, B))
console.log('generate-icons: apple-touch-icon.png written to public/icons/')

// iOS splash screens — physical pixel dimensions (logical × DPR)
// Safari matches the <link rel="apple-touch-startup-image"> by media query.
fs.mkdirSync('public/icons/splash', { recursive: true })
const splashes = [
  [750,  1334],  // iPhone SE 3rd gen   (375×667  @2x)
  [1170, 2532],  // iPhone 14 / 15      (390×844  @3x)
  [1290, 2796],  // iPhone 14/15 Pro Max(430×932  @3x)
  [1640, 2360],  // iPad 10th gen       (820×1180 @2x)
  [2048, 2732],  // iPad Pro 12.9"      (1024×1366@2x)
]
for (const [w, h] of splashes) {
  fs.writeFileSync(`public/icons/splash/splash-${w}x${h}.png`, makeSolidRectPNG(w, h, R, G, B))
}
console.log(`generate-icons: ${splashes.length} splash screens written to public/icons/splash/`)
