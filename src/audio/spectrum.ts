// Frequency-domain helpers for the orb's audio drivers.
// Author: gurvinny
//
// These were inline in AnomalySphere, which cannot be constructed without
// WebGL -- which is why none of this maths had ever been under test. As plain
// functions over a Uint8Array they need no AnalyserNode and no browser.

/** Bin index for `hz`, clamped into the array. */
export function freqToBin(hz: number, binCount: number, sampleRate: number): number {
  const bin = Math.round((hz * binCount * 2) / sampleRate)
  // Callers pass fixed musical frequencies against a sample rate the hardware
  // chooses, so a band edge above Nyquist is reachable in normal use. An
  // unclamped index reads undefined and quietly poisons the sum with NaN.
  return Math.min(binCount - 1, Math.max(0, bin))
}

/** Mean magnitude across `lo..hi` inclusive, normalised to 0..1. */
export function bandEnergy(freq: Uint8Array, lo: number, hi: number): number {
  let sum = 0
  for (let i = lo; i <= hi; i++) sum += freq[i] ?? 0
  return sum / ((hi - lo + 1) * 255)
}

/**
 * Mean *rising* magnitude across `lo..hi`, normalised to 0..1.
 *
 * Only rises count. A decaying note would otherwise read as a fresh onset and
 * fire the beat detector a second time as it faded.
 */
export function positiveFlux(freq: Uint8Array, prev: Uint8Array, lo: number, hi: number): number {
  let sum = 0
  for (let i = lo; i <= hi; i++) {
    const d = (freq[i] ?? 0) - (prev[i] ?? 0)
    if (d > 0) sum += d
  }
  return sum / ((hi - lo + 1) * 255)
}

/**
 * Energy-weighted centroid of `lo..hi`, in Hz.
 *
 * This is the answer to band drift. A fixed window reads a 35Hz sub-bass track
 * and a 180Hz bass-guitar track as near-silence, so the orb reacts to one song
 * and ignores the next. Following the centroid means "the low end" refers to
 * wherever this track actually put it.
 */
export function lowCentroidHz(freq: Uint8Array, lo: number, hi: number, binHz: number): number {
  let weighted = 0
  let total = 0
  for (let i = lo; i <= hi; i++) {
    const m = freq[i] ?? 0
    weighted += m * i
    total += m
  }
  // Silence has no centroid. Returning 0 would collapse the follow band onto DC
  // and leave the orb dead instead of idle, so hold the middle of the range
  // until there is something to weight.
  if (total === 0) return ((lo + hi) / 2) * binHz
  return (weighted / total) * binHz
}
