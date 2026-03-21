// Renders a real-time frequency spectrum on a canvas element.
// Uses a logarithmic scale (20Hz to 20kHz) to match how we hear.
export class SpectrumAnalyzer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private analyser: AnalyserNode
  private freqData: Uint8Array<ArrayBuffer>
  private rafId: number | null = null

  constructor(canvas: HTMLCanvasElement, analyser: AnalyserNode) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.analyser = analyser
    this.freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
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

  private draw(): void {
    const { canvas, ctx, freqData, analyser } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    const sampleRate = analyser.context.sampleRate
    const binCount = freqData.length

    ctx.clearRect(0, 0, W, H)

    // Gradient from accent purple (low) to teal (high)
    const grad = ctx.createLinearGradient(0, H, 0, 0)
    grad.addColorStop(0, 'rgba(155, 109, 255, 0.9)')
    grad.addColorStop(1, 'rgba(0, 212, 170, 0.9)')
    ctx.fillStyle = grad

    const minFreq = 20
    const maxFreq = 20000

    for (let x = 0; x < W; x++) {
      // Map pixel x to a frequency on a log scale
      const freq = minFreq * Math.pow(maxFreq / minFreq, x / W)
      const binIndex = Math.min(
        binCount - 1,
        Math.round((freq * binCount * 2) / sampleRate),
      )
      const value = freqData[binIndex] ?? 0
      // value is 0-255, map to bar height
      const barHeight = (value / 255) * H * 0.9
      if (barHeight > 0) {
        ctx.fillRect(x, H - barHeight, 1, barHeight)
      }
    }
  }

  // Shows a dim placeholder when not playing
  private drawIdle(): void {
    const { canvas, ctx } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    ctx.clearRect(0, 0, W, H)

    ctx.fillStyle = 'rgba(155, 109, 255, 0.12)'
    const count = 48
    const bw = W / count
    for (let i = 0; i < count; i++) {
      const h = (Math.sin(i * 0.5) * 0.25 + 0.3) * H * 0.5
      ctx.fillRect(i * bw + 0.5, H - h, Math.max(1, bw - 1), h)
    }
  }
}
