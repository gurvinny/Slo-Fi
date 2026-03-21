const UNPLAYED_COLOR = '#1e1e30'
const PLAYED_COLOR = '#9b6dff'
const PLAYHEAD_COLOR = 'rgba(155, 109, 255, 0.9)'
const HOVER_COLOR = 'rgba(155, 109, 255, 0.15)'

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

    if (data.length === 0) {
      // Empty state placeholder bars
      const count = 80
      const bw = W / count
      for (let i = 0; i < count; i++) {
        const h = (Math.sin(i * 0.4) * 0.3 + 0.4) * cy * 0.3
        ctx.fillStyle = '#1a1a28'
        ctx.fillRect(i * bw + 1, cy - h, Math.max(1, bw - 2), h * 2)
      }
      return
    }

    const bw = W / data.length
    const playheadX = progress * W

    // Hover highlight
    if (hoverX >= 0) {
      ctx.fillStyle = HOVER_COLOR
      ctx.fillRect(0, 0, hoverX, H)
    }

    // Bars
    for (let i = 0; i < data.length; i++) {
      const x = i * bw
      const h = Math.max(1, data[i] * cy * 0.92)
      ctx.fillStyle = x < playheadX ? PLAYED_COLOR : UNPLAYED_COLOR
      ctx.fillRect(x + 0.5, cy - h, Math.max(1, bw - 1), h * 2)
    }

    // Playhead line
    if (progress > 0 && progress < 1) {
      ctx.strokeStyle = PLAYHEAD_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, H)
      ctx.stroke()

      // Playhead handle
      ctx.fillStyle = PLAYHEAD_COLOR
      ctx.beginPath()
      ctx.arc(playheadX, cy, 4, 0, Math.PI * 2)
      ctx.fill()
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
