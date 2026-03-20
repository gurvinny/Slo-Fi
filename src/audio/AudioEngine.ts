export class AudioEngine {
  private context: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private sourceNode: AudioBufferSourceNode | null = null

  // Graph nodes
  private convolverNode: ConvolverNode | null = null
  private dryGainNode: GainNode | null = null
  private wetGainNode: GainNode | null = null
  private masterGainNode: GainNode | null = null

  // State
  private _playbackRate = 1.0
  private _reverbMix = 0.2
  private _volume = 0.8
  private _reverbDecay = 2.5
  private _reverbRoomSize = 0.5
  private _isPlaying = false
  private _startContextTime = 0
  private _startOffset = 0

  private timeUpdateTimer: ReturnType<typeof setInterval> | null = null

  public onEnded: (() => void) | null = null
  public onTimeUpdate: ((current: number, duration: number) => void) | null = null

  // ── Getters ────────────────────────────────────────────────────────────────

  get isPlaying() {
    return this._isPlaying
  }

  get hasBuffer() {
    return this.buffer !== null
  }

  get duration() {
    return this.buffer?.duration ?? 0
  }

  get currentTime(): number {
    if (!this.context || !this._isPlaying) return this._startOffset
    const elapsed = this.context.currentTime - this._startContextTime
    return Math.min(this._startOffset + elapsed * this._playbackRate, this.duration)
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  private async ensureContext(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume()
      return
    }

    this.context = new AudioContext({ latencyHint: 'interactive' })
    this.convolverNode = this.context.createConvolver()
    this.dryGainNode = this.context.createGain()
    this.wetGainNode = this.context.createGain()
    this.masterGainNode = this.context.createGain()

    this.dryGainNode.gain.value = 1 - this._reverbMix
    this.wetGainNode.gain.value = this._reverbMix
    this.masterGainNode.gain.value = this._volume

    // Signal graph:
    // source ─┬─→ dryGain ─────────────┐
    //          └─→ convolver → wetGain ─┴─→ masterGain → destination
    this.dryGainNode.connect(this.masterGainNode)
    this.convolverNode.connect(this.wetGainNode)
    this.wetGainNode.connect(this.masterGainNode)
    this.masterGainNode.connect(this.context.destination)

    this.convolverNode.buffer = this.buildIR(this._reverbDecay, this._reverbRoomSize)
  }

  // ── File loading ───────────────────────────────────────────────────────────

  async loadFile(file: File): Promise<void> {
    await this.ensureContext()
    this.stop()
    const arrayBuffer = await file.arrayBuffer()
    this.buffer = await this.context!.decodeAudioData(arrayBuffer)
    this._startOffset = 0
  }

  // ── Transport ──────────────────────────────────────────────────────────────

  async play(): Promise<void> {
    if (!this.buffer) return
    await this.ensureContext()
    this.destroySource()

    this.sourceNode = this.context!.createBufferSource()
    this.sourceNode.buffer = this.buffer
    this.sourceNode.playbackRate.value = this._playbackRate

    // Use preservesPitch where available (Chromium 86+)
    if ('preservesPitch' in this.sourceNode) {
      (this.sourceNode as AudioBufferSourceNode & { preservesPitch: boolean }).preservesPitch = true
    }

    this.sourceNode.connect(this.dryGainNode!)
    this.sourceNode.connect(this.convolverNode!)

    this.sourceNode.addEventListener('ended', () => {
      if (this._isPlaying) {
        this._isPlaying = false
        this._startOffset = 0
        this.stopTimer()
        this.onEnded?.()
        this.onTimeUpdate?.(0, this.duration)
      }
    })

    this._startContextTime = this.context!.currentTime
    this.sourceNode.start(0, this._startOffset)
    this._isPlaying = true
    this.startTimer()
  }

  pause(): void {
    if (!this._isPlaying) return
    this._startOffset = this.currentTime
    this.destroySource()
    this._isPlaying = false
    this.stopTimer()
    this.onTimeUpdate?.(this._startOffset, this.duration)
  }

  stop(): void {
    this.destroySource()
    this._isPlaying = false
    this._startOffset = 0
    this.stopTimer()
    this.onTimeUpdate?.(0, this.duration)
  }

  seek(time: number): void {
    const clamped = Math.max(0, Math.min(time, this.duration))
    const wasPlaying = this._isPlaying
    this._startOffset = clamped
    if (wasPlaying) {
      this.play()
    } else {
      this.onTimeUpdate?.(this._startOffset, this.duration)
    }
  }

  private destroySource(): void {
    if (this.sourceNode) {
      this.sourceNode.onended = null
      try {
        this.sourceNode.stop(0)
      } catch {
        // Already stopped
      }
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
  }

  // ── Parameters ─────────────────────────────────────────────────────────────

  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(1.0, rate))
    if (this._isPlaying && this.sourceNode && this.context) {
      // Snapshot current position so formula stays correct after rate change
      const pos = this.currentTime
      this._startOffset = pos
      this._startContextTime = this.context.currentTime
      this._playbackRate = clamped
      this.sourceNode.playbackRate.value = clamped
    } else {
      this._playbackRate = clamped
    }
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume))
    if (this.masterGainNode && this.context) {
      this.masterGainNode.gain.setTargetAtTime(this._volume, this.context.currentTime, 0.01)
    }
  }

  setReverbMix(mix: number): void {
    this._reverbMix = Math.max(0, Math.min(1, mix))
    if (this.dryGainNode && this.wetGainNode && this.context) {
      const t = this.context.currentTime
      this.dryGainNode.gain.setTargetAtTime(1 - this._reverbMix, t, 0.01)
      this.wetGainNode.gain.setTargetAtTime(this._reverbMix, t, 0.01)
    }
  }

  setReverbDecay(decaySeconds: number): void {
    this._reverbDecay = Math.max(0.1, Math.min(8.0, decaySeconds))
    this.rebuildIR()
  }

  setReverbRoomSize(size: number): void {
    this._reverbRoomSize = Math.max(0.01, Math.min(1.0, size))
    this.rebuildIR()
  }

  private rebuildIR(): void {
    if (!this.convolverNode || !this.context) return
    this.convolverNode.buffer = this.buildIR(this._reverbDecay, this._reverbRoomSize)
  }

  // ── Synthetic impulse response generation ──────────────────────────────────
  //
  // Creates a stereo exponential-decay noise buffer that models room acoustics.
  // decay   — reverb tail length in seconds
  // size    — affects the rate of decay (larger = longer, denser reflections)

  private buildIR(decay: number, size: number): AudioBuffer {
    const ctx = this.context!
    const sr = ctx.sampleRate
    const len = Math.floor(sr * Math.max(0.1, decay))
    const ir = ctx.createBuffer(2, len, sr)
    const decayRate = 3.0 / (decay * (0.15 + size * 0.85))

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        const t = i / sr
        const envelope = Math.exp(-t * decayRate)
        data[i] = (Math.random() * 2 - 1) * envelope
      }
    }

    return ir
  }

  // ── Waveform data ──────────────────────────────────────────────────────────

  getWaveform(samples: number): Float32Array {
    if (!this.buffer) return new Float32Array(samples)
    const raw = this.buffer.getChannelData(0)
    const blockSize = Math.floor(raw.length / samples)
    const waveform = new Float32Array(samples)

    for (let i = 0; i < samples; i++) {
      let peak = 0
      const base = i * blockSize
      for (let j = 0; j < blockSize; j++) {
        const abs = Math.abs(raw[base + j] ?? 0)
        if (abs > peak) peak = abs
      }
      waveform[i] = peak
    }

    return waveform
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  private startTimer(): void {
    this.stopTimer()
    this.timeUpdateTimer = setInterval(() => {
      if (this._isPlaying) {
        this.onTimeUpdate?.(this.currentTime, this.duration)
      }
    }, 80)
  }

  private stopTimer(): void {
    if (this.timeUpdateTimer !== null) {
      clearInterval(this.timeUpdateTimer)
      this.timeUpdateTimer = null
    }
  }
}
