import type { AudioParams } from '../types'

// Builds and manages the post-master-gain effects chain:
//   EQ (5-band) → Chorus → Tape Saturation → Hz Resonance
//
// Chorus and saturation use AudioWorkletProcessor when available (secure context).
// Falls back to OscillatorNode+DelayNode / WaveShaperNode on plain HTTP dev servers.
//
// Call init() (async) once to build the graph. Returns the output node so
// AudioEngine can connect it to ctx.destination.

export class EffectsChain {
  // EQ nodes — 5-band parametric
  private eqLow!:     BiquadFilterNode   // lowshelf  @ 80 Hz
  private eqLowMid!:  BiquadFilterNode   // peaking   @ 250 Hz  Q=1.0
  private eqMid!:     BiquadFilterNode   // peaking   @ 1 kHz   Q=1.5
  private eqHighMid!: BiquadFilterNode   // peaking   @ 4 kHz   Q=1.0
  private eqHigh!:    BiquadFilterNode   // highshelf @ 12 kHz

  // Chorus — AudioWorklet path
  private _chorusWorkletNode: AudioWorkletNode | null = null

  // Chorus — Web Audio graph fallback
  private chorusDelay!:    DelayNode
  private chorusLfo!:      OscillatorNode
  private chorusLfoGain!:  GainNode
  private chorusDryGain!:  GainNode
  private chorusWetGain!:  GainNode
  private chorusMerge!:    GainNode

  // Saturation — AudioWorklet path
  private _satWorkletNode: AudioWorkletNode | null = null

  // Saturation — Web Audio graph fallback
  private _satFallbackNode: WaveShaperNode | null = null
  private satDrive = 0
  private satRafId: number | null = null

  // Hz frequency resonance (Solfeggio peaking filter)
  private hzFilter!: BiquadFilterNode

  private outputNode!: GainNode
  private ctx!: BaseAudioContext

  async init(ctx: BaseAudioContext, inputNode: AudioNode): Promise<AudioNode> {
    this.ctx = ctx

    // ── EQ (5-band in series) ──────────────────────────────────────────────
    this.eqLow = ctx.createBiquadFilter()
    this.eqLow.type = 'lowshelf'
    this.eqLow.frequency.value = 80

    this.eqLowMid = ctx.createBiquadFilter()
    this.eqLowMid.type = 'peaking'
    this.eqLowMid.frequency.value = 250
    this.eqLowMid.Q.value = 1.0

    this.eqMid = ctx.createBiquadFilter()
    this.eqMid.type = 'peaking'
    this.eqMid.frequency.value = 1000
    this.eqMid.Q.value = 1.5

    this.eqHighMid = ctx.createBiquadFilter()
    this.eqHighMid.type = 'peaking'
    this.eqHighMid.frequency.value = 4000
    this.eqHighMid.Q.value = 1.0

    this.eqHigh = ctx.createBiquadFilter()
    this.eqHigh.type = 'highshelf'
    this.eqHigh.frequency.value = 12000

    // ── Hz resonance ──────────────────────────────────────────────────────
    this.hzFilter = ctx.createBiquadFilter()
    this.hzFilter.type = 'peaking'
    this.hzFilter.frequency.value = 432
    this.hzFilter.Q.value = 10
    this.hzFilter.gain.value = 0

    this.outputNode = ctx.createGain()
    this.outputNode.gain.value = 1.0

    // ── Wire EQ series ────────────────────────────────────────────────────
    inputNode.connect(this.eqLow)
    this.eqLow.connect(this.eqLowMid)
    this.eqLowMid.connect(this.eqMid)
    this.eqMid.connect(this.eqHighMid)
    this.eqHighMid.connect(this.eqHigh)

    // ── Try AudioWorklet (requires secure context: HTTPS or localhost) ─────
    if (ctx instanceof AudioContext && ctx.audioWorklet) {
      try {
        await ctx.audioWorklet.addModule('/worklets/chorus-processor.js')
        await ctx.audioWorklet.addModule('/worklets/saturation-processor.js')

        this._chorusWorkletNode = new AudioWorkletNode(ctx, 'chorus-processor')
        this._satWorkletNode    = new AudioWorkletNode(ctx, 'saturation-processor')
        // Chain: EQ → chorus worklet → sat worklet → hz filter → output
        this.eqHigh.connect(this._chorusWorkletNode)
        this._chorusWorkletNode.connect(this._satWorkletNode)
        this._satWorkletNode.connect(this.hzFilter)
        this.hzFilter.connect(this.outputNode)

        console.log('[EffectsChain] AudioWorklet processors active')
      } catch (e) {
        console.log('[EffectsChain] AudioWorklet unavailable, using Web Audio graph fallback:', e)
        this._buildFallbackChain(ctx)
      }
    } else {
      this._buildFallbackChain(ctx)
    }

    return this.outputNode
  }

