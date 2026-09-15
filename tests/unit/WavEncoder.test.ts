// Author: gurvinny
import { describe, it, expect } from 'vitest'
import { encodeWav } from '../../src/audio/WavEncoder'
import { makeBuffer, sine } from '../helpers/audio'

/** Read the encoded Blob back as a DataView so the header can be inspected. */
async function decode(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

const ascii = (v: DataView, off: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join('')

describe('encodeWav', () => {
  it('writes a RIFF/WAVE container with a fmt and data chunk', async () => {
    const v = await decode(encodeWav(makeBuffer([sine(440, 0.1)]) as AudioBuffer))
    expect(ascii(v, 0, 4)).toBe('RIFF')
    expect(ascii(v, 8, 4)).toBe('WAVE')
    expect(ascii(v, 12, 4)).toBe('fmt ')
    expect(ascii(v, 36, 4)).toBe('data')
  })

  it('declares 16-bit PCM', async () => {
    const v = await decode(encodeWav(makeBuffer([sine(440, 0.1)]) as AudioBuffer))
    expect(v.getUint32(16, true)).toBe(16) // fmt chunk size, PCM
    expect(v.getUint16(20, true)).toBe(1)  // format tag, PCM
    expect(v.getUint16(34, true)).toBe(16) // bits per sample
  })

  it.each([
    [1, 22050],
    [1, 44100],
    [2, 48000],
  ])('carries %i channel(s) at %i Hz through the header', async (channels, rate) => {
    const chans = Array.from({ length: channels }, () => sine(440, 0.1, rate))
    const v = await decode(encodeWav(makeBuffer(chans, rate) as AudioBuffer))
    expect(v.getUint16(22, true)).toBe(channels)
    expect(v.getUint32(24, true)).toBe(rate)
    expect(v.getUint32(28, true)).toBe(rate * channels * 2) // byte rate
    expect(v.getUint16(32, true)).toBe(channels * 2)        // block align
  })

  it('reports sizes that agree with the actual byte length', async () => {
    const frames = 1000
    const buf = makeBuffer([new Float32Array(frames), new Float32Array(frames)])
    const blob = encodeWav(buf as AudioBuffer)
    const v = await decode(blob)
    const pcmBytes = frames * 2 /* channels */ * 2 /* bytes */
    expect(blob.size).toBe(44 + pcmBytes)
    expect(v.getUint32(4, true)).toBe(blob.size - 8) // RIFF size
    expect(v.getUint32(40, true)).toBe(pcmBytes)     // data size
    expect(blob.type).toBe('audio/wav')
  })

  it('round-trips sample values within 16-bit quantisation error', async () => {
    const src = sine(440, 0.05)
    const v = await decode(encodeWav(makeBuffer([src]) as AudioBuffer))
    for (let i = 0; i < src.length; i += 97) {
      const decoded = v.getInt16(44 + i * 2, true) / 32767
      expect(Math.abs(decoded - src[i])).toBeLessThan(1 / 32767 + 1e-6)
    }
  })

  it('interleaves stereo as L,R,L,R', async () => {
    const left = new Float32Array([1, 1, 1])
    const right = new Float32Array([-1, -1, -1])
    const v = await decode(encodeWav(makeBuffer([left, right]) as AudioBuffer))
    expect(v.getInt16(44, true)).toBe(32767)
    expect(v.getInt16(46, true)).toBe(-32767)
    expect(v.getInt16(48, true)).toBe(32767)
  })

  it('clamps out-of-range samples instead of wrapping', async () => {
    // Without the clamp these wrap to large negative values via setInt16 --
    // a loud export would come back as digital noise rather than distortion.
    const hot = new Float32Array([2, -2, 1.5])
    const v = await decode(encodeWav(makeBuffer([hot]) as AudioBuffer))
    expect(v.getInt16(44, true)).toBe(32767)
    expect(v.getInt16(46, true)).toBe(-32767)
    expect(v.getInt16(48, true)).toBe(32767)
  })

  it('produces a header-only file for an empty buffer', async () => {
    const blob = encodeWav(makeBuffer([new Float32Array(0)]) as AudioBuffer)
    expect(blob.size).toBe(44)
  })
})
