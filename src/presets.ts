// ─────────────────────────────────────────────────────────────────────────────
// PRESETS
// Each preset is a named sound/visual profile selectable from the UI.
//
// HOW TO EDIT
//   • Change any value and save — Vite hot-reloads instantly.
//   • Add a new preset by copying an existing block and giving it a unique id.
//   • The id must be lowercase, no spaces (used internally).
//   • The name is what appears in the UI.
//   • visual is optional — omit any field to inherit from DEFAULTS (defaults.ts).
//
// AUDIO RANGES (params)
//   playbackRate    0.50 – 1.70   (1.0 = normal speed)
//   reverbMix       0.00 – 1.00   (0 = dry, 1 = full wet)
//   reverbDecay     0.50 – 8.00   seconds
//   reverbRoomSize  0.00 – 1.00
//   volume          0.00 – 1.00
//   eq.low/mid/high -12 – +12     dB
//   chorus.rate     0.10 – 5.00   Hz
//   chorus.depth    0.00 – 1.00
//   saturationDrive 0.00 – 1.00
//   pitchSemitones  -12 – +12     (0 = no shift)
//   hzFrequency     432 | 528 | 639 | 741 | 852 | 963 | null (off)
//
// VISUAL RANGES (visual)
//   reactivity      0.00 – 1.00
//   glow            0.00 – 1.50
//   orbSize         0.40 – 1.80
//   rotationSpeed   0.00 – 2.00
//   stars           0.00 – 1.00
//   particleCount   0 – 2000
//   wireframe / bassPulse / lightning / crack / crystal / glitch: true | false
//
// COLOR THEMES
//   'prism'  — audio-reactive hue cycling
//   'void'   — deep purple / indigo
//   'neon'   — electric cyan / magenta
//   'mono'   — desaturated silver / white
//   'ember'  — warm orange / red
// ─────────────────────────────────────────────────────────────────────────────

import type { PresetDefinition } from './types'

export const PRESETS: PresetDefinition[] = [

  // ── Lo-Fi ───────────────────────────────────────────────────────────────────
  // Dusty, tape-worn. Heavy low-shelf boost, high-cut, slowed to 78%.
  // Cranked room reverb makes everything feel basement-recorded.
  {
    id:    'lofi',
    name:  'Lo-Fi',
    theme: 'void',
    params: {
      playbackRate:    0.78,
      reverbMix:       0.47,
      reverbDecay:     2.5,
      reverbRoomSize:  0.68,
      volume:          0.80,
      eq:              { low: 3, mid: -1, high: -5 },
      chorus:          { rate: 0, depth: 0 },
      saturationDrive: 0,
      hzFrequency:     null,
      pitchSemitones:  0,
    },
    visual: {
      reactivity:    0.65,
      glow:          0.80,
      rotationSpeed: 0.60,
      wireframe:     true,
      lightning:     false,
      crack:         false,
      crystal:       true,
    },
  },

  // ── Vaporwave ────────────────────────────────────────────────────────────────
  // Sun-bleached and dreamy. Heavily slowed with a long wet reverb tail.
  // Bright EQ high boost for that hazy VHS shimmer.
  {
    id:    'vaporwave',
    name:  'Vaporwave',
    theme: 'neon',
    params: {
      playbackRate:    0.69,
      reverbMix:       0.74,
      reverbDecay:     3.3,
      reverbRoomSize:  0.52,
      volume:          0.80,
      eq:              { low: 1.5, mid: 1, high: 2 },
      chorus:          { rate: 0.2, depth: 0 },
      saturationDrive: 0,
      hzFrequency:     null,
      pitchSemitones:  0,
    },
    visual: {
      reactivity:    0.70,
      glow:          1.20,
      rotationSpeed: 0.75,
      stars:         0.90,
      wireframe:     true,
      lightning:     true,
      crack:         false,
    },
  },

  // ── Ambient ──────────────────────────────────────────────────────────────────
  // Slow drift. Maximum reverb decay for infinite pad-like tails.
  // 432 Hz tuning for a warm, natural feel. Mid scoop for space.
  {
    id:    'ambient',
    name:  'Ambient',
    theme: 'mono',
    params: {
      playbackRate:    0.65,
      reverbMix:       0.70,
      reverbDecay:     4.4,
      reverbRoomSize:  0.81,
      volume:          0.75,
      eq:              { low: 0, mid: -3, high: -2 },
      chorus:          { rate: 0.5, depth: 0.10 },
      saturationDrive: 0,
      hzFrequency:     432,
      pitchSemitones:  0,
    },
    visual: {
      reactivity:    0.45,
      glow:          0.90,
      orbSize:       1.10,
      rotationSpeed: 0.40,
      stars:         1.00,
      particleCount: 800,
      wireframe:     true,
      lightning:     false,
      crack:         false,
      glitch:        false,
    },
  },

  // ── Hyperpop ─────────────────────────────────────────────────────────────────
  // Sped-up and chaotic. Saturation drive, scooped mids, and a tight room.
  // High reactivity and crack veins for maximum visual aggression.
  {
    id:    'hyperpop',
    name:  'Hyperpop',
    theme: 'ember',
    params: {
      playbackRate:    1.25,
      reverbMix:       0.27,
      reverbDecay:     1.7,
      reverbRoomSize:  0.59,
      volume:          0.80,
      eq:              { low: 1, mid: -3.5, high: 1 },
      chorus:          { rate: 0.8, depth: 0.08 },
      saturationDrive: 0.07,
      hzFrequency:     null,
      pitchSemitones:  0,
    },
    visual: {
      reactivity:    1.00,
      glow:          1.40,
      rotationSpeed: 1.60,
      particleCount: 1200,
      wireframe:     false,
      lightning:     true,
      crack:         true,
      glitch:        true,
    },
  },

]
