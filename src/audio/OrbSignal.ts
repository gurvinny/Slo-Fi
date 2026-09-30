// The orb's audio -> motion pipeline.
// Author: gurvinny
//
// Layered on purpose. The radius (layer 1) is heavily damped and carries the
// body of the motion; the ripples (layer 2) carry the transients and decay on
// their own clock; shimmer (layer 3) rides the highs. Splitting them is what
// lets the radius be smoothed hard without the beat going soft -- previously
// both came from the same spectral-flux signal, so damping one damped the
// other and the orb could be smooth or on-beat but not both.
import { alpha, tauFromLerp, AsymEnvelope } from './envelope'
import { bandEnergy, freqToBin, lowCentroidHz, positiveFlux } from './spectrum'
import { RippleBank, RIPPLE_CAPACITY, RIPPLE_STRIDE, type Ripple } from './RippleBank'
import { OnsetDetector } from './OnsetDetector'

export interface OrbSignalOptions {
  sampleRate: number
  fastBins: number
  fineBins: number
}

export interface OrbDrivers {
  /** Layer 1 -- the breathing mass. Smooth by design. */
  radius: number
  /** Layer 3 -- surface micro-detail from the highs. */
  shimmer: number
  /** Where this track actually keeps its low end. */
  centroidHz: number
  /** Layer 2 -- live ripples, each with its own age and strength. */
  ripples: readonly Ripple[]
}

// The low end lives somewhere in here on every track; the centroid says where.
const LOW_MIN_HZ = 20
const LOW_MAX_HZ = 250

// The follow band is a fixed number of bins either side of the centroid, NOT a
// proportional span. A proportional band is musically tempting -- bandwidth
// scales with pitch -- but bandEnergy is a mean, so a wide band dilutes a
// narrow note more than a narrow band does. That made a 220Hz bass read weaker
// than a 28Hz sub purely because its band was six times wider, which is the
// band-drift bug wearing a different hat. Constant width means constant
// dilution.
const BAND_HALF_BINS = 3

// Which band to follow is a question about the track, not about this frame.
const CENTROID_TAU = 1.5

// Layer 1 is the MASS, not the transient, so it is slow in both directions.
// The old code gave this channel a 0.32-per-frame attack (tau 43ms) because the
// same signal also had to carry the beat; now that the ripples do, a fast
// attack here buys nothing and actively hurts -- it chases every fluctuation in
// the spectrum, which is what read as jitter. Still asymmetric, so a drop
// arrives faster than it leaves.
const RADIUS_ATTACK_TAU = 0.18
const RADIUS_RELEASE_TAU = 0.42
const SHIMMER_TAU = tauFromLerp(0.06)

// Auto-gain, so a brick-walled master still moves and a dynamic one does not
// clip. The floor tracks the running MINIMUM and the ceiling the running
// maximum, rather than anchoring the floor to a fraction of the mean: a
// fractional anchor makes the range a fixed proportion of the level, so a
// master that only modulates 2% can never expand to more than a few percent of
// motion however slow the tracking is. Both are slow relative to a phrase, so
// the auto-gain normalises the TRACK and leaves the arrangement's dynamics
// intact instead of flattening them.
const FLOOR_DOWN_TAU = 0.35
const FLOOR_UP_TAU = 12
const CEILING_UP_TAU = 0.35
const CEILING_DOWN_TAU = 12
// Stops a near-silent or perfectly flat passage being amplified into noise.
const MIN_RANGE = 0.12

// A tab return or a GC pause hands the loop a dt of seconds. The envelopes
// saturate harmlessly, but anything integrating dt would jump visibly.
const MAX_DT = 0.1

// Onsets are measured over the whole low range, not over layer 1's narrow
// follow band. The two want different things: layer 1 compares mean energy
// ACROSS tracks, so its band has to be a fixed width or a wide band dilutes a
// narrow note (the band-drift bug). Flux is only ever compared to its own
// recent history by an adaptive threshold, so cross-track scale is irrelevant
// -- and a kick's attack is broadband, often well above the sustained bass
// note it sits under, so a 7-bin window around the centroid would miss it.
const FLUX_MIN_HZ = LOW_MIN_HZ
const FLUX_MAX_HZ = LOW_MAX_HZ

// The buffer packRipples writes: RIPPLE_CAPACITY ripples of RIPPLE_STRIDE
// floats, which the shader declares as vec4 uRipples[8].
const PACK_LENGTH = RIPPLE_CAPACITY * RIPPLE_STRIDE

