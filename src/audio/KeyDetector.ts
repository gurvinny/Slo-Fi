// Chromagram-based key detector using the Krumhansl-Schmuckler algorithm.
// Analyses the raw audio buffer once on load — no streaming required.
// Returns { root, mode } where root is 0–11 (C=0), or null if detection fails.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export interface DetectedKey { root: number; mode: string }

// Krumhansl-Schmuckler key profiles (index 0 = root note of the key)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t
      t = im[i]; im[i] = im[j]; im[j] = t
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1
    const wStep = -2 * Math.PI / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const angle = wStep * k
        const cos = Math.cos(angle), sin = Math.sin(angle)
        const tr = cos * re[i + k + half] - sin * im[i + k + half]
        const ti = sin * re[i + k + half] + cos * im[i + k + half]
        re[i + k + half] = re[i + k] - tr
        im[i + k + half] = im[i + k] - ti
        re[i + k] += tr
        im[i + k] += ti
      }
    }
  }
}

function correlate(chroma: Float64Array, profile: number[]): number {
  let sumX = 0, sumY = 0
  for (let i = 0; i < 12; i++) { sumX += chroma[i]; sumY += profile[i] }
  const meanX = sumX / 12, meanY = sumY / 12
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < 12; i++) {
    const dx = chroma[i] - meanX, dy = profile[i] - meanY
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy
  }
  return dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2)
}

export function detectKey(buffer: AudioBuffer): DetectedKey | null {
  const srcRate = buffer.sampleRate
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
  const mono = ch1
    ? Float32Array.from({ length: ch0.length }, (_, i) => (ch0[i] + ch1[i]) * 0.5)
    : ch0

  const fftSize = 4096
  const chroma = new Float64Array(12)

  // Sample up to 20 frames evenly spaced through the track
  const hopSamples = Math.max(fftSize, Math.floor(mono.length / 20))
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)

  // Frequency bin range: C2 (~65 Hz) to B6 (~1976 Hz)
  const binMin = Math.ceil(65 * fftSize / srcRate)
  const binMax = Math.floor(1976 * fftSize / srcRate)

  let framesProcessed = 0
  for (let offset = 0; offset + fftSize <= mono.length; offset += hopSamples) {
    for (let i = 0; i < fftSize; i++) {
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)))
      re[i] = mono[offset + i] * w
      im[i] = 0
    }
    fft(re, im)
    for (let bin = binMin; bin <= Math.min(binMax, fftSize / 2); bin++) {
      const f = bin * srcRate / fftSize
      const midi = 12 * Math.log2(f / 440) + 69
      const pc = ((Math.round(midi) % 12) + 12) % 12
      chroma[pc] += Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin])
    }
    framesProcessed++
  }

  if (framesProcessed === 0) return null

  let maxC = 0
  for (let i = 0; i < 12; i++) if (chroma[i] > maxC) maxC = chroma[i]
  if (maxC < 1e-6) return null
  for (let i = 0; i < 12; i++) chroma[i] /= maxC

  let bestScore = -Infinity
  let bestRoot = 0
  let bestMode = 'Major'
  const rotated = new Float64Array(12)

  for (let root = 0; root < 12; root++) {
    for (let i = 0; i < 12; i++) rotated[i] = chroma[(i + root) % 12]
    const majScore = correlate(rotated, MAJOR_PROFILE)
    const minScore = correlate(rotated, MINOR_PROFILE)
    if (majScore > bestScore) { bestScore = majScore; bestRoot = root; bestMode = 'Major' }
    if (minScore > bestScore) { bestScore = minScore; bestRoot = root; bestMode = 'Minor' }
  }

  return { root: bestRoot, mode: bestMode }
}
