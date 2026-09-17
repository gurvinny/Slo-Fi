// Frequency-domain helpers for the orb's audio drivers.
// Author: gurvinny
//
// These were inline in AnomalySphere, which needs WebGL to instantiate -- so
// none of the signal maths had ever been tested. Pulled out as plain functions
// over a Uint8Array, they are testable in node with no AnalyserNode at all.
import { describe, it, expect } from 'vitest'
import { freqToBin, bandEnergy, positiveFlux, lowCentroidHz } from '../../src/audio/spectrum'

const SAMPLE_RATE = 48000

// Two resolutions, because the orb uses two analysers. Onsets need a short
// window (fftSize 2048 = 43ms) to land a ripple on the beat; the centroid needs
// a fine one (fftSize 8192 = 5.9Hz bins) to say WHERE a track keeps its low end.
// No single size does both -- 2048 puts the whole 20-250Hz range in 11 bins and
// lands 35Hz at bin 1.5, while 8192's 171ms window smears every transient.
// Each function is tested at the resolution it is actually fed in production.
const FAST_BINS = 1024
const FINE_BINS = 4096
const BINS = FAST_BINS

/** A spectrum with a gaussian bump of `peak` magnitude centred on `hz`. */
function bump(hz: number, peak = 255, width = 3, bins = BINS): Uint8Array {
  const out = new Uint8Array(bins)
  const centre = hz / (SAMPLE_RATE / 2 / bins)
  for (let i = 0; i < bins; i++) {
    out[i] = Math.round(peak * Math.exp(-((i - centre) ** 2) / (2 * width ** 2)))
  }
  return out
}

describe('freqToBin', () => {
  it('maps a frequency to its bin and stays inside the array', () => {
    expect(freqToBin(0, BINS, SAMPLE_RATE)).toBe(0)
    expect(freqToBin(SAMPLE_RATE / 2, BINS, SAMPLE_RATE)).toBe(BINS - 1)
    // Nothing upstream guarantees the caller asks for a representable
    // frequency, and an out-of-range index silently reads undefined.
    expect(freqToBin(SAMPLE_RATE, BINS, SAMPLE_RATE)).toBe(BINS - 1)
    expect(freqToBin(-100, BINS, SAMPLE_RATE)).toBe(0)
  })
})

describe('bandEnergy', () => {
  it('is 1 for a saturated band and 0 for silence', () => {
    expect(bandEnergy(new Uint8Array(BINS).fill(255), 10, 20)).toBeCloseTo(1, 6)
    expect(bandEnergy(new Uint8Array(BINS), 10, 20)).toBe(0)
  })

  it('ignores energy outside the band it was asked about', () => {
    const spectrum = bump(100)
    const atPeak = bandEnergy(spectrum, freqToBin(90, BINS, SAMPLE_RATE), freqToBin(110, BINS, SAMPLE_RATE))
    const elsewhere = bandEnergy(spectrum, freqToBin(8000, BINS, SAMPLE_RATE), freqToBin(9000, BINS, SAMPLE_RATE))
    expect(atPeak).toBeGreaterThan(0.5)
    expect(elsewhere).toBeCloseTo(0, 3)
  })
})

describe('positiveFlux', () => {
  it('reports rising energy and ignores falling energy', () => {
    const quiet = new Uint8Array(BINS).fill(10)
    const loud = new Uint8Array(BINS).fill(200)
    // Onsets are rises. A decaying note must not read as a new hit, or every
    // note end fires the beat detector a second time.
    expect(positiveFlux(loud, quiet, 10, 20)).toBeGreaterThan(0)
    expect(positiveFlux(quiet, loud, 10, 20)).toBe(0)
    expect(positiveFlux(loud, loud, 10, 20)).toBe(0)
  })
})

describe('lowCentroidHz', () => {
  // This is the fix for band drift: every track puts its low end somewhere
  // different, so a fixed 40-150Hz window reads a strong 35Hz sub as silence
  // and a 180Hz bass guitar as silence too.
  const fineHz = SAMPLE_RATE / 2 / FINE_BINS
  const lo = freqToBin(20, FINE_BINS, SAMPLE_RATE)
  const hi = freqToBin(250, FINE_BINS, SAMPLE_RATE)

  it.each([35, 60, 90, 180])('finds where the low end actually sits (%i Hz)', (hz) => {
    const spectrum = bump(hz, 255, 3, FINE_BINS)
    expect(lowCentroidHz(spectrum, lo, hi, fineHz)).toBeCloseTo(hz, -1)
  })

  it('distinguishes two tracks that put their bass in different places', () => {
    // The actual complaint this fixes: a fixed window reads one of these as
    // silence. The centroid must separate them by more than the width of the
    // band a fixed implementation would have used.
    const sub = lowCentroidHz(bump(35, 255, 3, FINE_BINS), lo, hi, fineHz)
    const bass = lowCentroidHz(bump(180, 255, 3, FINE_BINS), lo, hi, fineHz)
    expect(bass - sub).toBeGreaterThan(100)
  })

  it('falls back to the middle of the range when there is no energy at all', () => {
    // Silence has no centroid. Returning 0 would collapse the follow band onto
    // DC and the orb would go dead rather than idle.
    const quiet = lowCentroidHz(new Uint8Array(FINE_BINS), lo, hi, fineHz)
    expect(quiet).toBeGreaterThan(20)
    expect(quiet).toBeLessThan(250)
  })
})
