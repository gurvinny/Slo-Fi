// Author: gurvinny
//
// The orb's two analysers, and the one it must not have changed.
//
// Why two, and why this is not a tunable constant: an AnalyserNode's window is
// fftSize / sampleRate, so resolution and latency trade directly against each
// other. At fftSize 2048 the whole 20-250 Hz low end is 11 bins and 35 Hz lands
// at bin 1.5, which is unusable for a centroid; at 8192 the window is 171 ms and
// every transient smears. "Ripples land within 30 ms of the beat" and "bass
// means the same thing on every track" are physically opposed, so they get one
// node each off the same post-effects tap.
//
// And why smoothingTimeConstant must be 0 on both: stc smooths per
// getByteFrequencyData() CALL, not per second. Frame-rate independence is
// unachievable while it is non-zero and the read rate varies, and two consumers
// reading the same node interleave and steal each other's smoothing state --
// which is what EffectsController and the orb were doing to each other.
//
// Scope note: these assert configuration and node identity, not signal. A real
// AudioContext cannot be driven in this suite -- Chromium's autoplay policy
// means resume() never settles without a user gesture, so the context never
// reaches 'running' and no analyser ever fills. Verified, not assumed: a spike
// that awaited resume() timed out at 15s. The behavioural proof that the tap is
// post-effects belongs in the e2e suite, where a real page and a real gesture
// exist.
import { describe, it, expect, afterEach } from 'vitest'
import { AudioEngine } from '../../src/audio/AudioEngine'

type Internals = { ensureContext(): Promise<void>; context: AudioContext | null }

let engine: AudioEngine | null = null

async function boot(): Promise<AudioEngine> {
  engine = new AudioEngine()
  // ensureContext is private and reached only by loadFile()/play(), both of
  // which need a decoded buffer and a running context. `private` is a
  // compile-time marker, so this is the seam.
  await (engine as unknown as Internals).ensureContext()
  return engine
}

afterEach(async () => {
  const ctx = engine ? (engine as unknown as Internals).context : null
  await ctx?.close().catch(() => {})
  engine = null
})

describe('AudioEngine orb analysers', () => {
  it('creates a fast analyser sized for onsets', async () => {
    const e = await boot()
    expect(e.orbAnalyserFast).not.toBeNull()
    expect(e.orbAnalyserFast!.fftSize).toBe(2048)
    expect(e.orbAnalyserFast!.smoothingTimeConstant).toBe(0)
  })

  it('creates a fine analyser sized for the centroid', async () => {
    const e = await boot()
    expect(e.orbAnalyserFine).not.toBeNull()
    expect(e.orbAnalyserFine!.fftSize).toBe(8192)
    expect(e.orbAnalyserFine!.smoothingTimeConstant).toBe(0)
  })

  it('gives the two jobs different bin counts, which is the whole point', async () => {
    // If these ever match, one of the two requirements has been silently
    // dropped and the split has become decoration.
    const e = await boot()
    expect(e.orbAnalyserFast!.frequencyBinCount).toBe(1024)
    expect(e.orbAnalyserFine!.frequencyBinCount).toBe(4096)
  })

  it('leaves them as three separate nodes', async () => {
    // Sharing a node is the defect: two consumers reading one analyser from
    // different loops corrupt each other's smoothing state.
    const e = await boot()
    const nodes = [e.analyserNode, e.orbAnalyserFast, e.orbAnalyserFine]
    expect(new Set(nodes).size).toBe(3)
  })

  it('does not retune the analyser EffectsController and the lite loop already read', async () => {
    // The existing node is shared by the EQ spectrum ghosts and App's lite-bass
    // CSS var. Changing its smoothing to suit the orb would have altered both,
    // which is why the orb got its own nodes instead.
    const e = await boot()
    expect(e.analyserNode!.fftSize).toBe(2048)
    expect(e.analyserNode!.smoothingTimeConstant).toBeCloseTo(0.8, 5)
  })

  it('keeps the pre-EQ analyser untouched too', async () => {
    const e = await boot()
    expect(e.analyserPreEQ!.smoothingTimeConstant).toBeCloseTo(0.88, 5)
  })
})
