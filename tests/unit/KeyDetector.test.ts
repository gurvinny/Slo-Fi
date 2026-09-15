// Author: gurvinny
import { describe, it, expect } from 'vitest'
import { detectKey, NOTE_NAMES } from '../../src/audio/KeyDetector'
import { makeBuffer, chord, sine, pitchClassFreq } from '../helpers/audio'

/** Build a triad from pitch classes, doubled an octave up for a fuller chroma. */
function triad(root: number, thirdSemitones: number): Float32Array {
  const pcs = [root, (root + thirdSemitones) % 12, (root + 7) % 12]
  const freqs = [
    ...pcs.map((pc) => pitchClassFreq(pc, 3)),
    ...pcs.map((pc) => pitchClassFreq(pc, 4)),
  ]
  return chord(freqs, 4)
}

describe('NOTE_NAMES', () => {
  it('is twelve semitones starting at C', () => {
    expect(NOTE_NAMES).toHaveLength(12)
    expect(NOTE_NAMES[0]).toBe('C')
    expect(NOTE_NAMES[9]).toBe('A')
  })
})

describe('detectKey', () => {
  it('returns null for silence rather than a confident wrong answer', () => {
    expect(detectKey(makeBuffer([new Float32Array(44100 * 2)]) as AudioBuffer)).toBeNull()
  })

  it('returns null when the clip is shorter than one analysis frame', () => {
    // One frame is fftSize samples (~0.37s at 44.1 kHz); anything shorter
    // cannot produce a frame at all.
    expect(detectKey(makeBuffer([sine(440, 0.01)]) as AudioBuffer)).toBeNull()
  })

  it('always reports a root in range and a known mode', () => {
    const key = detectKey(makeBuffer([triad(0, 4)]) as AudioBuffer)
    expect(key).not.toBeNull()
    expect(key!.root).toBeGreaterThanOrEqual(0)
    expect(key!.root).toBeLessThan(12)
    expect(['Major', 'Minor']).toContain(key!.mode)
  })

  // This is the test the suite exists for. A detector that drifts a semitone
  // throws nothing and logs nothing -- users just quietly stop trusting the
  // readout. Every root is checked, because an off-by-one in the chroma
  // rotation would pass a single-key spot check.
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])(
    'identifies the root of a major triad on pitch class %i',
    (root) => {
      const key = detectKey(makeBuffer([triad(root, 4)]) as AudioBuffer)
      expect(key).not.toBeNull()
      expect(
        key!.root,
        `expected ${NOTE_NAMES[root]}, got ${NOTE_NAMES[key!.root]} ${key!.mode}`,
      ).toBe(root)
    },
  )

  it.each([0, 3, 7, 10])('identifies the root of a minor triad on pitch class %i', (root) => {
    const key = detectKey(makeBuffer([triad(root, 3)]) as AudioBuffer)
    expect(key).not.toBeNull()
    expect(
      key!.root,
      `expected ${NOTE_NAMES[root]}, got ${NOTE_NAMES[key!.root]} ${key!.mode}`,
    ).toBe(root)
  })

  it('distinguishes major from minor on the same root', () => {
    const major = detectKey(makeBuffer([triad(0, 4)]) as AudioBuffer)
    const minor = detectKey(makeBuffer([triad(0, 3)]) as AudioBuffer)
    expect(major!.mode).toBe('Major')
    expect(minor!.mode).toBe('Minor')
  })

  it('gives the same answer for stereo as for the mono mixdown', () => {
    const t = triad(5, 4)
    const mono = detectKey(makeBuffer([t]) as AudioBuffer)
    const stereo = detectKey(makeBuffer([t, t]) as AudioBuffer)
    expect(stereo).toEqual(mono)
  })

  // Accuracy used to depend on the sample rate, which was the clue that led to
  // the FFT resolution bug: 4096-point bins are wider than a semitone below
  // C4, so the bottom of the scan range smeared. A lower sample rate narrowed
  // the bins and scored better, which is backwards from what you would expect.
  it.each([22050, 44100, 48000])('identifies every major root at %i Hz', (sr) => {
    for (let root = 0; root < 12; root++) {
      const pcs = [root, (root + 4) % 12, (root + 7) % 12]
      const audio = chord(
        [...pcs.map((pc) => pitchClassFreq(pc, 3)), ...pcs.map((pc) => pitchClassFreq(pc, 4))],
        4,
        sr,
      )
      const key = detectKey(makeBuffer([audio], sr) as AudioBuffer)
      expect(
        key!.root,
        `at ${sr} Hz expected ${NOTE_NAMES[root]}, got ${NOTE_NAMES[key!.root]} ${key!.mode}`,
      ).toBe(root)
    }
  })
})
