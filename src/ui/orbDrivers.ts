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
/**
 * 0.52, not the 0.72 that shipped.
 *
 * The coefficient has to leave headroom under BLOOM_CAP at the WORST case, not
 * the typical one: maximum kick AND maximum reverb together. At 0.72 that sum
 * reaches 1.246 against a 1.10 cap, so bloom re-pins at high reverb settings
 * even with kickVis behaving -- the same defect, hidden behind a control most
 * measurements leave at zero.
 *
 * 0.20 + 0.28 + 1.064 x 0.52 = 1.033, which clears the cap with room to spare.
 * Peak glow is lower than it was; that is the point, and glowMult still scales
 * the whole thing for anyone who wants more.
 */
export const BLOOM_KICK_COEFF = 0.52
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

/**
 * Bloom strength for a frame.
 *
 * This is where the blow-out happened. With kickVis pinned at 1.4 the kick term
 * alone contributes 1.008, so the expression saturated its own 1.10 cap and
 * bloom sat at maximum continuously -- measured at up to 144,313 fully
 * achromatic pixels in a single frame, against zero once playback stopped.
 * Bloom held at its cap is not a response to the music, it is a constant.
 */
export function computeBloomStrength(
  kickVis: number,
  reverb: number,
  glowMult: number,
  visualFade: number,
  introSurge = 0,
  introClamp = 1,
): number {
  const core = Math.min(BLOOM_BASE + reverb * BLOOM_REVERB_COEFF + kickVis * BLOOM_KICK_COEFF, BLOOM_CAP)
  return (core + introSurge) * glowMult * visualFade * introClamp
}

/** Largest kickVis reachable at a given reactivity, for headroom assertions. */
export function maxKickVis(reactivity: number): number {
  return computeKickVis(KICK_MAX, 1, reactivity)
}
