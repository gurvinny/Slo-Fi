// Author: gurvinny
import { describe, it, expect } from 'vitest'
import { PRESETS } from '../../src/presets'
import { DEFAULTS } from '../../src/config/defaults'
import type { ReverbType } from '../../src/types'

// These bounds are the ones presets.ts documents in its own header comment.
// The point of pinning them here is that the comment and the data can drift
// apart silently -- a preset nudged out of range still compiles, still loads,
// and just sounds wrong or pins a slider to its end stop.
const RANGE: Record<string, [number, number]> = {
  playbackRate: [0.5, 1.7],
  reverbMix: [0, 1],
  reverbDecay: [0.2, 10],
  reverbPreDelay: [0, 0.08],
  reverbDamping: [0, 1],
  volume: [0, 1],
  saturationDrive: [0, 1],
  pitchSemitones: [-12, 12],
}
const EQ_BANDS = ['low', 'lowMid', 'mid', 'highMid', 'high'] as const
const REVERB_TYPES: ReverbType[] = ['room', 'hall', 'plate', 'church', 'chamber', 'spring']
const HZ_ALLOWED = [432, 528, 639, 741, 852, 963]

describe('PRESETS', () => {
  it('is a non-empty list', () => {
    expect(Array.isArray(PRESETS)).toBe(true)
    expect(PRESETS.length).toBeGreaterThan(0)
  })

  it('has unique, UI-safe ids', () => {
    const ids = PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('gives every preset a display name', () => {
    for (const p of PRESETS) expect(p.name.trim().length).toBeGreaterThan(0)
  })

  describe.each(PRESETS.map((p) => [p.id, p] as const))('%s', (_id, preset) => {
    it.each(Object.entries(RANGE))('keeps %s within its documented range', (key, [lo, hi]) => {
      const value = (preset.params as Record<string, unknown>)[key]
      expect(typeof value).toBe('number')
      expect(value as number).toBeGreaterThanOrEqual(lo)
      expect(value as number).toBeLessThanOrEqual(hi)
    })

    it('uses a reverb type the engine implements', () => {
      // An unknown type indexes undefined out of the decay-scale table and
      // produces NaN throughout the impulse response.
      expect(REVERB_TYPES).toContain(preset.params.reverbType)
    })

    it('keeps every EQ band within +/-12 dB', () => {
      for (const band of EQ_BANDS) {
        const db = preset.params.eq[band]
        expect(typeof db).toBe('number')
        expect(Math.abs(db)).toBeLessThanOrEqual(12)
      }
    })

    it('keeps chorus inside its range', () => {
      expect(preset.params.chorus.rate).toBeGreaterThanOrEqual(0.1)
      expect(preset.params.chorus.rate).toBeLessThanOrEqual(5)
      expect(preset.params.chorus.depth).toBeGreaterThanOrEqual(0)
      expect(preset.params.chorus.depth).toBeLessThanOrEqual(1)
    })

    it('uses a supported solfeggio frequency or none at all', () => {
      const hz = preset.params.hzFrequency
      if (hz !== null && hz !== undefined) expect(HZ_ALLOWED).toContain(hz)
    })

    it('has no NaN anywhere in its params', () => {
      const walk = (v: unknown, path: string): void => {
        if (typeof v === 'number') expect(Number.isFinite(v), `${path} is ${v}`).toBe(true)
        else if (v && typeof v === 'object') {
          for (const [k, sub] of Object.entries(v)) walk(sub, `${path}.${k}`)
        }
      }
      walk(preset.params, preset.id)
    })
  })
})

describe('DEFAULTS', () => {
  it('exists and is an object', () => {
    expect(DEFAULTS).toBeTruthy()
    expect(typeof DEFAULTS).toBe('object')
  })

  it('contains no NaN or Infinity', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'number') expect(Number.isFinite(v), `${path} is ${v}`).toBe(true)
      else if (v && typeof v === 'object') {
        for (const [k, sub] of Object.entries(v)) walk(sub, `${path}.${k}`)
      }
    }
    walk(DEFAULTS, 'DEFAULTS')
  })
})
