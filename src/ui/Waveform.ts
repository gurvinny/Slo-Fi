const UNPLAYED_COLOR = '#1a1a2c'

// Reads a CSS custom property from :root so waveform colours follow the theme.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export class Waveform {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private data: Float32Array = new Float32Array(0)
  private progress = 0
  private hoverX = -1
  private _onSeek: ((ratio: number) => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.bindEvents()
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  set onSeek(fn: (ratio: number) => void) {
    this._onSeek = fn
  }

  setData(data: Float32Array): void {
    this.data = data
    this.draw()
  }

  setProgress(ratio: number): void {
    this.progress = Math.max(0, Math.min(1, ratio))
    this.draw()
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.ctx.scale(dpr, dpr)
    this.draw()
  }

  private draw(): void {
    const { canvas, ctx, data, progress, hoverX } = this
    const dpr = window.devicePixelRatio || 1
    const W = canvas.width / dpr
    const H = canvas.height / dpr
    const cy = H / 2

    ctx.clearRect(0, 0, W, H)

    // Read theme colours fresh each draw so switching themes is instant
    const accent       = cssVar('--accent')       || '#9b6dff'
    const accentBright = cssVar('--accent-bright') || '#b48aff'
    const teal         = cssVar('--teal')          || '#00d4aa'

    if (data.length === 0) {
      // Placeholder bars — tinted with the theme accent
      const count = 80
      const bw = W / count
      const phGrad = ctx.createLinearGradient(0, 0, W, 0)
      phGrad.addColorStop(0,   teal   + '33')   // 20% opacity
      phGrad.addColorStop(0.5, accent + '44')   // 27% opacity
      phGrad.addColorStop(1,   teal   + '33')
      for (let i = 0; i < count; i++) {
        const h = (Math.sin(i * 0.4) * 0.3 + 0.4) * cy * 0.3
        ctx.fillStyle = phGrad
        ctx.fillRect(i * bw + 1, cy - h, Math.max(1, bw - 2), h * 2)
      }
      return
    }

    const bw = W / data.length
    const playheadX = progress * W

    // Hover highlight — uses theme accent
    if (hoverX >= 0) {
      const hoverGrad = ctx.createLinearGradient(0, 0, hoverX, 0)
      hoverGrad.addColorStop(0,   teal   + '1a')   // 10%
      hoverGrad.addColorStop(0.5, accent + '18')   // ~9%
      hoverGrad.addColorStop(1,   teal   + '0f')   // 6%
      ctx.fillStyle = hoverGrad
      ctx.fillRect(0, 0, hoverX, H)
    }

    // Played bars — gradient between the two theme accent colours
    const playGrad = ctx.createLinearGradient(0, 0, W, 0)
    playGrad.addColorStop(0,    teal)
    playGrad.addColorStop(0.45, accent)
    playGrad.addColorStop(0.75, accentBright)
    playGrad.addColorStop(1,    teal)

    // Draw all unplayed bars first (dark)
    ctx.fillStyle = UNPLAYED_COLOR
    for (let i = 0; i < data.length; i++) {
      const x = i * bw
      const h = Math.max(1, (data[i] ?? 0) * cy * 0.92)
      ctx.fillRect(x + 0.5, cy - h, Math.max(1, bw - 1), h * 2)
    }

    // Overdraw played bars with the rainbow gradient
    ctx.fillStyle = playGrad
    for (let i = 0; i < data.length; i++) {
      const x = i * bw
      if (x >= playheadX) break
      const h = Math.max(1, (data[i] ?? 0) * cy * 0.92)
      ctx.fillRect(x + 0.5, cy - h, Math.max(1, bw - 1), h * 2)
    }

    // Playhead line with bright glow — always matches the theme accent
    if (progress > 0 && progress < 1) {
      ctx.save()
      ctx.shadowColor = accent
      ctx.shadowBlur = 14
      ctx.strokeStyle = accentBright
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.95
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, H)
      ctx.stroke()

      ctx.fillStyle = accentBright
      ctx.shadowBlur = 18
      ctx.beginPath()
      ctx.arc(playheadX, cy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  private bindEvents(): void {
    let dragging = false

    const seekAt = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      this._onSeek?.(ratio)
    }

    this.canvas.addEventListener('mousedown', (e) => {
      dragging = true
      seekAt(e.clientX)
    })

    window.addEventListener('mousemove', (e) => {
      if (!dragging) {
        const rect = this.canvas.getBoundingClientRect()
        this.hoverX = e.clientX - rect.left
        this.draw()
        return
      }
      seekAt(e.clientX)
    })

    window.addEventListener('mouseup', () => {
      dragging = false
    })

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = -1
      this.draw()
    })

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      seekAt(e.touches[0].clientX)
    }, { passive: false })

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      seekAt(e.touches[0].clientX)
    }, { passive: false })

    // Keyboard
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this._onSeek?.(Math.max(0, this.progress - 0.02))
      if (e.key === 'ArrowRight') this._onSeek?.(Math.min(1, this.progress + 0.02))
    })
  }
}