  // Synchronous init for OfflineAudioContext (export path).
  // AudioWorklet is not supported in OfflineAudioContext, so this always
  // uses the traditional Web Audio graph nodes.
  initOffline(ctx: OfflineAudioContext, inputNode: AudioNode, params: AudioParams): AudioNode {
    this.ctx = ctx
    this._initSync(ctx, inputNode)

    // Apply all params immediately (no smooth transitions needed for offline render)
    this.eqLow.gain.value     = params.eq.low
    this.eqLowMid.gain.value  = params.eq.lowMid
    this.eqMid.gain.value     = params.eq.mid
    this.eqHighMid.gain.value = params.eq.highMid
    this.eqHigh.gain.value    = params.eq.high
    this.chorusLfo.frequency.value  = params.chorus.rate
    this.chorusLfoGain.gain.value   = params.chorus.depth * 0.015
    this.chorusWetGain.gain.value   = params.chorus.depth * 0.6
    this._satFallbackNode!.curve    = this.buildSatCurve(params.saturationDrive)
    if (params.hzFrequency !== null) {
      this.hzFilter.frequency.value = params.hzFrequency
      this.hzFilter.gain.value = 4
    }
    this.chorusLfo.start()

    return this.outputNode
  }

  // ── Parameter setters ────────────────────────────────────────────────────

  setEQBand(band: 'low' | 'lowMid' | 'mid' | 'highMid' | 'high', db: number): void {
    const clamped = Math.max(-12, Math.min(12, db))
    const t = (this.ctx as AudioContext).currentTime
    const nodeMap = {
      low:     this.eqLow,
      lowMid:  this.eqLowMid,
      mid:     this.eqMid,
      highMid: this.eqHighMid,
      high:    this.eqHigh,
    }
    nodeMap[band].gain.setTargetAtTime(clamped, t, 0.01)
  }

  setEQFreq(band: 'low' | 'lowMid' | 'mid' | 'highMid' | 'high', hz: number): void {
    const limits: Record<string, [number, number]> = {
      low: [40, 300], lowMid: [100, 800], mid: [400, 4000], highMid: [1000, 10000], high: [5000, 20000],
    }
    const [min, max] = limits[band]
    const clamped = Math.max(min, Math.min(max, hz))
    const t = (this.ctx as AudioContext).currentTime
    const nodeMap = { low: this.eqLow, lowMid: this.eqLowMid, mid: this.eqMid, highMid: this.eqHighMid, high: this.eqHigh }
    nodeMap[band].frequency.setTargetAtTime(clamped, t, 0.01)
  }

  setEQQ(band: 'low' | 'lowMid' | 'mid' | 'highMid' | 'high', q: number): void {
    const clamped = Math.max(0.1, Math.min(10, q))
    const t = (this.ctx as AudioContext).currentTime
    const nodeMap = { low: this.eqLow, lowMid: this.eqLowMid, mid: this.eqMid, highMid: this.eqHighMid, high: this.eqHigh }
    nodeMap[band].Q.setTargetAtTime(clamped, t, 0.01)
  }

  // For lowshelf/highshelf, Q controls the shelf slope (0.5=gentle, 2.0=steep).
  setEQSlope(band: 'low' | 'high', slope: number): void {
    const clamped = Math.max(0.5, Math.min(2.0, slope))
    const t = (this.ctx as AudioContext).currentTime
    const node = band === 'low' ? this.eqLow : this.eqHigh
    node.Q.setTargetAtTime(clamped, t, 0.01)
  }

  setChorusRate(hz: number): void {
    const clamped = Math.max(0.1, Math.min(5, hz))
    const t = (this.ctx as AudioContext).currentTime
    if (this._chorusWorkletNode) {
      this._chorusWorkletNode.parameters.get('rate')!.setTargetAtTime(clamped, t, 0.01)
    } else {
      this.chorusLfo.frequency.setTargetAtTime(clamped, t, 0.01)
    }
  }

