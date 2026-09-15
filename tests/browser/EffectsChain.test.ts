// Author: gurvinny
//
// EffectsChain.initOffline is the render-safe path: it is written to avoid
// AudioWorklet because OfflineAudioContext cannot load one. That makes it the
// only part of the effects graph reachable without a live AudioContext, and it
// is what every export goes through.
import { describe, it, expect } from 'vitest'
import { EffectsChain } from '../../src/audio/EffectsChain'
import { PRESETS } from '../../src/presets'
import type { AudioParams } from '../../src/types'

const SR = 44100
const BASE = PRESETS[0].params

const params = (over: Partial<AudioParams> = {}): AudioParams => ({ ...BASE, ...over })

/** Render one second of a 440 Hz tone through the offline chain. */
async function renderThroughChain(p: AudioParams): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SR, SR)
  const osc = ctx.createOscillator()
  osc.frequency.value = 440
  const gain = ctx.createGain()
  gain.gain.value = 0.5
  osc.connect(gain)

  const chain = new EffectsChain()
  chain.initOffline(ctx, gain, p).connect(ctx.destination)

  osc.start(0)
  osc.stop(1)
  return ctx.startRendering()
}

const peak = (b: AudioBuffer) => {
  let m = 0
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]))
  return m
}

const hasNonFinite = (b: AudioBuffer) => {
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) return true
  }
  return false
}

describe('EffectsChain.initOffline', () => {
  it('returns a connectable node and passes signal', async () => {
    const out = await renderThroughChain(params())
    expect(peak(out)).toBeGreaterThan(1e-3)
  })

  it('never emits NaN or Infinity', async () => {
    expect(hasNonFinite(await renderThroughChain(params()))).toBe(false)
  })

  // Every shipped preset, because a parameter combination that only appears in
  // one preset is exactly the kind that never gets exercised by hand.
  it.each(PRESETS.map((p) => [p.id, p.params] as const))(
    'renders cleanly with the %s preset',
    async (_id, p) => {
      const out = await renderThroughChain(p)
      expect(hasNonFinite(out)).toBe(false)
      expect(Number.isFinite(peak(out))).toBe(true)
    },
  )

  it('attenuates high frequencies as abyss depth rises', async () => {
    // Abyss sweeps a lowpass from 20 kHz down to 200 Hz. At full depth a
    // 440 Hz tone should come through quieter than with the filter open.
    const open = await renderThroughChain(params({ abyss: { depth: 0, resonance: 0 } }))
    const closed = await renderThroughChain(params({ abyss: { depth: 1, resonance: 0 } }))
    expect(peak(closed)).toBeLessThan(peak(open))
  })

  it('applies EQ gain in the direction requested', async () => {
    const flat = await renderThroughChain(
      params({ eq: { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 } }),
    )
    const boosted = await renderThroughChain(
      params({ eq: { low: 0, lowMid: 0, mid: 12, highMid: 0, high: 0 } }),
    )
    // 440 Hz sits under the 1 kHz peaking band's skirt, so a +12 dB mid boost
    // must make it louder, not quieter.
    expect(peak(boosted)).toBeGreaterThan(peak(flat))
  })

  it('drives harder as saturation rises', async () => {
    const clean = await renderThroughChain(params({ saturationDrive: 0 }))
    const driven = await renderThroughChain(params({ saturationDrive: 1 }))
    expect(hasNonFinite(driven)).toBe(false)
    // A tanh curve compresses peaks; the shape must change one way or another.
    expect(Math.abs(peak(driven) - peak(clean))).toBeGreaterThan(1e-4)
  })

  it.each([432, 528, 639, 741, 852, 963])('accepts the %i Hz solfeggio setting', async (hz) => {
    const out = await renderThroughChain(params({ hzFrequency: hz }))
    expect(hasNonFinite(out)).toBe(false)
  })

  it('handles hzFrequency being turned off', async () => {
    expect(hasNonFinite(await renderThroughChain(params({ hzFrequency: null })))).toBe(false)
  })

  it('exposes the EQ nodes it built', async () => {
    const ctx = new OfflineAudioContext(2, SR, SR)
    const g = ctx.createGain()
    const chain = new EffectsChain()
    chain.initOffline(ctx, g, params())
    expect(chain.getEQNodes().length).toBeGreaterThan(0)
    expect(chain.getOutputNode()).toBeTruthy()
  })
})
