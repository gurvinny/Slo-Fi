// Author: gurvinny
import { describe, it, expect } from 'vitest'
import { buildIR } from '../../src/audio/AudioEngine'
import { fakeContext } from '../helpers/audio'
import type { ReverbType } from '../../src/types'

const TYPES: ReverbType[] = ['room', 'hall', 'plate', 'church', 'chamber', 'spring']

/** Mean square energy of a slice, as a stand-in for "how loud is it here". */
function energy(d: Float32Array, from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += d[i] * d[i]
  return sum / Math.max(1, to - from)
}

describe('buildIR', () => {
  it.each(TYPES)('builds a stereo impulse response for %s', (type) => {
    const ctx = fakeContext()
    const ir = buildIR(ctx as unknown as BaseAudioContext, type, 2, 0.02, 0.5)
    expect(ir.numberOfChannels).toBe(2)
    expect(ir.length).toBe(Math.floor(44100 * 0.02) + Math.floor(44100 * 2))
  })

  it('leaves the pre-delay gap silent', () => {
    const ctx = fakeContext()
    const preDelay = 0.03
    const ir = buildIR(ctx as unknown as BaseAudioContext, 'hall', 2, preDelay, 0.5)
    const gap = Math.floor(44100 * preDelay)
    const d = ir.getChannelData(0)
    for (let i = 0; i < gap; i++) expect(d[i]).toBe(0)
    // ...and the tail immediately after it is not silent.
    expect(energy(d, gap, gap + 1000)).toBeGreaterThan(0)
  })

  it.each(TYPES)('decays monotonically over the tail for %s', (type) => {
    const ctx = fakeContext()
    const ir = buildIR(ctx as unknown as BaseAudioContext, type, 3, 0, 0.3)
    const d = ir.getChannelData(0)
    const win = Math.floor(d.length / 6)
    // Compare the first window against the last: an envelope that does not
    // fall is a reverb that never ends.
    expect(energy(d, 0, win)).toBeGreaterThan(energy(d, d.length - win, d.length))
  })

  it('gives the two channels different noise, so the tail is not mono', () => {
    const ctx = fakeContext()
    const ir = buildIR(ctx as unknown as BaseAudioContext, 'hall', 2, 0, 0.4)
    const l = ir.getChannelData(0)
    const r = ir.getChannelData(1)
    let identical = true
    for (let i = 0; i < Math.min(l.length, 5000); i++) {
      if (l[i] !== r[i]) { identical = false; break }
    }
    expect(identical).toBe(false)
  })

  it('honours a longer decay with a longer buffer', () => {
    const ctx = fakeContext()
    const short = buildIR(ctx as unknown as BaseAudioContext, 'room', 1, 0, 0.5)
    const long = buildIR(ctx as unknown as BaseAudioContext, 'room', 5, 0, 0.5)
    expect(long.length).toBeGreaterThan(short.length)
  })

  it('clamps a zero or negative decay to the documented floor', () => {
    const ctx = fakeContext()
    const ir = buildIR(ctx as unknown as BaseAudioContext, 'room', 0, 0, 0.5)
    // Math.max(0.1, decay) -- a zero-length IR would make the convolver silent.
    expect(ir.length).toBe(Math.floor(44100 * 0.1))
  })

  it('ignores a negative pre-delay rather than producing a shorter buffer', () => {
    const ctx = fakeContext()
    const ir = buildIR(ctx as unknown as BaseAudioContext, 'room', 1, -0.5, 0.5)
    expect(ir.length).toBe(Math.floor(44100 * 1))
  })

  it('produces a darker tail as damping rises', () => {
    const ctx = fakeContext()
    const bright = buildIR(ctx as unknown as BaseAudioContext, 'hall', 2, 0, 0)
    const dark = buildIR(ctx as unknown as BaseAudioContext, 'hall', 2, 0, 1)
    // A one-pole lowpass removes sample-to-sample variation, so a damped tail
    // has smaller successive differences than a bright one.
    const roughness = (d: Float32Array) => {
      let sum = 0
      for (let i = 1; i < 20000; i++) sum += Math.abs(d[i] - d[i - 1])
      return sum
    }
    expect(roughness(dark.getChannelData(0))).toBeLessThan(roughness(bright.getChannelData(0)))
  })

  it('tracks the context sample rate', () => {
    const ir = buildIR(fakeContext(48000) as unknown as BaseAudioContext, 'room', 1, 0, 0.5)
    expect(ir.sampleRate).toBe(48000)
    expect(ir.length).toBe(48000)
  })
})