  setChorusDepth(depth: number): void {
    const clamped = Math.max(0, Math.min(1, depth))
    const t = (this.ctx as AudioContext).currentTime
    if (this._chorusWorkletNode) {
      this._chorusWorkletNode.parameters.get('depth')!.setTargetAtTime(clamped, t, 0.01)
    } else {
      this.chorusLfoGain.gain.setTargetAtTime(clamped * 0.015, t, 0.01)
      this.chorusWetGain.gain.setTargetAtTime(clamped * 0.6, t, 0.01)
    }
  }

  setSaturationDrive(drive: number): void {
    this.satDrive = Math.max(0, Math.min(1, drive))
    if (this._satWorkletNode) {
      const t = (this.ctx as AudioContext).currentTime
      this._satWorkletNode.parameters.get('drive')!.setTargetAtTime(this.satDrive, t, 0.01)
    } else {
      // Debounce curve rebuild — only rebuild on next animation frame to avoid
      // rebuilding the 4096-sample curve on every slider tick.
      if (this.satRafId !== null) return
      this.satRafId = requestAnimationFrame(() => {
        this._satFallbackNode!.curve = this.buildSatCurve(this.satDrive)
        this.satRafId = null
      })
    }
  }

  setHzFrequency(hz: number | null): void {
    const t = (this.ctx as AudioContext).currentTime
    if (hz === null) {
      this.hzFilter.gain.setTargetAtTime(0, t, 0.01)
    } else {
      this.hzFilter.frequency.setTargetAtTime(hz, t, 0.02)
      this.hzFilter.gain.setTargetAtTime(4, t, 0.01)
    }
  }

  getOutputNode(): AudioNode { return this.outputNode }

  // Returns all 5 EQ filter nodes for frequency response rendering in the UI.
  getEQNodes(): BiquadFilterNode[] {
    return [this.eqLow, this.eqLowMid, this.eqMid, this.eqHighMid, this.eqHigh]
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // Builds the Web Audio graph fallback for chorus + saturation (no worklet).
  private _buildFallbackChain(ctx: BaseAudioContext): void {
    this._initSync(ctx, null)
    // _initSync already wired the chain; just start the LFO for live context
    if (ctx instanceof AudioContext) this.chorusLfo.start()
  }

  // Constructs chorus + saturation nodes and wires them after eqHigh.
  // Called both by the fallback path (live) and by initOffline.
  private _initSync(ctx: BaseAudioContext, _inputNode: AudioNode | null): void {
    // Chorus — parallel dry/wet modulated delay
    this.chorusDelay = ctx.createDelay(0.1)
    this.chorusDelay.delayTime.value = 0.03

    this.chorusLfo = ctx.createOscillator()
    this.chorusLfo.type = 'sine'
    this.chorusLfo.frequency.value = 0.8

    this.chorusLfoGain = ctx.createGain()
    this.chorusLfoGain.gain.value = 0.003

    this.chorusDryGain = ctx.createGain()
    this.chorusDryGain.gain.value = 1.0

    this.chorusWetGain = ctx.createGain()
    this.chorusWetGain.gain.value = 0.0

    this.chorusMerge = ctx.createGain()
    this.chorusMerge.gain.value = 1.0

    // Saturation — tanh waveshaper
    this._satFallbackNode = ctx.createWaveShaper()
    this._satFallbackNode.oversample = '4x'
    this._satFallbackNode.curve = this.buildSatCurve(0)

    // Wire: EQ out → chorus dry/wet → merge → sat → hz → output
    this.eqHigh.connect(this.chorusDryGain)
    this.eqHigh.connect(this.chorusDelay)
    this.chorusLfo.connect(this.chorusLfoGain)
    this.chorusLfoGain.connect(this.chorusDelay.delayTime)
    this.chorusDelay.connect(this.chorusWetGain)
    this.chorusDryGain.connect(this.chorusMerge)
    this.chorusWetGain.connect(this.chorusMerge)
    this.chorusMerge.connect(this._satFallbackNode)
    this._satFallbackNode.connect(this.hzFilter)
    this.hzFilter.connect(this.outputNode)
  }

  // Soft-clip waveshaping curve using a normalized tanh transfer function.
  // drive=0: transparent  |  drive=1: clear musical saturation (k=6)
  // Normalization ensures x=±1 → y=±1 at all drive levels (zero gain change).
  private buildSatCurve(drive: number): Float32Array<ArrayBuffer> {
    const n    = 4096
    const curve: Float32Array<ArrayBuffer> = new Float32Array(n)
    const k    = drive * 6 + 0.001
    const norm = Math.tanh(k)
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1
      curve[i] = Math.tanh(k * x) / norm
    }
    return curve
  }
}
