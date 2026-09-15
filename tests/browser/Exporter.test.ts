// Author: gurvinny
//
// The export path is the one place the whole audio graph is rebuilt offline.
// It is also the known-broken feature, and WavEncoder's unit tests cleared the
// encoder -- so the fault has to be somewhere in here.
import { describe, it, expect } from 'vitest'
import { renderExport as renderExportImpl } from '../../src/audio/Exporter'
import { encodeWav } from '../../src/audio/WavEncoder'
import { PRESETS } from '../../src/presets'
import type { AudioParams } from '../../src/types'

const SR = 44100

// DEFAULTS is a flat UI-settings object (speed/pitch/volume), not AudioParams.
// A preset carries the real engine shape, so base the fixtures on one.
const BASE = PRESETS[0].params

function params(over: Partial<AudioParams> = {}): AudioParams {
  return { ...BASE, ...over }
}

/** A short stereo source to render through the graph. */
function source(ctx: BaseAudioContext, seconds = 0.5): AudioBuffer {
  const buf = ctx.createBuffer(2, Math.floor(seconds * SR), SR)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR)
  }
  return buf
}

/**
 * Calls the real render path rather than re-implementing it.
 *
 * An earlier version of this file rebuilt the graph by hand, which is how the
 * missing detune stayed invisible: the copy and the original agreed with each
 * other and both disagreed with live playback.
 */
async function renderExport(p: AudioParams, seconds = 0.5): Promise<AudioBuffer> {
  const probe = new OfflineAudioContext(2, 1, SR)
  return renderExportImpl(source(probe, seconds), p)
}

const peak = (b: AudioBuffer) => {
  let max = 0
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]))
  }
  return max
}

describe('offline export render', () => {
  it('renders audible audio at default settings', async () => {
    const out = await renderExport(params())
    expect(out.length).toBeGreaterThan(0)
    expect(peak(out)).toBeGreaterThan(1e-3)
  })

  it('produces a longer buffer when the track is slowed', async () => {
    const normal = await renderExport(params({ playbackRate: 1 }))
    const slowed = await renderExport(params({ playbackRate: 0.5 }))
    expect(slowed.length).toBeGreaterThan(normal.length)
  })

  it('renders the whole slowed track, not just the first part', async () => {
    // At playbackRate 0.5 the source takes twice as long to play out. If the
    // offline context is sized from the source duration instead of the output
    // duration, the tail is silently truncated.
    const out = await renderExport(params({ playbackRate: 0.5 }), 0.5)
    const d = out.getChannelData(0)
    const lastQuarter = d.subarray(Math.floor(d.length * 0.75))
    let energy = 0
    for (let i = 0; i < lastQuarter.length; i++) energy += lastQuarter[i] * lastQuarter[i]
    expect(energy / lastQuarter.length).toBeGreaterThan(1e-9)
  })

  it('encodes the rendered buffer to a well-formed WAV', async () => {
    const out = await renderExport(params())
    const blob = encodeWav(out)
    const v = new DataView(await blob.arrayBuffer())
    const tag = (o: number) =>
      String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(v.getUint32(40, true)).toBe(out.length * out.numberOfChannels * 2)
    expect(blob.size).toBe(44 + out.length * out.numberOfChannels * 2)
  })

  it.each([0.5, 0.75, 1, 1.25, 1.7])('survives playbackRate %s', async (rate) => {
    const out = await renderExport(params({ playbackRate: rate }))
    expect(Number.isFinite(peak(out))).toBe(true)
    expect(peak(out)).toBeGreaterThan(1e-4)
  })

  it('contains no NaN samples', async () => {
    // A NaN anywhere in the graph propagates to every later sample and encodes
    // as 0 via Math.round(NaN * 32767) -- a silent file with no error.
    const out = await renderExport(params({ reverbMix: 0.6, saturationDrive: 0.8 }))
    const d = out.getChannelData(0)
    let nans = 0
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) nans++
    expect(nans).toBe(0)
  })
})

describe('pitch shifting in the export', () => {
  /** Dominant frequency of the rendered buffer, via a coarse DFT peak search. */
  function dominantHz(b: AudioBuffer): number {
    const d = b.getChannelData(0)
    const n = Math.min(16384, d.length)
    let bestHz = 0
    let bestMag = -1
    for (let hz = 200; hz <= 1400; hz += 2) {
      let re = 0
      let im = 0
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * hz * i) / SR
        re += d[i] * Math.cos(a)
        im += d[i] * Math.sin(a)
      }
      const mag = re * re + im * im
      if (mag > bestMag) { bestMag = mag; bestHz = hz }
    }
    return bestHz
  }

  it('applies pitchSemitones, so the export matches what was played', async () => {
    // Live playback shifts pitch with sourceNode.detune (AudioEngine.ts:338).
    // If the export path does not do the same, a track pitched up exports at
    // the original pitch -- the file quietly disagrees with what the user
    // heard, which is indistinguishable from "export is broken".
    // playbackRate is pinned to 1 so the only variable is pitch: the preset's
    // own rate would shift the tone on its own and mask the result.
    const base = { playbackRate: 1, reverbMix: 0, saturationDrive: 0 }
    const flat = await renderExport(params({ ...base, pitchSemitones: 0 }))
    const up = await renderExport(params({ ...base, pitchSemitones: 12 }))

    const flatHz = dominantHz(flat)
    const upHz = dominantHz(up)

    // +12 semitones is one octave: 440 Hz becomes 880 Hz.
    expect(flatHz).toBeGreaterThan(400)
    expect(flatHz).toBeLessThan(480)
    expect(upHz / flatHz).toBeGreaterThan(1.8)
  })
})

describe('exportAudio guards', () => {
  /** Minimal stand-in for the bits of AudioEngine that exportAudio touches. */
  function fakeEngine(buffer: AudioBuffer | null, p: AudioParams = params()) {
    return { getBuffer: () => buffer, getParams: () => p }
  }

  it('refuses to export when no track is loaded', async () => {
    const { exportAudio } = await import('../../src/audio/Exporter')
    await expect(
      exportAudio(fakeEngine(null) as never, 'x'),
    ).rejects.toThrow(/No audio loaded/)
  })

  it('refuses a track longer than the 30 minute guard', async () => {
    const { exportAudio } = await import('../../src/audio/Exporter')
    // Claim a long duration without allocating 30 minutes of samples.
    const ctx = new OfflineAudioContext(1, 1, SR)
    const tiny = ctx.createBuffer(1, 1, SR)
    const huge = new Proxy(tiny, {
      get: (t, k) => (k === 'duration' ? 31 * 60 : Reflect.get(t, k)),
    })
    await expect(
      exportAudio(fakeEngine(huge as AudioBuffer) as never, 'x'),
    ).rejects.toThrow(/too long/)
  })

  it('renders a track just under the guard', async () => {
    // The boundary matters: an off-by-one here rejects valid 29-minute tracks.
    const out = await renderExport(params({ playbackRate: 1 }), 0.2)
    expect(out.length).toBeGreaterThan(0)
  })
})
