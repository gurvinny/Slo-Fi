// AudioWorkletProcessor — three-voice granular synthesis (bass / mid / treble).
// Each voice holds its own band-filtered stereo PCM (pre-split by the main
// thread via OfflineAudioContext), schedules grains at a shared density, and
// can be frozen independently — locking grain harvest to the position
// captured the moment freeze was toggled on.
//
// PCM is transferred zero-copy via postMessage once per track load. There is
// no SharedArrayBuffer dependency.
//
// Signal flow per output sample:
//   for each enabled voice:
//     advance scheduler accumulator; spawn new grains when ≥ 1
//     mix all active grains (Hann-shaped, linearly-resampled) into voice bus
//   sum voice buses → multiply by mix → output
//
// Outbound messages: { type: 'grainSpawn', voice, posNorm, sizeMs, pan }
// rate-limited to ~32 per process block so the main thread is not flooded.

const VOICE_NAMES = ['bass', 'mid', 'treble']
const MAX_GRAINS_PER_VOICE = 64
const SPAWN_MSG_BUDGET = 32

class GranularProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'position',     defaultValue: 0,    minValue: 0,     maxValue: 1,    automationRate: 'a-rate' },
      { name: 'grainSize',    defaultValue: 0.12, minValue: 0.010, maxValue: 0.500, automationRate: 'k-rate' },
      { name: 'density',      defaultValue: 12,   minValue: 1,     maxValue: 40,   automationRate: 'a-rate' },
      { name: 'spread',       defaultValue: 0,    minValue: 0,     maxValue: 1,    automationRate: 'k-rate' },
      { name: 'pitchScatter', defaultValue: 0,    minValue: 0,     maxValue: 12,   automationRate: 'k-rate' },
      { name: 'attack',       defaultValue: 0.1,  minValue: 0,     maxValue: 0.5,  automationRate: 'k-rate' },
      { name: 'decay',        defaultValue: 0.1,  minValue: 0,     maxValue: 0.5,  automationRate: 'k-rate' },
      { name: 'mix',          defaultValue: 0,    minValue: 0,     maxValue: 1,    automationRate: 'a-rate' },
      { name: 'bassFreeze',    defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'midFreeze',     defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'trebleFreeze',  defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'bassEnable',    defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'midEnable',     defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'trebleEnable',  defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()

    // Per-voice state. Each voice has its own L/R PCM, scheduler accumulator,
    // freeze state, captured frozen position, and a fixed-size grain pool.
    this._voices = [0, 1, 2].map(() => ({
      pcmL: null,
      pcmR: null,
      length: 0,           // samples
      acc: 0,              // scheduler fractional accumulator
      prevFreeze: false,
      frozenPos: 0,        // captured position when freeze flipped 0→1
      grains: Array.from({ length: MAX_GRAINS_PER_VOICE }, () => ({
        active: false,
        readPos: 0,        // float read pos into PCM
        pitchRatio: 1,
        sampleLen: 0,      // grain length in OUTPUT samples
        sampleAge: 0,
        attackSamples: 0,
        releaseStart: 0,
        gainL: 0.707,
        gainR: 0.707,
      })),
      nextGrainIdx: 0,
    }))

    this._spawnMsgCount = 0
    this._pcmSampleRate = sampleRate

    this.port.onmessage = (e) => this._onMessage(e.data)
  }

  _onMessage(msg) {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'loadPcm') {
      // msg.bands: [{L, R}, {L, R}, {L, R}] — bass, mid, treble
      const bands = msg.bands || []
      for (let v = 0; v < 3; v++) {
        const b = bands[v]
        if (!b) continue
        this._voices[v].pcmL = b.L instanceof Float32Array ? b.L : new Float32Array(b.L)
        this._voices[v].pcmR = b.R instanceof Float32Array ? b.R : (b.L instanceof Float32Array ? b.L : new Float32Array(b.L))
        this._voices[v].length = this._voices[v].pcmL.length
        // Reset all grains since the underlying samples changed
        for (const g of this._voices[v].grains) g.active = false
        this._voices[v].acc = 0
      }
      this._pcmSampleRate = msg.sampleRate || sampleRate
    } else if (msg.type === 'clear') {
      for (let v = 0; v < 3; v++) {
        this._voices[v].pcmL = null
        this._voices[v].pcmR = null
        this._voices[v].length = 0
        this._voices[v].acc = 0
        for (const g of this._voices[v].grains) g.active = false
      }
    }
  }

  _spawnGrain(voiceIdx, positionNorm, grainSizeSec, spread, pitchScatter, attack, decay) {
    const voice = this._voices[voiceIdx]
    if (!voice.length) return
    // Choose harvest position: frozen captures the position at the moment
    // freeze toggled on; live grains follow the current position knob.
    const freezeOn = voiceIdx === 0
      ? this._lastBassFreeze
      : voiceIdx === 1
        ? this._lastMidFreeze
        : this._lastTrebleFreeze
    let harvestNorm = freezeOn ? voice.frozenPos : positionNorm
    // Jitter by ±2.5% of buffer length scaled by spread
    harvestNorm += (Math.random() - 0.5) * spread * 0.05
    if (harvestNorm < 0) harvestNorm = 0
    else if (harvestNorm > 1) harvestNorm = 1

    // Pitch: ±pitchScatter semitones → ratio
    const semis = (Math.random() * 2 - 1) * pitchScatter
    const pitchRatio = Math.pow(2, semis / 12)

    // Stereo pan from spread
    const pan = (Math.random() * 2 - 1) * spread
    const panAngle = (pan * 0.5 + 0.5) * Math.PI * 0.5  // 0..π/2
    const gainL = Math.cos(panAngle)
    const gainR = Math.sin(panAngle)

    // Grain length in samples (output samples = playback samples)
    const sampleLen = Math.max(8, Math.floor(grainSizeSec * sampleRate))
    const attackSamples = Math.max(1, Math.floor(sampleLen * attack))
    const releaseStart = Math.max(attackSamples + 1, Math.floor(sampleLen * (1 - decay)))

    // Initial read position in PCM (account for length-1 to leave room for interp)
    const startReadPos = harvestNorm * (voice.length - 1)

    // Find a slot — drop-oldest policy: if all slots active, replace round-robin
    let slot = -1
    for (let i = 0; i < MAX_GRAINS_PER_VOICE; i++) {
      if (!voice.grains[i].active) { slot = i; break }
    }
    if (slot === -1) {
      slot = voice.nextGrainIdx
      voice.nextGrainIdx = (voice.nextGrainIdx + 1) % MAX_GRAINS_PER_VOICE
    }

    const g = voice.grains[slot]
    g.active = true
    g.readPos = startReadPos
    g.pitchRatio = pitchRatio
    g.sampleLen = sampleLen
    g.sampleAge = 0
    g.attackSamples = attackSamples
    g.releaseStart = releaseStart
    g.gainL = gainL
    g.gainR = gainR

    // Outbound spawn notification (rate-limited per block)
    if (this._spawnMsgCount < SPAWN_MSG_BUDGET) {
      this.port.postMessage({
        type: 'grainSpawn',
        voice: voiceIdx,
        posNorm: harvestNorm,
        sizeMs: grainSizeSec * 1000,
        pan,
      })
      this._spawnMsgCount++
    }
  }

  _processGrain(g, outL, outR, blockSize, voice) {
    const pcmL = voice.pcmL
    const pcmR = voice.pcmR
    const len = voice.length
    if (!pcmL || !pcmR || !len) { g.active = false; return }

    for (let i = 0; i < blockSize; i++) {
      if (!g.active) return
      const age = g.sampleAge

      // Hann-shaped envelope morphed by attack/decay into a trapezoid:
      // ramp up over attackSamples, hold, ramp down after releaseStart.
      let env
      if (age < g.attackSamples) {
        const t = age / g.attackSamples
        env = 0.5 - 0.5 * Math.cos(Math.PI * t)
      } else if (age >= g.releaseStart) {
        const t = (age - g.releaseStart) / Math.max(1, g.sampleLen - g.releaseStart)
        env = 0.5 + 0.5 * Math.cos(Math.PI * t)
      } else {
        env = 1
      }

      // Linear-interp sample read
      const rp = g.readPos
      let i0 = Math.floor(rp)
      let frac = rp - i0
      if (i0 < 0) { i0 = 0; frac = 0 }
      if (i0 >= len - 1) { g.active = false; return }
      const sL = pcmL[i0] * (1 - frac) + pcmL[i0 + 1] * frac
      const sR = pcmR[i0] * (1 - frac) + pcmR[i0 + 1] * frac

      outL[i] += sL * env * g.gainL
      outR[i] += sR * env * g.gainR

      g.readPos += g.pitchRatio
      g.sampleAge++
      if (g.sampleAge >= g.sampleLen) { g.active = false; return }
    }
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0]
    if (!output || !output.length) return true
    const outL = output[0]
    const outR = output.length > 1 ? output[1] : output[0]
    const blockSize = outL.length

    // Reset spawn-message budget each block
    this._spawnMsgCount = 0

    // Clear output buffers (worklet writes additive into outL/outR)
    outL.fill(0)
    if (outR !== outL) outR.fill(0)

    // Cache k-rate params for spawn decisions (use first sample of a-rate too)
    const positionParam = parameters.position
    const densityParam  = parameters.density
    const mixParam      = parameters.mix
    const grainSize     = parameters.grainSize[0]
    const spread        = parameters.spread[0]
    const pitchScatter  = parameters.pitchScatter[0]
    const attack        = parameters.attack[0]
    const decay         = parameters.decay[0]
    const bassFreeze    = parameters.bassFreeze[0]    > 0.5
    const midFreeze     = parameters.midFreeze[0]     > 0.5
    const trebleFreeze  = parameters.trebleFreeze[0]  > 0.5
    const bassEnable    = parameters.bassEnable[0]    > 0.5
    const midEnable     = parameters.midEnable[0]     > 0.5
    const trebleEnable  = parameters.trebleEnable[0]  > 0.5

    // Capture freeze positions on 0→1 transitions
    const prevFreeze = [this._lastBassFreeze, this._lastMidFreeze, this._lastTrebleFreeze]
    const nowFreeze  = [bassFreeze, midFreeze, trebleFreeze]
    const positionAtBlockStart = positionParam[0]
    for (let v = 0; v < 3; v++) {
      if (nowFreeze[v] && !prevFreeze[v]) {
        this._voices[v].frozenPos = positionAtBlockStart
      }
    }
    this._lastBassFreeze   = bassFreeze
    this._lastMidFreeze    = midFreeze
    this._lastTrebleFreeze = trebleFreeze

    const enabled = [bassEnable, midEnable, trebleEnable]

    // Voice mix bus — additive across active voices
    // We process each voice into outL/outR additively then scale by mix at end.

    for (let v = 0; v < 3; v++) {
      if (!enabled[v]) continue
      const voice = this._voices[v]
      if (!voice.length) continue

      // Step the scheduler block-by-block (sample-accurate enough at 128 samples).
      // Spawn rate uses average of a-rate density param over block.
      const density = densityParam.length > 1 ? densityParam[0] : densityParam[0]
      const pos     = positionParam.length > 1 ? positionParam[0] : positionParam[0]

      const spawnPerSample = density / sampleRate
      voice.acc += spawnPerSample * blockSize
      let safety = 0
      while (voice.acc >= 1 && safety < 16) {
        this._spawnGrain(v, pos, grainSize, spread, pitchScatter, attack, decay)
        voice.acc -= 1
        safety++
      }
      // Render all active grains for this voice
      for (let i = 0; i < MAX_GRAINS_PER_VOICE; i++) {
        const g = voice.grains[i]
        if (g.active) this._processGrain(g, outL, outR, blockSize, voice)
      }
    }

    // Apply mix (wet send level) — a-rate so it can ramp smoothly
    for (let i = 0; i < blockSize; i++) {
      const m = mixParam.length > 1 ? mixParam[i] : mixParam[0]
      outL[i] *= m
      if (outR !== outL) outR[i] *= m
    }

    return true
  }
}

registerProcessor('granular-processor', GranularProcessor)
// VOICE_NAMES is reserved for diagnostic use; keep referenced to avoid
// dead-code elimination warnings if future tooling minifies the worklet.
void VOICE_NAMES
