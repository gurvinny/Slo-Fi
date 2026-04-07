import type { AudioParams } from '../types'

// Builds and manages the post-master-gain effects chain:
//   EQ (3-band) -> Chorus -> Tape Saturation
//
// Call init() once to build the graph. It returns the output node
// so AudioEngine can connect it to ctx.destination.

export class EffectsChain {
  // EQ nodes
  private eqLow!: BiquadFilterNode
  private eqMid!: BiquadFilterNode
  private eqHigh!: BiquadFilterNode

  // Chorus nodes
  private chorusDelay!: DelayNode
  private chorusLfo!: OscillatorNode
  private chorusLfoGain!: GainNode
  private chorusDryGain!: GainNode
  private chorusWetGain!: GainNode
  private chorusMerge!: GainNode

  // Saturation
  private satNode!: WaveShaperNode
  private satDrive = 0

  // Hz frequency resonance (Solfeggio peaking filter)
  private hzFilter!: BiquadFilterNode

  // rAF handle for debouncing saturation curve updates
  private satRafId: number | null = null

  // The node that downstream code (AudioEngine) connects to ctx.destination
  private outputNode!: GainNode

  private ctx!: BaseAudioContext

  init(ctx: BaseAudioContext, inputNode: AudioNode): AudioNode {
    this.ctx = ctx

    // EQ (3-band in series)
    this.eqLow = ctx.createBiquadFilter()
    this.eqLow.type = 'lowshelf'
    this.eqLow.frequency.value = 200

    this.eqMid = ctx.createBiquadFilter()
    this.eqMid.type = 'peaking'
    this.eqMid.frequency.value = 1000
    this.eqMid.Q.value = 1.5

    this.eqHigh = ctx.createBiquadFilter()
    this.eqHigh.type = 'highshelf'
    this.eqHigh.frequency.value = 8000

    // Chorus - delay modulated by a slow LFO
    this.chorusDelay = ctx.createDelay(0.1)
    this.chorusDelay.delayTime.value = 0.03

    this.chorusLfo = ctx.createOscillator()
    this.chorusLfo.type = 'sine'
    this.chorusLfo.frequency.value = 0.8

    this.chorusLfoGain = ctx.createGain()
    this.chorusLfoGain.gain.value = 0.003  // depth * 0.01 seconds

    this.chorusDryGain = ctx.createGain()
    this.chorusDryGain.gain.value = 1.0

    this.chorusWetGain = ctx.createGain()
    this.chorusWetGain.gain.value = 0.0    // starts silent (depth = 0)

    this.chorusMerge = ctx.createGain()
    this.chorusMerge.gain.value = 1.0

    // Tape saturation
    this.satNode = ctx.createWaveShaper()
    this.satNode.oversample = '4x'
    this.satNode.curve = this.buildSatCurve(0)

    // Hz resonance peaking filter (gain=0 = transparent when off)
    this.hzFilter = ctx.createBiquadFilter()
    this.hzFilter.type = 'peaking'
    this.hzFilter.frequency.value = 432
    this.hzFilter.Q.value = 10
    this.hzFilter.gain.value = 0

    // Output node - just a pass-through gain so callers get a stable node ref
    this.outputNode = ctx.createGain()
    this.outputNode.gain.value = 1.0

    // Wire EQ chain
    inputNode.connect(this.eqLow)
    this.eqLow.connect(this.eqMid)
    this.eqMid.connect(this.eqHigh)

    // Wire chorus (parallel dry/wet off the EQ output)
    this.eqHigh.connect(this.chorusDryGain)
    this.eqHigh.connect(this.chorusDelay)
    this.chorusLfo.connect(this.chorusLfoGain)
    this.chorusLfoGain.connect(this.chorusDelay.delayTime)
    this.chorusDelay.connect(this.chorusWetGain)
    this.chorusDryGain.connect(this.chorusMerge)
    this.chorusWetGain.connect(this.chorusMerge)

    // Wire saturation → hz filter → output
    this.chorusMerge.connect(this.satNode)
    this.satNode.connect(this.hzFilter)
    this.hzFilter.connect(this.outputNode)

    // Start the LFO - it runs continuously to avoid pitch glitches on start/stop
    if (ctx instanceof AudioContext) {
      this.chorusLfo.start()
    }

    return this.outputNode
  }

