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

  // Loop region state (all in ratio 0-1)
  private _loopStart   = 0
  private _loopEnd     = 1
  private _loopEnabled = false
  private _dragTarget: 'start' | 'end' | null = null

  public onLoopChange: ((start: number, end: number) => void) | null = null

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

  setLoop(start: number, end: number): void {
    this._loopStart = Math.max(0, Math.min(1, start))
    this._loopEnd   = Math.max(0, Math.min(1, end))
    this.draw()
  }

  setLoopEnabled(enabled: boolean): void {
    this._loopEnabled = enabled
    this.draw()
  }

  getLoop(): { start: number; end: number } {
    return { start: this._loopStart, end: this._loopEnd }
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

    // Loop region: shaded fill + handle lines with knobs
    // Always visible when markers are set (dimmer when disabled so user can still see them)
    if (this._loopEnd > this._loopStart) {
      const lx = this._loopStart * W
      const rx = this._loopEnd   * W

      // Shaded region
      ctx.save()
      ctx.globalAlpha = this._loopEnabled ? 0.18 : 0.07
      ctx.fillStyle   = teal
      ctx.fillRect(lx, 0, rx - lx, H)
      ctx.restore()

      // Handle lines + knobs
      const handles: Array<['start' | 'end', number]> = [
        ['start', this._loopStart],
        ['end',   this._loopEnd],
      ]
      for (const [which, ratio] of handles) {
        const hx = ratio * W
        const color = which === 'start' ? accentBright : teal
        ctx.save()
        ctx.globalAlpha = this._loopEnabled ? 0.9 : 0.4
        ctx.strokeStyle = color
        ctx.lineWidth   = 2
        ctx.beginPath()
        ctx.moveTo(hx, 0)
        ctx.lineTo(hx, H)
        ctx.stroke()
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur  = this._loopEnabled ? 8 : 0
        ctx.beginPath()
        ctx.arc(hx, cy, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
  }

  private bindEvents(): void {
    let dragging = false

    // Pending RAF for touch-seek throttling - ensures the audio engine seek
    // fires at most once per animation frame so rapid touchmove events don't
    // recreate the source node faster than it can settle.
    let _touchSeekRaf: number | null = null
    let _pendingTouchX = 0

    const seekAt = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      this._onSeek?.(ratio)
    }

    // Updates the waveform playhead position visually without triggering an
    // audio seek - used to give instant visual feedback during touch scrubbing.
    const updateVisualProgress = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect()
      this.progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      this.draw()
    }

    const seekAtThrottled = (clientX: number) => {
      _pendingTouchX = clientX
      if (_touchSeekRaf !== null) return
      _touchSeekRaf = requestAnimationFrame(() => {
        _touchSeekRaf = null
        seekAt(_pendingTouchX)
      })
    }

    // Returns which loop handle is within `radius` px of the click x, or null.
    // Mouse events use 8px for precision; touch events pass 20px for finger accuracy.
    const hitHandle = (clientX: number, radius = 8): 'start' | 'end' | null => {
      const rect = this.canvas.getBoundingClientRect()
      const x = clientX - rect.left
      if (Math.abs(x - this._loopStart * rect.width) <= radius) return 'start'
      if (Math.abs(x - this._loopEnd   * rect.width) <= radius) return 'end'
      return null
    }

    this.canvas.addEventListener('mousedown', (e) => {
      const hit = hitHandle(e.clientX)
      if (hit) {
        this._dragTarget = hit
        return
      }
      dragging = true
      seekAt(e.clientX)
    })

    window.addEventListener('mousemove', (e) => {
      // Dragging a loop handle
      if (this._dragTarget) {
        const rect  = this.canvas.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        if (this._dragTarget === 'start') {
          this._loopStart = Math.min(ratio, this._loopEnd - 0.01)
        } else {
          this._loopEnd = Math.max(ratio, this._loopStart + 0.01)
        }
        this.onLoopChange?.(this._loopStart, this._loopEnd)
        this.draw()
        return
      }

      // Seeking drag
      if (dragging) {
        seekAt(e.clientX)
        return
      }

      // Hover highlight + cursor feedback
      const rect = this.canvas.getBoundingClientRect()
      this.hoverX = e.clientX - rect.left
      const hit = hitHandle(e.clientX)
      this.canvas.style.cursor = hit ? 'ew-resize' : 'default'
      this.draw()
    })

    window.addEventListener('mouseup', () => {
      this._dragTarget = null
      dragging = false
    })

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverX = -1
      this.canvas.style.cursor = 'default'
      this.draw()
    })

    // Double-click on a handle resets both markers to the full range
    this.canvas.addEventListener('dblclick', (e) => {
      if (hitHandle(e.clientX)) {
        this._loopStart = 0
        this._loopEnd   = 1
        this.onLoopChange?.(0, 1)
        this.draw()
      }
    })

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      // Use a 20px radius for touch so loop handles are easy to grab with a finger
      const hit = hitHandle(e.touches[0].clientX, 20)
      if (hit) {
        this._dragTarget = hit
        return
      }
      seekAt(e.touches[0].clientX)
    }, { passive: false })

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const touch = e.touches[0]
      if (this._dragTarget) {
        const rect  = this.canvas.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
        if (this._dragTarget === 'start') {
          this._loopStart = Math.min(ratio, this._loopEnd - 0.01)
        } else {
          this._loopEnd = Math.max(ratio, this._loopStart + 0.01)
        }
        this.onLoopChange?.(this._loopStart, this._loopEnd)
        this.draw()
        return
      }
      // Update the playhead position visually on every touchmove for smooth
      // feedback, then throttle the actual audio seek to once per RAF so the
      // source node isn't recreated faster than it can settle.
      updateVisualProgress(touch.clientX)
      seekAtThrottled(touch.clientX)
    }, { passive: false })

    this.canvas.addEventListener('touchend', () => {
      this._dragTarget = null
      if (_touchSeekRaf !== null) {
        cancelAnimationFrame(_touchSeekRaf)
        _touchSeekRaf = null
      }
    })

    // Keyboard
    this.canvas.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this._onSeek?.(Math.max(0, this.progress - 0.02))
      if (e.key === 'ArrowRight') this._onSeek?.(Math.min(1, this.progress + 0.02))
    })
  }
}
