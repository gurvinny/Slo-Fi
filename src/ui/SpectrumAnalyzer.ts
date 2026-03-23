// Real-time frequency spectrum with:
// - Slowly rotating rainbow hue (creates a drifting, trance-like color shift)
// - Gradient-filled bars (dim at base, vivid at top)
// - Rising particle sparks from high-energy bars
// - Peak hold markers with matched glow color
// Fires onEnergyUpdate each frame so the aurora background reacts to live audio.

const BAR_COUNT = 64
const MIN_FREQ = 20
const MAX_FREQ = 20000

// How fast peak markers fall back down (normalized height units per frame)
const PEAK_DECAY = 0.004

// Smooth the aurora energy values so they don't snap between frames
const AURORA_LERP = 0.08

// Cap on live particles to keep performance consistent
const MAX_PARTICLES = 150

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number   // 1.0 -> 0 as it fades out
  hue: number
  size: number
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

  // Slowly drifts over time to shift the entire color palette
  private hueOffset = 0

  private particles: Particle[] = []
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
    this.particles = []
    // Fade aurora back to neutral when playback stops
    this.onEnergyUpdate?.(0, 0, 0)
    this.drawIdle()
  }

  // Freeze the last drawn frame without clearing particles or drawing idle state.
  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  // Restart the animation loop after a pause().
  resume(): void {
    if (this.rafId !== null) return
    this.loop()
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

  // Maps a frequency (Hz) to the nearest FFT bin index
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

    // Slowly rotate hue across all bars — full cycle ~24 seconds at 60fps
    this.hueOffset = (this.hueOffset + 0.25) % 360

    ctx.clearRect(0, 0, W, H)

    const barW = W / BAR_COUNT
    const gap = Math.max(1, barW * 0.18)
    const drawW = barW - gap

    for (let i = 0; i < BAR_COUNT; i++) {
      const freqT = i / BAR_COUNT   // 0 = bass end, 1 = treble end

      // Log-scale frequency range for this bar
      const freqLo = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, i / BAR_COUNT)
      const freqHi = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, (i + 1) / BAR_COUNT)

      const binLo = Math.min(binCount - 1, Math.round((freqLo * binCount * 2) / sampleRate))
      const binHi = Math.min(binCount - 1, Math.round((freqHi * binCount * 2) / sampleRate))

      // Peak bin value in this frequency range
      let peak = 0
      for (let b = binLo; b <= binHi; b++) {
        const v = freqData[b] ?? 0
        if (v > peak) peak = v
      }

      const norm = peak / 255

      // Update peak hold markers
      if (norm >= this.peaks[i]) {
        this.peaks[i] = norm
      } else {
        this.peaks[i] = Math.max(0, this.peaks[i] - PEAK_DECAY)
      }

      const barH = norm * H * 0.90
      const peakH = this.peaks[i] * H * 0.90

      if (barH < 0.5) continue

      // Hue: violet (270) at bass, shifts toward magenta/red (350) at treble,
      // plus the slow global rotation so the whole palette drifts over time.
      const hue = (270 + freqT * 80 + this.hueOffset) % 360
      const sat = 80 + norm * 20         // 80-100% saturation
      const light = 36 + norm * 38       // 36-74% lightness

      const topColor = `hsl(${hue}, ${sat}%, ${light}%)`
      const dimColor = `hsla(${hue}, ${sat}%, ${Math.round(light * 0.5)}%, 0.35)`

      const bx = i * barW + gap / 2
      const by = H - barH
      const r = Math.min(drawW / 2, 3)

      // Gradient fill: dark and transparent at the base, vivid at the top
      const grad = ctx.createLinearGradient(bx, H, bx, by)
      grad.addColorStop(0, dimColor)
      grad.addColorStop(1, topColor)

      // Glow scales with bar height
      ctx.shadowColor = topColor
      ctx.shadowBlur = 7 + norm * 26
      ctx.globalAlpha = 0.88 + norm * 0.12
      ctx.fillStyle = grad

      // Bar with rounded top
      ctx.beginPath()
      ctx.moveTo(bx + r, by)
      ctx.lineTo(bx + drawW - r, by)
      ctx.quadraticCurveTo(bx + drawW, by, bx + drawW, by + r)
      ctx.lineTo(bx + drawW, H)
      ctx.lineTo(bx, H)
      ctx.lineTo(bx, by + r)
      ctx.quadraticCurveTo(bx, by, bx + r, by)
      ctx.fill()

      // Soft reflection below the baseline
      ctx.shadowBlur = 0
      ctx.globalAlpha = 0.14 * norm
      ctx.fillStyle = topColor
      ctx.fillRect(bx, H, drawW, Math.min(barH * 0.30, H * 0.18))

      // Peak hold marker — glows with the same hue as the bar
      if (peakH > 2) {
        const peakSat = 90
        const peakLight = 58 + this.peaks[i] * 22
        const peakColor = `hsl(${hue}, ${peakSat}%, ${peakLight}%)`
        ctx.globalAlpha = 0.85
        ctx.shadowBlur = 10
        ctx.shadowColor = peakColor
        ctx.fillStyle = peakColor
        ctx.fillRect(bx, H - peakH - 2, drawW, 2)
      }

      // Spawn a glowing particle spark from the top of high-energy bars
      if (norm > 0.65 && this.particles.length < MAX_PARTICLES && Math.random() < norm * 0.22) {
        this.particles.push({
          x: bx + drawW / 2 + (Math.random() - 0.5) * drawW,
          y: by,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -(0.6 + Math.random() * 2.0),
          life: 1.0,
          hue,
          size: 0.8 + Math.random() * 1.8,
        })
      }
    }

    // Draw and update all active particles
    ctx.shadowBlur = 0
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx
      p.y += p.vy
      p.life -= 0.032

      if (p.life <= 0 || p.y < -p.size) {
        this.particles.splice(i, 1)
        continue
      }

      const pColor = `hsl(${p.hue}, 100%, 75%)`
      ctx.globalAlpha = p.life * 0.85
      ctx.shadowColor = pColor
      ctx.shadowBlur = 7
      ctx.fillStyle = pColor
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }

    // Reset canvas state before computing energy
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1

    // Compute per-band energy and smooth toward current values
    const rawBass = this.bandEnergy(20, 250)
    const rawMid = this.bandEnergy(250, 4000)
    const rawTreble = this.bandEnergy(4000, 20000)

    this.smoothBass   += (rawBass   - this.smoothBass)   * AURORA_LERP
    this.smoothEnergy += (rawMid    - this.smoothEnergy) * AURORA_LERP
    this.smoothTreble += (rawTreble - this.smoothTreble) * AURORA_LERP

    this.onEnergyUpdate?.(this.smoothBass, this.smoothEnergy, this.smoothTreble)
  }

  // Colorful placeholder when not playing
  private drawIdle(): void {
    const { canvas, ctx } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    ctx.clearRect(0, 0, W, H)

    const barW = W / BAR_COUNT
    const gap = Math.max(1, barW * 0.18)
    const drawW = barW - gap

    for (let i = 0; i < BAR_COUNT; i++) {
      const t = i / BAR_COUNT
      const h = (Math.sin(t * Math.PI * 3) * 0.2 + 0.28) * H * 0.5
      const x = i * barW + gap / 2
      const hue = 270 + t * 80
      ctx.fillStyle = `hsl(${hue}, 65%, 40%)`
      ctx.globalAlpha = 0.18
      ctx.fillRect(x, H - h, drawW, h)
    }

    ctx.globalAlpha = 1
  }
}
