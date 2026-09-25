/**
 * The two mappings that decide how hard the orb moves, pulled out of the
 * renderer so they can be tested without a GL context.
 *
 * Both shipped defects that a liveness test cannot see, because in each case
 * the value was still computed, still uploaded, and still animated -- it had
 * simply stopped VARYING.
 */

/** Spectral flux is much smaller than band-averaged energy; this rescales it. */
export const KICK_FLUX_SCALE = 2.8
/** Ceiling on kickVis, unchanged -- downstream thresholds are calibrated to it. */
export const KICK_MAX = 1.4
/** How much absolute level still shows through, so a whisper is not a drop. */
export const KICK_RAW_MIX = 0.30
/** ...and how much comes from the adapted range. The defect was 0% here. */
export const KICK_NORM_MIX = 0.70
/** Maps a fully-expanded normalised kick into the historical kickVis range. */
export const KICK_NORM_GAIN = 1.3

/** Bloom floor with no audio at all. */
export const BLOOM_BASE = 0.20
export const BLOOM_REVERB_COEFF = 0.28
export const BLOOM_CAP = 1.10

/**
 * kickVis -- the motion driver behind bloom, scale pulse, rotation, crack
 * veins, glitch and lightning.
 *
 * It used to be `min(kickEnergy * reactivity * 2.8, 1.4)`: absolute, so how
 * hard the orb moved was set by how loud the master was. At default reactivity
 * that pins above kickEnergy ~0.62, and everything downstream pinned with it.
 *
 * `norm` comes from AdaptiveRange and is the same gesture at any level. The raw
 * term is kept at a minority weight on purpose -- fully normalised, a gentle
 * ambient track and a club master would be indistinguishable, and some sense of
 * absolute level is part of the instrument's character.
 */
export function computeKickVis(kickEnergy: number, norm: number, reactivity: number): number {
  const raw = Math.min(kickEnergy * KICK_FLUX_SCALE, KICK_MAX)
  const expanded = raw * KICK_RAW_MIX + norm * KICK_NORM_GAIN * KICK_NORM_MIX
  return Math.min(Math.max(expanded * reactivity, 0), KICK_MAX)
}

/** Largest kickVis reachable at a given reactivity, for headroom assertions. */
export function maxKickVis(reactivity: number): number {
  return computeKickVis(KICK_MAX, 1, reactivity)
}

// ── Scale pulse ─────────────────────────────────────────────────────────────
//
// Extracted so the camera framing and the mesh scale read the SAME numbers.
// They were independent before: resize() solved for a radius-1 sphere while the
// mesh was scaled by orbBaseScale and then pulsed, so the fraction the framing
// targeted was never the fraction on screen.

export const ORB_PULSE_BASS = 0.44
export const ORB_PULSE_ALWAYS = 0.14
export const ORB_LOOP_PULSE = 0.08

/** The multiplier applied to orbBaseScale for one frame. */
export function computeOrbPulse(kickVis: number, bassPulse: boolean, loopPulseAmount = 0): number {
  const pulse = (bassPulse ? kickVis * ORB_PULSE_BASS : 0) + kickVis * ORB_PULSE_ALWAYS
  return 1 + pulse + loopPulseAmount * ORB_LOOP_PULSE
}

/**
 * The largest pulse the orb can reach, for the camera to frame against.
 *
 * Derived from the same constants computeOrbPulse uses, so the two cannot drift
 * apart -- a framing constant copied by hand goes stale the first time the
 * pulse is retuned.
 */
export function maxOrbPulse(reactivity = 1, loopPulseAmount = 1): number {
  return computeOrbPulse(maxKickVis(reactivity), true, loopPulseAmount)
}

// ── Two-stage bloom ─────────────────────────────────────────────────────────
//
// One term could not serve both jobs. A single coefficient on the kick channel
// means a dense passage holds bloom high CONTINUOUSLY -- measured at up to
// 43.6% of bright pixels carrying no colour, because sustained material parks
// the sum at the clip point and every hit lands on an already saturated frame.
// Loud stopped meaning anything.

