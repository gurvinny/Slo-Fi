// Test fixtures for the DSP units.
// Author: gurvinny
//
// The detectors and the encoder only ever touch `sampleRate`,
// `numberOfChannels`, `length` and `getChannelData()`, so a plain object
// satisfies them. That keeps these tests in plain Node with no AudioContext,
// no jsdom and no mocking framework -- the inputs are real signals and the
// expected outputs are known.

/** The subset of AudioBuffer the DSP units actually use. */
export interface FakeBuffer {
  sampleRate: number
  numberOfChannels: number
  length: number
  getChannelData(channel: number): Float32Array
}

export function makeBuffer(channels: Float32Array[], sampleRate = 44100): FakeBuffer {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (c: number) => channels[c],
  }
}

/** Constant-amplitude sine. */
export function sine(freq: number, seconds: number, sampleRate = 44100, amp = 0.8): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  for (let i = 0; i < out.length; i++) {
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate)
  }
  return out
}

/** Sum of several sines, normalised so the peak stays inside [-1, 1]. */
export function chord(freqs: number[], seconds: number, sampleRate = 44100): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  for (const f of freqs) {
    const partial = sine(f, seconds, sampleRate, 1)
    for (let i = 0; i < out.length; i++) out[i] += partial[i]
  }
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.9
  return out
}

/**
 * Percussive clicks at a fixed tempo.
 *
 * Each beat is a short burst with a sharp attack and an exponential decay,
 * because the detector keys off the *rise* in frame energy. A bare impulse
 * spread across a 10 ms analysis frame barely registers as an onset.
 */
export function clickTrack(bpm: number, seconds: number, sampleRate = 44100): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate))
  const interval = (60 / bpm) * sampleRate
  const burst = Math.floor(sampleRate * 0.05)
  for (let beat = 0; beat * interval < out.length; beat++) {
    const start = Math.floor(beat * interval)
    for (let i = 0; i < burst && start + i < out.length; i++) {
      const decay = Math.exp(-i / (sampleRate * 0.01))
      out[start + i] += Math.sin((2 * Math.PI * 180 * i) / sampleRate) * decay * 0.9
    }
  }
  return out
}

/** MIDI note number -> frequency, so tests can name notes instead of numbers. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** C=0 pitch class -> frequency in a given octave. */
export function pitchClassFreq(pc: number, octave = 4): number {
  return midiToFreq(12 * (octave + 1) + pc)
}

/**
 * Minimal BaseAudioContext stand-in.
 *
 * `buildIR` only uses the context as a buffer factory -- it reads `sampleRate`
 * and calls `createBuffer` -- so it can be exercised without Web Audio at all.
 */
export function fakeContext(sampleRate = 44100) {
  return {
    sampleRate,
    createBuffer(numberOfChannels: number, length: number, rate: number) {
      const data = Array.from({ length: numberOfChannels }, () => new Float32Array(length))
      return {
        numberOfChannels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (c: number) => data[c],
      }
    },
  }
}
