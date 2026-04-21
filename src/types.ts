// Shared types used across the app

export interface EQParams {
  low: number   // dB, -12 to +12
  mid: number
  high: number
}

export interface ChorusParams {
  rate: number    // Hz, 0.1 to 5
  depth: number   // 0 to 1
}

// All audio parameters in one flat object.
// Used by presets and getParams/applyPreset.
export interface AudioParams {
  playbackRate: number      // 0.25 to 1.0
  reverbMix: number         // 0 to 1
  reverbDecay: number       // 0.1 to 8.0 seconds
  reverbRoomSize: number    // 0.01 to 1.0
  volume: number            // 0 to 1
  eq: EQParams
  chorus: ChorusParams
  saturationDrive: number   // 0 to 1
  hzFrequency: number | null  // Solfeggio resonance Hz, null = off
  pitchSemitones: number    // -12 to +12 semitones (0 = no shift)
}

export interface VisualParams {
  reactivity?:     number   // beat response  [0.00 – 1.00]
  glow?:           number   // bloom amount   [0.00 – 1.50]
  orbSize?:        number   // sphere scale   [0.40 – 1.80]
  rotationSpeed?:  number   // spin rate      [0.00 – 2.00]
  stars?:          number   // star field     [0.00 – 1.00]
  particleCount?:  number   // particle cloud [0 – 2000]
  wireframe?:      boolean
  bassPulse?:      boolean
  lightning?:      boolean
  crack?:          boolean
  crystal?:        boolean
  glitch?:         boolean
}

export interface PresetDefinition {
  id: string
  name: string
  theme?: string
  params: AudioParams
  visual?: VisualParams
}

