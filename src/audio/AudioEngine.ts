import { EffectsChain } from './EffectsChain'
import type { AudioParams } from '../types'

// Builds an exponential-decay noise IR that models room acoustics.
// Extracted to module scope so Exporter.ts can use it without importing AudioEngine.
export function buildIR(ctx: BaseAudioContext, decay: number, size: number): AudioBuffer {
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

export class AudioEngine {
  private context: AudioContext | null = null
  private buffer: AudioBuffer | null = null
  private sourceNode: AudioBufferSourceNode | null = null

  // Core graph nodes
  private convolverNode: ConvolverNode | null = null
  private dryGainNode: GainNode | null = null
  private wetGainNode: GainNode | null = null
  private masterGainNode: GainNode | null = null

  // Effects chain (EQ, chorus, saturation) inserted after masterGain
  private _effectsChain: EffectsChain | null = null

  // Analyser tapped from effects chain output for the spectrum visualizer
  private _analyserNode: AnalyserNode | null = null

  // 8D binaural panner — sits after analyser, before destination
  private _panner8D: PannerNode | null = null
  private _8DEnabled = false
  private _8DSpeed   = 0.5   // Hz, rotation rate
  private _8DRafId:  number | null = null

  // Fires each animation frame when 8D is enabled, with the current angle in radians.
  // App.ts uses this to keep the orb rotation in sync with the panner.
  public on8DAngleUpdate: ((angle: number) => void) | null = null

  // Incremented each time a new source node is started. Lets the 'ended'
  // handler distinguish "this source finished naturally" from "this source was
  // stopped early because we seeked or restarted."
  private _sourceGeneration = 0

  // State
  private _playbackRate = 1.0
  private _reverbMix = 0.2
  private _volume = 0.8
  private _reverbDecay = 2.5
  private _reverbRoomSize = 0.5
  private _isPlaying = false
  private _startContextTime = 0
  private _startOffset = 0

  // Loop region
  private _loopEnabled  = false
  private _loopStart    = 0      // seconds
  private _loopEnd      = 0      // seconds (0 = unset)
  private _lastPollTime = -1     // previous poll position for cycle detection

  // Inserted between sourceNode and dry/convolver split for xfade dips
  private _loopXfadeGain: GainNode | null = null

  // EQ/chorus/saturation state (mirrors what EffectsChain holds internally)
  private _eq = { low: 0, mid: 0, high: 0 }
  private _chorus = { rate: 0.8, depth: 0 }
  private _saturationDrive = 0
  private _hzFrequency: number | null = null

  private timeUpdateTimer: ReturnType<typeof setInterval> | null = null

  public onEnded: (() => void) | null = null
  public onTimeUpdate: ((current: number, duration: number) => void) | null = null
  public onLoopCycle: (() => void) | null = null

  // Getters

  get isPlaying() { return this._isPlaying }
  get hasBuffer() { return this.buffer !== null }
  get duration() { return this.buffer?.duration ?? 0 }

  get currentTime(): number {
    if (!this.context || !this._isPlaying) return this._startOffset
    const elapsed = this.context.currentTime - this._startContextTime
    const raw = this._startOffset + elapsed * this._playbackRate
    if (this._loopEnabled && this._loopEnd > this._loopStart) {
      const regionLen = this._loopEnd - this._loopStart
      if (raw >= this._loopEnd) {
        return this._loopStart + ((raw - this._loopStart) % regionLen)
      }
    }
    return Math.min(raw, this.duration)
  }

  get effectsChain(): EffectsChain | null { return this._effectsChain }
  get analyserNode(): AnalyserNode | null { return this._analyserNode }

  getBuffer(): AudioBuffer | null { return this.buffer }

  getParams(): AudioParams {
    return {
      playbackRate: this._playbackRate,
      reverbMix: this._reverbMix,
      reverbDecay: this._reverbDecay,
      reverbRoomSize: this._reverbRoomSize,
      volume: this._volume,
      eq: { ...this._eq },
      chorus: { ...this._chorus },
      saturationDrive: this._saturationDrive,
      hzFrequency: this._hzFrequency,
    }
  }

  // Setup

  private async ensureContext(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume()
      return
    }

    this.context = new AudioContext({ latencyHint: 'interactive' })

    // Crossfade gain: sits between sourceNode and the dry/wet split.
    // Normally at 1.0; briefly dipped on loop boundaries to remove convolver artifacts.
    this._loopXfadeGain = this.context.createGain()
    this._loopXfadeGain.gain.value = 1

    // Reverb nodes
    this.convolverNode = this.context.createConvolver()
    this.dryGainNode = this.context.createGain()
    this.wetGainNode = this.context.createGain()
    this.masterGainNode = this.context.createGain()

    this.dryGainNode.gain.value = 1 - this._reverbMix
    this.wetGainNode.gain.value = this._reverbMix
    this.masterGainNode.gain.value = this._volume

    // Reverb graph: source → xfadeGain → dry and wet paths, both merge at masterGain
    this._loopXfadeGain.connect(this.dryGainNode)
    this._loopXfadeGain.connect(this.convolverNode)
    this.dryGainNode.connect(this.masterGainNode)
    this.convolverNode.connect(this.wetGainNode)
    this.wetGainNode.connect(this.masterGainNode)

    this.convolverNode.buffer = buildIR(this.context, this._reverbDecay, this._reverbRoomSize)

    // Effects chain sits between masterGain and destination
    this._effectsChain = new EffectsChain()
    const chainOutput = this._effectsChain.init(this.context, this.masterGainNode)

    // Analyser taps the fully processed signal
    this._analyserNode = this.context.createAnalyser()
    this._analyserNode.fftSize = 2048
    this._analyserNode.smoothingTimeConstant = 0.8
    this._analyserNode.minDecibels = -90
    this._analyserNode.maxDecibels = -10
    chainOutput.connect(this._analyserNode)

    // 8D panner sits after the analyser so visualisation sees the pre-spatial signal.
    // Default position (0, 0, -1) = directly ahead — transparent when 8D is off.
    this._panner8D = this.context.createPanner()
    this._panner8D.panningModel  = 'equalpower'  // overridden to HRTF when 8D enabled
    this._panner8D.positionX.value =  0
    this._panner8D.positionY.value =  0
    this._panner8D.positionZ.value = -1
    this._analyserNode.connect(this._panner8D)
    this._panner8D.connect(this.context.destination)
  }

  // File loading

  async loadFile(file: File): Promise<void> {
    // Basic security checks before handing to AudioContext
    const maxBytes = 300 * 1024 * 1024  // 300 MB cap
    if (file.size > maxBytes) throw new Error('File is too large (max 300 MB)')

    await this.ensureContext()
    this.stop()
    const arrayBuffer = await file.arrayBuffer()
    this.buffer = await this.context!.decodeAudioData(arrayBuffer)
    this._startOffset = 0
  }

  // Transport

  async play(): Promise<void> {
    if (!this.buffer) return
    await this.ensureContext()
    this.destroySource()

    this.sourceNode = this.context!.createBufferSource()
    this.sourceNode.buffer = this.buffer
    this.sourceNode.playbackRate.value = this._playbackRate

    if ('preservesPitch' in this.sourceNode) {
      (this.sourceNode as AudioBufferSourceNode & { preservesPitch: boolean }).preservesPitch = true
    }

    // Configure native loop before connecting if enabled
    if (this._loopEnabled && this._loopEnd > this._loopStart) {
      this.sourceNode.loop      = true
      this.sourceNode.loopStart = this._loopStart
      this.sourceNode.loopEnd   = this._loopEnd
      // Clamp start offset into the loop region
      if (this._startOffset < this._loopStart || this._startOffset >= this._loopEnd) {
        this._startOffset = this._loopStart
      }
    }

    this.sourceNode.connect(this._loopXfadeGain!)

    // Capture generation so that if this source is stopped early (seek,
    // pause, stop) the 'ended' event that fires from sourceNode.stop() does
    // not mistakenly trigger the track-finished callback.
    const myGen = ++this._sourceGeneration
    this.sourceNode.addEventListener('ended', () => {
      if (this._isPlaying && this._sourceGeneration === myGen) {
        this._isPlaying = false
        this._startOffset = 0
        this.stopTimer()
        this._lastPollTime = -1
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
    this._lastPollTime = -1
    this.stopTimer()
    this.onTimeUpdate?.(0, this.duration)
  }

  seek(time: number): void {
    const clamped = Math.max(0, Math.min(time, this.duration))
    const wasPlaying = this._isPlaying
    this._startOffset = clamped
    this._lastPollTime = -1
    if (wasPlaying) {
      this.play()
    } else {
      this.onTimeUpdate?.(this._startOffset, this.duration)
    }
  }

  private destroySource(): void {
    if (this.sourceNode) {
      this.sourceNode.onended = null
      try { this.sourceNode.stop(0) } catch { /* already stopped */ }
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
  }

  // Parameter setters

  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.50, Math.min(1.70, rate))
    if (this._isPlaying && this.sourceNode && this.context) {
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

  setEQ(band: 'low' | 'mid' | 'high', db: number): void {
    this._eq[band] = Math.max(-12, Math.min(12, db))
    this._effectsChain?.setEQBand(band, this._eq[band])
  }

  setChorusRate(hz: number): void {
    this._chorus.rate = Math.max(0.1, Math.min(5, hz))
    this._effectsChain?.setChorusRate(this._chorus.rate)
  }

  setChorusDepth(depth: number): void {
    this._chorus.depth = Math.max(0, Math.min(1, depth))
    this._effectsChain?.setChorusDepth(this._chorus.depth)
  }

  setSaturationDrive(drive: number): void {
    this._saturationDrive = Math.max(0, Math.min(1, drive))
    this._effectsChain?.setSaturationDrive(this._saturationDrive)
  }

  // Applies a full preset in one shot. Used by PresetController.
  applyPreset(params: AudioParams): void {
    this.setPlaybackRate(params.playbackRate)
    this.setReverbMix(params.reverbMix)
    this.setReverbDecay(params.reverbDecay)
    this.setReverbRoomSize(params.reverbRoomSize)
    this.setVolume(params.volume)
    this.setEQ('low', params.eq.low)
    this.setEQ('mid', params.eq.mid)
    this.setEQ('high', params.eq.high)
    this.setChorusRate(params.chorus.rate)
    this.setChorusDepth(params.chorus.depth)
    this.setSaturationDrive(params.saturationDrive)
    this.setHzFrequency(params.hzFrequency)
  }

  setHzFrequency(hz: number | null): void {
    this._hzFrequency = hz
    this._effectsChain?.setHzFrequency(hz)
  }

  // 8D binaural panning

  set8DEnabled(enabled: boolean): void {
    if (!this._panner8D) return
    this._8DEnabled = enabled

    if (enabled) {
      // Switch to HRTF for binaural rendering and start the animation loop
      this._panner8D.panningModel = 'HRTF'
      this._start8DLoop()
    } else {
      // Stop the animation loop and return panner to a neutral position
      this._stop8DLoop()
      this._panner8D.panningModel  = 'equalpower'
      this._panner8D.positionX.value =  0
      this._panner8D.positionY.value =  0
      this._panner8D.positionZ.value = -1
      this.on8DAngleUpdate?.(0)
    }
  }

  set8DSpeed(hz: number): void {
    this._8DSpeed = Math.max(0.1, Math.min(2, hz))
  }

  get8DEnabled(): boolean { return this._8DEnabled }
  get8DSpeed():   number  { return this._8DSpeed }

  private _start8DLoop(): void {
    if (this._8DRafId !== null) return
    const tick = () => {
      if (!this._8DEnabled || !this._panner8D) return
      this._8DRafId = requestAnimationFrame(tick)

      // Derive angle from wall time so the rotation is always smooth and
      // never jumps when playback is paused or resumed.
      const wallSec = performance.now() / 1000
      const angle   = (wallSec * 2 * Math.PI * this._8DSpeed) % (2 * Math.PI)

      // Place the sound source on a horizontal circle of radius 5 m
      const r = 5
      this._panner8D.positionX.value = r * Math.sin(angle)
      this._panner8D.positionY.value = 0
      this._panner8D.positionZ.value = -r * Math.cos(angle)

      this.on8DAngleUpdate?.(angle)
    }
    this._8DRafId = requestAnimationFrame(tick)
  }

  private _stop8DLoop(): void {
    if (this._8DRafId !== null) {
      cancelAnimationFrame(this._8DRafId)
      this._8DRafId = null
    }
  }

  // Loop region control

  setLoop(startSec: number, endSec: number): void {
    const dur = this.duration
    const start = Math.max(0, Math.min(startSec, dur))
    const end   = Math.max(start + 0.05, Math.min(endSec, dur))
    this._loopStart    = start
    this._loopEnd      = end
    this._lastPollTime = -1
    if (this._isPlaying && this._loopEnabled) this.play()
  }

  setLoopEnabled(enabled: boolean): void {
    this._loopEnabled  = enabled
    this._lastPollTime = -1
    if (this._isPlaying) {
      if (!enabled && this._loopEnd > 0) {
        // If current position is past loopEnd, jump back to loopStart
        if (this.currentTime >= this._loopEnd) {
          this._startOffset = this._loopStart
        }
      }
      this.play()
    }
  }

  getLoopState(): { enabled: boolean; start: number; end: number } {
    return { enabled: this._loopEnabled, start: this._loopStart, end: this._loopEnd }
  }

  private rebuildIR(): void {
    if (!this.convolverNode || !this.context) return
    this.convolverNode.buffer = buildIR(this.context, this._reverbDecay, this._reverbRoomSize)
  }

  // Waveform data for the canvas renderer

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

  // Timer

  private startTimer(): void {
    this.stopTimer()
    this.timeUpdateTimer = setInterval(() => {
      if (this._isPlaying) {
        const now = this.currentTime
        this.onTimeUpdate?.(now, this.duration)

        // Detect loop cycle: time wrapped backwards within the loop region
        if (this._loopEnabled && this._loopEnd > this._loopStart && this._lastPollTime >= 0) {
          if (now < this._lastPollTime - 0.1) {
            this.onLoopCycle?.()
            this._scheduleXfadeDip()
          }
        }
        this._lastPollTime = now
      }
    }, 80)
  }

  // Brief 25 ms gain dip at a loop boundary to mask convolver click artifacts.
  private _scheduleXfadeDip(): void {
    if (!this.context || !this._loopXfadeGain) return
    const t = this.context.currentTime
    const g = this._loopXfadeGain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(1, t)
    g.linearRampToValueAtTime(0.15, t + 0.012)
    g.linearRampToValueAtTime(1,    t + 0.025)
  }

  private stopTimer(): void {
    if (this.timeUpdateTimer !== null) {
      clearInterval(this.timeUpdateTimer)
      this.timeUpdateTimer = null
    }
  }
}
