import type { GrainBand } from '../types'

// Main-thread wrapper for the GrainField worklet. Owns:
//   • Module load + AudioWorkletNode creation
//   • One-shot OfflineAudioContext band split (bass / mid / treble) per track
//   • Zero-copy postMessage transfer of the resulting Float32Arrays
//   • Param + freeze + enable setters that forward to the worklet
//   • Grain-spawn callback fired by the worklet for UI / visualization use

export type GrainParamName =
  | 'position'
  | 'grainSize'
  | 'density'
  | 'spread'
  | 'pitchScatter'
  | 'attack'
  | 'decay'
  | 'mix'

const BAND_PARAM_PREFIX: Record<GrainBand, string> = {
  bass:   'bass',
  mid:    'mid',
  treble: 'treble',
}

export class GranularEngine {
  private node: AudioWorkletNode | null = null
  private ctx: AudioContext | null = null
  private _ready = false
  private _moduleLoaded = false

  // Cached freeze + enable state so AudioEngine can re-apply on track change.
  private _freeze: Record<GrainBand, boolean> = { bass: false, mid: false, treble: false }
  private _enable: Record<GrainBand, boolean> = { bass: true,  mid: true,  treble: true  }

  // Fired by the worklet on every grain start, rate-limited to ~32 per
  // process-block (≈ 1500/sec at worst). UI can downsample further.
  public onGrainSpawn: ((voice: 0 | 1 | 2, posNorm: number, sizeMs: number, pan: number) => void) | null = null

  async init(ctx: AudioContext): Promise<AudioNode> {
    this.ctx = ctx
    if (!this._moduleLoaded) {
      await ctx.audioWorklet.addModule('/worklets/granular-processor.js')
      this._moduleLoaded = true
    }
    this.node = new AudioWorkletNode(ctx, 'granular-processor', {
      numberOfInputs:  0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    })
    this.node.port.onmessage = (e) => {
      const d = e.data
      if (d && d.type === 'grainSpawn') {
        this.onGrainSpawn?.(d.voice, d.posNorm, d.sizeMs, d.pan)
      }
    }
    this._ready = true
    // Re-apply freeze + enable in case they were set before init
    for (const band of ['bass', 'mid', 'treble'] as GrainBand[]) {
      this.setBandFreeze(band, this._freeze[band])
      this.setBandEnable(band, this._enable[band])
    }
    return this.node
  }

  // Computes three band-filtered stereo copies of the decoded PCM using
  // parallel OfflineAudioContexts, then transfers them zero-copy to the
  // worklet. Crossovers 250 Hz / 4 kHz match the EQ band centres in EffectsChain.
  async loadPcm(buffer: AudioBuffer): Promise<void> {
    if (!this.node) return
    // Drop existing PCM before sending new arrays so the worklet releases the
    // previous Float32Arrays — important on iOS where memory pressure stacks.
    this.node.port.postMessage({ type: 'clear' })

    const sr = buffer.sampleRate
    const length = buffer.length
    const channels = Math.min(2, buffer.numberOfChannels)

    const renderBand = async (
      filters: Array<{ type: BiquadFilterType; frequency: number; Q?: number }>,
    ): Promise<{ L: Float32Array; R: Float32Array }> => {
      const offline = new OfflineAudioContext(channels, length, sr)
      const src = offline.createBufferSource()
      src.buffer = buffer
      let node: AudioNode = src
      for (const f of filters) {
        const biq = offline.createBiquadFilter()
        biq.type = f.type
        biq.frequency.value = f.frequency
        if (f.Q !== undefined) biq.Q.value = f.Q
        node.connect(biq)
        node = biq
      }
      node.connect(offline.destination)
      src.start(0)
      const rendered = await offline.startRendering()
      const L = new Float32Array(rendered.getChannelData(0))
      const R = channels > 1
        ? new Float32Array(rendered.getChannelData(1))
        : L
      return { L, R }
    }

    const [bass, mid, treble] = await Promise.all([
      renderBand([{ type: 'lowpass',  frequency: 250,  Q: 0.707 }]),
      renderBand([
        { type: 'highpass', frequency: 250,  Q: 0.707 },
        { type: 'lowpass',  frequency: 4000, Q: 0.707 },
      ]),
      renderBand([{ type: 'highpass', frequency: 4000, Q: 0.707 }]),
    ])

    // Build transfer list — each band has L + R buffers. When R === L (mono),
    // only transfer one. ArrayBuffers are transferable so the main-thread
    // arrays become detached after this call.
    const transfer: ArrayBuffer[] = []
    const pack = (b: { L: Float32Array; R: Float32Array }) => {
      // Float32Arrays we just constructed are backed by ArrayBuffer (not SAB)
      // — cast is safe and required because the typed-array signature widens
      // to ArrayBufferLike in TS 5.9.
      transfer.push(b.L.buffer as ArrayBuffer)
      if (b.R !== b.L) transfer.push(b.R.buffer as ArrayBuffer)
      return { L: b.L, R: b.R }
    }
    this.node.port.postMessage(
      {
        type: 'loadPcm',
        sampleRate: sr,
        bands: [pack(bass), pack(mid), pack(treble)],
      },
      transfer,
    )
  }

  clearPcm(): void {
    this.node?.port.postMessage({ type: 'clear' })
  }

  setParam(name: GrainParamName, value: number): void {
    if (!this.node || !this.ctx) return
    const p = this.node.parameters.get(name)
    if (!p) return
    p.setTargetAtTime(value, this.ctx.currentTime, 0.01)
  }

  setBandFreeze(band: GrainBand, frozen: boolean): void {
    this._freeze[band] = frozen
    if (!this.node || !this.ctx) return
    const paramName = `${BAND_PARAM_PREFIX[band]}Freeze`
    const p = this.node.parameters.get(paramName)
    if (p) p.setValueAtTime(frozen ? 1 : 0, this.ctx.currentTime)
  }

  setBandEnable(band: GrainBand, enabled: boolean): void {
    this._enable[band] = enabled
    if (!this.node || !this.ctx) return
    const paramName = `${BAND_PARAM_PREFIX[band]}Enable`
    const p = this.node.parameters.get(paramName)
    if (p) p.setValueAtTime(enabled ? 1 : 0, this.ctx.currentTime)
  }

  getNode(): AudioNode | null { return this.node }
  get ready(): boolean { return this._ready }
  getFreeze(): Record<GrainBand, boolean> { return { ...this._freeze } }
  getEnable(): Record<GrainBand, boolean> { return { ...this._enable } }
}