  // Same as init() but for OfflineAudioContext where we pass all params upfront
  initOffline(ctx: OfflineAudioContext, inputNode: AudioNode, params: AudioParams): AudioNode {
    this.ctx = ctx
    this.init(ctx, inputNode)

    // Apply all param values immediately (no smooth transitions needed offline)
    this.eqLow.gain.value = params.eq.low
    this.eqMid.gain.value = params.eq.mid
    this.eqHigh.gain.value = params.eq.high
    this.chorusLfo.frequency.value = params.chorus.rate
    this.chorusLfoGain.gain.value = params.chorus.depth * 0.015
    this.chorusWetGain.gain.value = params.chorus.depth * 0.6
    this.satNode.curve = this.buildSatCurve(params.saturationDrive)
    if (params.hzFrequency !== null) {
      this.hzFilter.frequency.value = params.hzFrequency
      this.hzFilter.gain.value = 4
    }

    // Start LFO for offline context too
    this.chorusLfo.start()

    return this.outputNode
  }

  // Setters called from EffectsController and applyPreset

  setEQBand(band: 'low' | 'mid' | 'high', db: number): void {
    const clamped = Math.max(-12, Math.min(12, db))
    const t = (this.ctx as AudioContext).currentTime
    const node = band === 'low' ? this.eqLow : band === 'mid' ? this.eqMid : this.eqHigh
    node.gain.setTargetAtTime(clamped, t, 0.01)
  }

  setChorusRate(hz: number): void {
    const clamped = Math.max(0.1, Math.min(5, hz))
    const t = (this.ctx as AudioContext).currentTime
    this.chorusLfo.frequency.setTargetAtTime(clamped, t, 0.01)
  }

  setChorusDepth(depth: number): void {
    const clamped = Math.max(0, Math.min(1, depth))
    const t = (this.ctx as AudioContext).currentTime
    // Modulation range: 0 to 15 ms — proportional to depth so the rate slider
    // has an audible effect even at low depth values.
    this.chorusLfoGain.gain.setTargetAtTime(clamped * 0.015, t, 0.01)
    // Wet gain scales proportionally with depth (0 to 60%).
    // The old binary 0/0.5 jump meant 1% depth sounded the same as 100%.
    this.chorusWetGain.gain.setTargetAtTime(clamped * 0.6, t, 0.01)
  }

  setSaturationDrive(drive: number): void {
    this.satDrive = Math.max(0, Math.min(1, drive))
    // Debounce the curve rebuild via rAF to avoid rebuilding on every slider tick
    if (this.satRafId !== null) return
    this.satRafId = requestAnimationFrame(() => {
      this.satNode.curve = this.buildSatCurve(this.satDrive)
      this.satRafId = null
    })
  }

  setHzFrequency(hz: number | null): void {
    const t = (this.ctx as AudioContext).currentTime
    if (hz === null) {
      this.hzFilter.gain.setTargetAtTime(0, t, 0.01)
    } else {
      // Smooth the frequency transition too — an instantaneous jump on a
      // peaking filter causes an audible click when switching Hz presets.
      this.hzFilter.frequency.setTargetAtTime(hz, t, 0.02)
      this.hzFilter.gain.setTargetAtTime(4, t, 0.01)
    }
  }

  getOutputNode(): AudioNode {
    return this.outputNode
  }

  // Soft-clip waveshaping curve using a normalized tanh transfer function.
  // drive=0: transparent (effectively linear)
  // drive=1: clear but musical saturation — no harsh clipping
  //
  // Normalization: y = tanh(k*x) / tanh(k) guarantees that x=±1 always
  // maps to y=±1, so there is zero gain change — only waveform shaping.
  //
  // 4096 samples (vs the previous 256) eliminates aliasing artifacts at high
  // drive settings — WaveShaperNode interpolates between samples, so a coarse
  // curve introduces intermodulation distortion on high-frequency content.
  private buildSatCurve(drive: number): Float32Array<ArrayBuffer> {
    const n = 4096
    const curve: Float32Array<ArrayBuffer> = new Float32Array(n)
    // k from ~0 (linear) to 6 (noticeable but never harsh saturation)
    const k    = drive * 6 + 0.001
    const norm = Math.tanh(k)

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1  // -1 to +1
      curve[i] = Math.tanh(k * x) / norm
    }

    return curve
  }
}
