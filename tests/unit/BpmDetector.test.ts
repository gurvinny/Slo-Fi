// Author: gurvinny
import { describe, it, expect } from 'vitest'
import { detectBpm } from '../../src/audio/BpmDetector'
import { makeBuffer, clickTrack, sine } from '../helpers/audio'

describe('detectBpm', () => {
  // The detector quantises to whole 10 ms frames, so the reachable tempi are
  // 60/(n*0.01). Near 120 BPM the neighbouring lags are 115.4 and 125, which
  // is why this asserts a tolerance rather than an exact value.
  it.each([90, 100, 120, 140])('recovers a %i BPM click track', (bpm) => {
    const detected = detectBpm(makeBuffer([clickTrack(bpm, 12)]) as AudioBuffer)
    expect(Math.abs(detected - bpm)).toBeLessThanOrEqual(6)
  })

  it('stays inside the 40-200 range it documents', () => {
    for (const bpm of [45, 75, 150, 190]) {
      const detected = detectBpm(makeBuffer([clickTrack(bpm, 12)]) as AudioBuffer)
      expect(detected).toBeGreaterThanOrEqual(40)
      expect(detected).toBeLessThanOrEqual(200)
    }
  })

  it('returns 0 for silence rather than guessing', () => {
    const silence = new Float32Array(44100 * 5)
    expect(detectBpm(makeBuffer([silence]) as AudioBuffer)).toBe(0)
  })

  it('returns 0 when the clip is too short to analyse', () => {
    // Fewer than 20 energy frames -- under ~0.2s of audio.
    expect(detectBpm(makeBuffer([sine(440, 0.05)]) as AudioBuffer)).toBe(0)
  })

  it('treats a stereo buffer the same as its mono mixdown', () => {
    const track = clickTrack(120, 12)
    const mono = detectBpm(makeBuffer([track]) as AudioBuffer)
    const stereo = detectBpm(makeBuffer([track, track]) as AudioBuffer)
    expect(stereo).toBe(mono)
  })

  it('is not biased toward high tempi (regression: 38813f4)', () => {
    // Autocorrelation at shorter lags accumulates more products simply because
    // more frames overlap. Without dividing by that overlap count the detector
    // drifts upward, and a slow track reads fast. This is the bug 38813f4
    // fixed, and it fails silently -- nothing throws, the number is just wrong.
    const slow = detectBpm(makeBuffer([clickTrack(70, 16)]) as AudioBuffer)
    expect(slow).toBeLessThan(100)
    expect(Math.abs(slow - 70)).toBeLessThanOrEqual(6)
  })

  it('does not report a harmonic instead of the fundamental', () => {
    // Half- and double-time are the classic failure: 75 must not read as 150.
    const detected = detectBpm(makeBuffer([clickTrack(75, 16)]) as AudioBuffer)
    expect(Math.abs(detected - 150)).toBeGreaterThan(10)
  })
})