export const BLOOM_MUSIC_COEFF = 0.22
export const BLOOM_FLASH_PEAK = 0.35
/**
 * Applied to the NORMALISED kick, so it means "hard for this track" rather than
 * "loud in absolute terms". Sustained bass sits below it and never flashes.
 */
export const BLOOM_FLASH_THRESHOLD = 0.72
/** Flash release. Short, so it reads as a strike and not a swell. */
export const BLOOM_FLASH_TAU = 0.11

/** How hard a flash this frame's kick deserves, 0..1. */
export function flashTarget(kickNorm: number): number {
  if (kickNorm <= BLOOM_FLASH_THRESHOLD) return 0
  return Math.min((kickNorm - BLOOM_FLASH_THRESHOLD) / (1 - BLOOM_FLASH_THRESHOLD), 1)
}

/**
 * Instant attack, exponential release. A kick that fades in is not a kick, and
 * the release is dt-based so it lasts the same wall-clock time at any rate.
 */
export function updateFlash(prev: number, kickNorm: number, dt: number): number {
  const target = flashTarget(kickNorm)
  if (target > prev) return target
  return prev * Math.exp(-Math.max(dt, 0) / BLOOM_FLASH_TAU)
}

export function computeBloomTwoStage(
  kickNorm: number,
  flash: number,
  reverb: number,
  glowMult: number,
  visualFade: number,
  introSurge = 0,
  introClamp = 1,
): number {
  const sustained = BLOOM_BASE + reverb * BLOOM_REVERB_COEFF + Math.min(Math.max(kickNorm, 0), 1) * BLOOM_MUSIC_COEFF
  const core = Math.min(sustained + Math.min(Math.max(flash, 0), 1) * BLOOM_FLASH_PEAK, BLOOM_CAP)
  return (core + introSurge) * glowMult * visualFade * introClamp
}

/** Highest sustained level reachable with no flash at all. */
export function maxSustainedBloom(): number {
  return BLOOM_BASE + BLOOM_REVERB_COEFF + BLOOM_MUSIC_COEFF
}

// ── Camera framing ──────────────────────────────────────────────────────────
//
// The framing used to solve for a radius-1 sphere while the mesh was scaled by
// orbBaseScale and pulsed by up to ~1.85x. Measured on the shipped build that
// put the orb at 58.3% of viewport height on desktop and 107.2% of viewport
// WIDTH in portrait -- it did not fit on a phone when a kick landed. Both
// figures are exactly the stated target times the peak pulse: the camera never
// knew the orb pulses.

/** Share of the viewport the orb spans AT PEAK. */
export const ORB_PEAK_FRACTION = {
  landscape: 0.45,
  portrait: 0.60,
} as const

export const ORB_Z_MIN = 3.5
/** Portrait genuinely needs ~8.7; the previous 7.5 would have capped the fix. */
export const ORB_Z_MAX = 12.0

export function computeCameraZ(
  aspect: number,
  fovDeg: number,
  baseScale: number,
  reactivity = 1,
): number {
  const tanHalfFov = Math.tan((fovDeg * Math.PI / 180) / 2)
  const peakScale = baseScale * maxOrbPulse(reactivity, 1)
  const z = aspect >= 1
    ? peakScale / (ORB_PEAK_FRACTION.landscape * tanHalfFov)
    : peakScale / (ORB_PEAK_FRACTION.portrait * aspect * tanHalfFov)
  return Math.max(ORB_Z_MIN, Math.min(z, ORB_Z_MAX))
}

/** Share of viewport height the orb spans, for a given scale and distance. */
export function orbHeightFraction(scale: number, z: number, fovDeg: number): number {
  return scale / (z * Math.tan((fovDeg * Math.PI / 180) / 2))
}
