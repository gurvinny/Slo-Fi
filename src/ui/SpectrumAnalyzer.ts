// Renders a real-time frequency spectrum on a canvas element.
// Uses a logarithmic scale (20 Hz to 20 kHz) to match how we hear.
// Fires onEnergyUpdate each frame so the aurora background can react to the audio.

const BAR_COUNT = 64
const MIN_FREQ = 20
const MAX_FREQ = 20000

// How fast peak markers fall back down (normalized height units per frame)
const PEAK_DECAY = 0.004

// Smooth the aurora color update so it doesn't snap between frames
const AURORA_LERP = 0.08

// Interpolates between purple (low energy) and teal (high energy)
function lerpColor(t: number): string {
  const r = Math.round(155 + (0   - 155) * t)
  const g = Math.round(109 + (212 - 109) * t)
  const b = Math.round(255 + (170 - 255) * t)
  return `rgb(${r},${g},${b})`
}

export class SpectrumAnalyzer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private analyser: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer>

  // Peak hold: normalized height (0-1) per bar
  private peaks: Float32Array

  // Smoothed aurora energy values (0-1) updated each frame via lerp
  private smoothBass = 0
  private smoothTreble = 0
  private smoothEnergy = 0

  private rafId: number | null = null

  // Called each frame with smoothed bass/mid/treble energy (0-1 each)
  public onEnergyUpdate: ((bass: number, mid: number, treble: number) => void) | null = null

  constructor(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.analyser = analyser
    this.freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    this.peaks = new Float32Array(BAR_COUNT)
    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  start(): void {
    if (this.rafId !== null) return
    this.loop()
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    // Fade aurora back to neutral when playback stops
    this.onEnergyUpdate?.(0, 0, 0)
    this.drawIdle()
  }

  private loop(): void {
    this.analyser.getByteFrequencyData(this.freqData)
    this.draw()
    this.rafId = requestAnimationFrame(() => this.loop())
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.scale(dpr, dpr)
    this.drawIdle()
  }

  // Maps a pixel position to a frequency bin using a log scale
  private freqToBin(freq: number): number {
    const binCount = this.freqData.length
    const sampleRate = this.analyser.context.sampleRate
    return Math.min(binCount - 1, Math.round((freq * binCount * 2) / sampleRate))
  }

  // Returns the average normalized energy (0-1) across a frequency range
  private bandEnergy(minHz: number, maxHz: number): number {
    const lo = this.freqToBin(minHz)
    const hi = this.freqToBin(maxHz)
    if (hi <= lo) return 0
    let sum = 0
    for (let i = lo; i <= hi; i++) sum += this.freqData[i] ?? 0
    return sum / ((hi - lo + 1) * 255)
  }

  private draw(): void {
    const { canvas, ctx, freqData, analyser } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    const sampleRate = analyser.context.sampleRate
    const binCount = freqData.length

    ctx.clearRect(0, 0, W, H)

    // Compute per-bar heights on a log frequency scale
    const barW = W / BAR_COUNT
    const gap = Math.max(1, barW * 0.2)
    const drawW = barW - gap

    // Track overall energy for global glow
    let totalEnergy = 0

    for (let i = 0; i < BAR_COUNT; i++) {
      // Map bar index to frequency range
      const freqLo = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / BAR_COUNT)
      const freqHi = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, (i + 1) / BAR_COUNT)

      const binLo = Math.min(binCount - 1, Math.round((freqLo * binCount * 2) / sampleRate))
      const binHi = Math.min(binCount - 1, Math.round((freqHi * binCount * 2) / sampleRate))

      // Use the peak bin value in this frequency range
      let peak = 0
      for (let b = binLo; b <= binHi; b++) {
        const v = freqData[b] ?? 0
        if (v > peak) peak = v
      }

      const norm = peak / 255
      totalEnergy += norm

      // Update peak hold markers
      if (norm >= this.peaks[i]) {
        this.peaks[i] = norm
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - PEAK_DECAY)
      }

      const x = i * barW
      const barH = norm * H * 0.88
      const peakH = this.peaks[i] * H * 0.88

      if (barH < 0.5) continue

      // Bar color interpolated from purple to teal based on height
      const colorT = norm
      const barColor = lerpColor(colorT)

      // Glow intensity scales with bar height
      ctx.shadowColor = lerpColor(Math.min(1, colorT * 1.4))
      ctx.shadowBlur = 4 + norm * 18

      // Main bar fill
      ctx.fillStyle = barColor
      ctx.globalAlpha = 0.85 + norm * 0.15

      // Draw bar with rounded top (via arc)
      const bx = x + gap / 2
      const by = H - barH
      const r = Math.min(drawW / 2, 3)

      ctx.beginPath()
      ctx.moveTo(bx + r, by)
      ctx.lineTo(bx + drawW - r, by)
      ctx.quadraticCurveTo(bx + drawW, by, bx + drawW, by + r)
      ctx.lineTo(bx + drawW, H)
      ctx.lineTo(bx, H)
      ctx.lineTo(bx, by + r)
      ctx.quadraticCurveTo(bx, by, bx + r, by)
      ctx.fill()

      // Reflection below: mirror the bar at reduced opacity
      ctx.globalAlpha = 0.12 * norm
      ctx.shadowBlur = 0
      ctx.fillStyle = barColor
      ctx.fillRect(bx, H, drawW, Math.min(barH * 0.35, H * 0.2))

      // Peak hold dot
      if (peakH > 2) {
        ctx.globalAlpha = 0.7
        ctx.shadowBlur = 6
        ctx.shadowColor = '#00d4aa'
        ctx.fillStyle = '#00d4aa'
        ctx.fillRect(bx, H - peakH - 1.5, drawW, 1.5)
      }
    }

    // Reset canvas state
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1

    // Compute energy bands and smooth them toward current values
    const rawBass = this.bandEnergy(20, 250)
    const rawMid = this.bandEnergy(250, 4000)
    const rawTreble = this.bandEnergy(4000, 20000)

    this.smoothBass   += (rawBass   - this.smoothBass)   * AURORA_LERP
    this.smoothEnergy += (rawMid    - this.smoothEnergy) * AURORA_LERP
    this.smoothTreble += (rawTreble - this.smoothTreble) * AURORA_LERP

    this.onEnergyUpdate?.(this.smoothBass, this.smoothEnergy, this.smoothTreble)
  }

  // Shows a dim placeholder when not playing
  private drawIdle(): void {
    const { canvas, ctx } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    ctx.clearRect(0, 0, W, H)

    const barW = W / BAR_COUNT
    const gap = Math.max(1, barW * 0.2)
    const drawW = barW - gap

    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / BAR_COUNT
      const h = (Math.sin(t * Math.PI * 3) * 0.2 + 0.25) * H * 0.45
      const x = i * barW + gap / 2
      ctx.fillStyle = lerpColor(t * 0.4)
      ctx.globalAlpha = 0.15
      ctx.fillRect(x, H - h, drawW, h)
    }

    ctx.globalAlpha = 1
  }
}
