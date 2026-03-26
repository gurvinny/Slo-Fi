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

export interface PresetDefinition {
  id: string
  name: string
  theme?: string
  params: AudioParams
}

