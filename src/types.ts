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
// Used by presets, getParams/applyPreset, and collab sync.
export interface AudioParams {
  playbackRate: number      // 0.25 to 1.0
  reverbMix: number         // 0 to 1
  reverbDecay: number       // 0.1 to 8.0 seconds
  reverbRoomSize: number    // 0.01 to 1.0
  volume: number            // 0 to 1
  eq: EQParams
  chorus: ChorusParams
  saturationDrive: number   // 0 to 1
}

export interface PresetDefinition {
  id: string
  name: string
  params: AudioParams
}

// MIDI CC binding: maps a CC number to a handler
export interface MidiBinding {
  ccNumber: number
  label: string
  handler: (normalizedValue: number) => void
}

// Messages sent over the WebRTC data channel between peers
export type CollabMessage =
  | { type: 'params'; payload: AudioParams; peerId: string }
  | { type: 'ping'; peerId: string }
  | { type: 'pong'; peerId: string }

// Validates an AudioParams object received from an untrusted source.
// Returns true only if all fields are present and within safe ranges.
export function isValidAudioParams(val: unknown): val is AudioParams {
  if (!val || typeof val !== 'object') return false
  const p = val as Record<string, unknown>

  if (typeof p.playbackRate !== 'number' || p.playbackRate < 0.25 || p.playbackRate > 1.0) return false
  if (typeof p.reverbMix !== 'number' || p.reverbMix < 0 || p.reverbMix > 1) return false
  if (typeof p.reverbDecay !== 'number' || p.reverbDecay < 0.1 || p.reverbDecay > 8.0) return false
  if (typeof p.reverbRoomSize !== 'number' || p.reverbRoomSize < 0.01 || p.reverbRoomSize > 1.0) return false
  if (typeof p.volume !== 'number' || p.volume < 0 || p.volume > 1) return false
  if (typeof p.saturationDrive !== 'number' || p.saturationDrive < 0 || p.saturationDrive > 1) return false

  if (!p.eq || typeof p.eq !== 'object') return false
  const eq = p.eq as Record<string, unknown>
  if (typeof eq.low !== 'number' || eq.low < -12 || eq.low > 12) return false
  if (typeof eq.mid !== 'number' || eq.mid < -12 || eq.mid > 12) return false
  if (typeof eq.high !== 'number' || eq.high < -12 || eq.high > 12) return false

  if (!p.chorus || typeof p.chorus !== 'object') return false
  const ch = p.chorus as Record<string, unknown>
  if (typeof ch.rate !== 'number' || ch.rate < 0.1 || ch.rate > 5) return false
  if (typeof ch.depth !== 'number' || ch.depth < 0 || ch.depth > 1) return false

  return true
}