export class OrbSignal {
  private readonly opts: OrbSignalOptions
  private readonly bank = new RippleBank()
  private readonly onsets = new OnsetDetector()
  private readonly radiusEnv = new AsymEnvelope(RADIUS_ATTACK_TAU, RADIUS_RELEASE_TAU)

  // Previous frame's fast spectrum, for the flux difference. Seeded from the
  // first real frame rather than left at zeros: a zeroed previous frame makes
  // the first flux reading the entire spectrum, which poisons the detector's
  // baseline and deviation upward before it has seen any music. The same class
  // of startup transient already fired phantom beats at the top of every track.
  private prevFast: Uint8Array | null = null

  private centroidHz = (LOW_MIN_HZ + LOW_MAX_HZ) / 2
  private shimmer = 0
  private floor = 0
  private ceiling = MIN_RANGE

  constructor(opts: OrbSignalOptions) {
    this.opts = opts
  }

  update(fast: Uint8Array, fine: Uint8Array, dtRaw: number, playing: boolean): OrbDrivers {
    const dt = Math.min(Math.max(dtRaw, 0), MAX_DT)
    const { sampleRate, fastBins, fineBins } = this.opts

    // --- which band is "the low end" on this track ---
    const fineBinHz = sampleRate / 2 / fineBins
    const target = lowCentroidHz(
      fine,
      freqToBin(LOW_MIN_HZ, fineBins, sampleRate),
      freqToBin(LOW_MAX_HZ, fineBins, sampleRate),
      fineBinHz,
    )
    this.centroidHz += (target - this.centroidHz) * alpha(CENTROID_TAU, dt)

    // --- layer 1: the breathing mass ---
    const centre = freqToBin(this.centroidHz, fastBins, sampleRate)
    const raw = bandEnergy(
      fast,
      Math.max(0, centre - BAND_HALF_BINS),
      Math.min(fastBins - 1, centre + BAND_HALF_BINS),
    )

    this.floor += (raw - this.floor) *
      alpha(raw < this.floor ? FLOOR_DOWN_TAU : FLOOR_UP_TAU, dt)
    this.ceiling += (raw - this.ceiling) *
      alpha(raw > this.ceiling ? CEILING_UP_TAU : CEILING_DOWN_TAU, dt)
    this.ceiling = Math.max(this.ceiling, this.floor + MIN_RANGE)

    const normalised = Math.max(0, (raw - this.floor) / (this.ceiling - this.floor))
    // Blended rather than fully normalised: pure auto-gain would make a quiet
    // passage swell to the same size as a drop, which reads as the orb
    // ignoring the arrangement.
    const level = playing ? raw * 0.4 + normalised * 0.6 : 0
    const radius = this.radiusEnv.step(level, dt)

    // --- layer 3: shimmer ---
    const highs = playing
      ? bandEnergy(fast, freqToBin(4000, fastBins, sampleRate), freqToBin(16000, fastBins, sampleRate))
      : 0
    this.shimmer += (highs - this.shimmer) * alpha(SHIMMER_TAU, dt)

    // --- layer 2: transients ---
    // Age first, then spawn, so a ripple born this frame is not immediately
    // advanced by this frame's dt -- otherwise its wavefront starts part way
    // out and the beat reads early.
    this.bank.step(dt)

    const fluxLo = freqToBin(FLUX_MIN_HZ, fastBins, sampleRate)
    const fluxHi = freqToBin(FLUX_MAX_HZ, fastBins, sampleRate)
    let flux = 0
    if (this.prevFast === null || this.prevFast.length !== fast.length) {
      this.prevFast = new Uint8Array(fast)
    } else {
      flux = positiveFlux(fast, this.prevFast, fluxLo, fluxHi)
      this.prevFast.set(fast)
    }

    // The detector's clock still advances while paused, so its baseline decays
    // toward the silence it is actually being shown rather than holding the
    // last playing level and firing on the first frame after a resume.
    const strength = this.onsets.push(playing ? flux : 0, dt)
    if (playing && strength > 0) this.bank.spawn(strength)

    return {
      radius,
      shimmer: this.shimmer,
      centroidHz: this.centroidHz,
      ripples: this.bank.active,
    }
  }

  /**
   * Write the live ripples into the shader's uniform buffer.
   *
   * The caller owns the buffer so the hot path allocates nothing. Returns how
   * many slots were filled; the rest are zeroed, which the shader reads as no
   * displacement.
   */
  packRipples(out: Float32Array): number {
    if (out.length !== PACK_LENGTH) {
      throw new Error(`packRipples needs a Float32Array of ${PACK_LENGTH}, got ${out.length}`)
    }
    return this.bank.pack(out)
  }
}
