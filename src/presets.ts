import type { PresetDefinition } from './types'

export const PRESETS: PresetDefinition[] = [
  {
    id: 'lofi',
    name: 'Lo-Fi',
    params: {
      playbackRate: 0.75,
      reverbMix: 0.30,
      reverbDecay: 1.8,
      reverbRoomSize: 0.35,
      volume: 0.80,
      eq: { low: 3, mid: -2, high: -4 },
      chorus: { rate: 0.8, depth: 0.15 },
      saturationDrive: 0.45,
    },
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    params: {
      playbackRate: 0.50,
      reverbMix: 0.55,
      reverbDecay: 4.0,
      reverbRoomSize: 0.70,
      volume: 0.80,
      eq: { low: 2, mid: 0, high: 1 },
      chorus: { rate: 0.3, depth: 0.30 },
      saturationDrive: 0.10,
    },
  },
  {
    id: 'ambient',
    name: 'Ambient',
    params: {
      playbackRate: 0.65,
      reverbMix: 0.75,
      reverbDecay: 6.5,
      reverbRoomSize: 0.90,
      volume: 0.75,
      eq: { low: 0, mid: -3, high: -2 },
      chorus: { rate: 0.15, depth: 0.40 },
      saturationDrive: 0.0,
    },
  },
  {
    id: 'hyperpop',
    name: 'Hyperpop',
    params: {
      playbackRate: 1.15,
      reverbMix: 0.22,
      reverbDecay: 0.8,
      reverbRoomSize: 0.20,
      volume: 0.85,
      eq: { low: 2, mid: 1, high: 6 },
      chorus: { rate: 4.0, depth: 0.70 },
      saturationDrive: 0.55,
    },
  },
]
