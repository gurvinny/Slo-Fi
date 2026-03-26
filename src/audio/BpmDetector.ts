// Energy-based autocorrelation BPM detector.
// Analyses the raw audio buffer once on load — no streaming required.
// Returns the detected BPM (40–200 range), or 0 if detection fails.
export function detectBpm(buffer: AudioBuffer): number {
  const srcRate = buffer.sampleRate

  // Mix down to mono
  const ch0 = buffer.getChannelData(0)
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
  const mono = ch1
    ? Float32Array.from({ length: ch0.length }, (_, i) => (ch0[i] + ch1[i]) * 0.5)
    : ch0

  // Downsample to ~11 kHz to keep autocorrelation fast
  const targetRate = 11025
  const step = Math.max(1, Math.round(srcRate / targetRate))
  const dsLen = Math.floor(mono.length / step)
  const ds = new Float32Array(dsLen)
  for (let i = 0; i < dsLen; i++) ds[i] = mono[i * step]
  const dsRate = srcRate / step

  // Compute RMS energy in 10 ms frames
  const frameSize = Math.round(dsRate * 0.01)
  const numFrames = Math.floor(dsLen / frameSize)
  if (numFrames < 20) return 0

  const energy = new Float32Array(numFrames)
  for (let f = 0; f < numFrames; f++) {
    let sum = 0
    const base = f * frameSize
    for (let i = 0; i < frameSize; i++) {
      const s = ds[base + i]
      sum += s * s
    }
    energy[f] = Math.sqrt(sum / frameSize)
  }

  // Check the track isn't silence
  let maxE = 0
  for (let f = 0; f < numFrames; f++) if (energy[f] > maxE) maxE = energy[f]
  if (maxE < 1e-4) return 0

  // Half-wave rectified energy derivative — onset strength signal
  const onset = new Float32Array(numFrames)
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1]
    onset[f] = diff > 0 ? diff : 0
  }

  // Lag range for 40–200 BPM in frames (at 10 ms per frame)
  // BPM = 60 / (lag * 0.01)  →  lag = 60 / (BPM * 0.01)
  const lagMin = Math.round(60 / (200 * 0.01))  // ~30 frames
  const lagMax = Math.round(60 / (40 * 0.01))   // ~150 frames

  // Autocorrelate onset signal over the tempo lag range
  let bestLag = lagMin
  let bestCorr = -Infinity
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let corr = 0
    const limit = numFrames - lag
    for (let f = 0; f < limit; f++) corr += onset[f] * onset[f + lag]
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
  }

  const bpm = 60 / (bestLag * 0.01)
  return Math.round(bpm)
}
