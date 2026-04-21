// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SETTINGS
// Edit this file to change what Slo-Fi starts with on a fresh load.
// Saved user settings (localStorage) will still override these on return visits.
// To reset a user back to these values: clear site data / localStorage.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULTS = {

  // ── Color Theme ─────────────────────────────────────────────────────────────
  // 'prism'  — fully audio-reactive hue cycling (recommended)
  // 'void'   — deep purple / indigo
  // 'neon'   — electric cyan / magenta
  // 'mono'   — desaturated silver / white
  // 'ember'  — warm orange / red
  colorTheme: 'prism' as 'prism' | 'void' | 'neon' | 'mono' | 'ember',

  // ── Audio ────────────────────────────────────────────────────────────────────
  speed:          1.00,   // playback rate  [0.50 – 1.70]
  pitch:          0,      // semitones      [-12 – +12]
  volume:         0.80,   // master volume  [0.00 – 1.00]

  // ── Reverb ───────────────────────────────────────────────────────────────────
  reverbMix:      0.20,   // wet/dry mix    [0.00 – 1.00]
  reverbDecay:    2.5,    // tail length    [0.50 – 8.00] seconds
  reverbRoomSize: 0.50,   // room size      [0.00 – 1.00]

  // ── Orb Visuals ──────────────────────────────────────────────────────────────
  reactivity:     0.80,   // beat response  [0.00 – 1.00]
  glow:           1.00,   // bloom amount   [0.00 – 1.50]
  orbSize:        1.00,   // sphere scale   [0.40 – 1.80]
  rotationSpeed:  1.00,   // spin rate      [0.00 – 2.00]
  stars:          0.70,   // star field     [0.00 – 1.00]
  particleCount:  500,    // particle cloud [0 – 2000], step 50

  // ── Effect Toggles ───────────────────────────────────────────────────────────
  wireframe:  true,   // wireframe mesh overlay
  bassPulse:  true,   // bass-reactive size pulsing
  lightning:  true,   // electric arc bolts
  crack:      true,   // fracture vein flashes on bass hits
  crystal:    true,   // icy crystallize effect when paused
  glitch:     false,  // digital glitch distortion

}

export type Defaults = typeof DEFAULTS
