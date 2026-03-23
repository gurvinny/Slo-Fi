// Full-screen 2D star overlay rendered above all UI panels.
// Handles twinkling stars + periodic shooting stars.
// Sits at z-index 200 (pointer-events: none) so it overlays the controls and
// transport bar while never blocking interaction.

interface Star {
  x: number       // CSS px
  y: number
  size: number    // base radius
  phase: number   // twinkle phase offset
  speed: number   // twinkle frequency (rad/s)
}

interface ShootingStar {
  x: number
  y: number
  vx: number      // px/ms
  vy: number
  length: number  // trail length px
  alpha: number   // 0-1
  decay: number   // alpha lost per second
}

export class StarOverlay {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  private stars: Star[]       = []
  private shots: ShootingStar[] = []

  // Time tracking
  private lastTime    = -1
  private shotTimer   = 0     // ms since last shooting star
  private nextShotIn  = 3500  // ms until next

  private treble  = 0
  private rafId: number | null = null
  private playing = true
  private throttleId: ReturnType<typeof setInterval> | null = null

  // Logical size (CSS pixels)
  private w = 0
  private h = 0
  private dpr = 1

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'star-overlay'
    Object.assign(this.canvas.style, {
      position:      'fixed',
      inset:         '0',
      width:         '100%',
      height:        '100%',
      zIndex:        '200',
      pointerEvents: 'none',
    })
    document.body.appendChild(this.canvas)

    this.ctx = this.canvas.getContext('2d')!

    window.addEventListener('resize', () => this.resize())
    this.resize()

    requestAnimationFrame((t) => this.loop(t))
  }

  // Called from App.ts via sphere.onEnergyUpdate
  setTreble(v: number): void { this.treble = v }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    // Drop to ~15 fps for ambient twinkle while audio is paused
    this.throttleId = setInterval(() => this.loop(performance.now()), 67)
  }

  resume(): void {
    if (this.playing) return
    this.playing = true
    if (this.throttleId !== null) {
      clearInterval(this.throttleId)
      this.throttleId = null
    }
    this.lastTime = -1
    requestAnimationFrame((t) => this.loop(t))
  }

  private resize(): void {
    this.w   = window.innerWidth
    this.h   = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio, 2)

    this.canvas.width  = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)

    this.buildStars()
  }

  private buildStars(): void {
    // ~1 star per 3500 sq-px, capped at 220 so lower-end devices stay smooth
    const count = Math.min(Math.round((this.w * this.h) / 3500), 220)
    this.stars  = Array.from({ length: count }, () => ({
      x:     Math.random() * this.w,
      y:     Math.random() * this.h,
      size:  0.25 + Math.random() * 0.75,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 2.4,
    }))
  }

  private spawnShot(): void {
    const angleRad = (28 + Math.random() * 28) * (Math.PI / 180)  // 28-56° below horizontal
    const spd      = (440 + Math.random() * 360) / 1000            // px/ms

    this.shots.push({
      x:      Math.random() * this.w * 0.65,
      y:      Math.random() * this.h * 0.45,
      vx:     Math.cos(angleRad) * spd,
      vy:     Math.sin(angleRad) * spd,
      length: 70 + Math.random() * 130,
      alpha:  1.0,
      decay:  0.70 + Math.random() * 0.50,   // 0.7-1.2 alpha/s → dies in 0.8-1.4 s
    })
  }

  private loop(now: number): void {
    // Only reschedule via rAF while playing. When paused, setInterval drives
    // frames at ~15 fps and loop() must NOT re-arm rAF or multiple loops stack.
    if (this.playing) {
      this.rafId = requestAnimationFrame((t) => this.loop(t))
    } else {
      this.rafId = null
    }

    if (this.lastTime < 0) this.lastTime = now
    const dt = Math.min(now - this.lastTime, 50)
    this.lastTime = now

    const ctx = this.ctx
    const dpr = this.dpr
    const t   = now / 1000   // seconds

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, this.w, this.h)

    // ── Twinkling stars ─────────────────────────────────────────────────────
    for (const s of this.stars) {
      const raw      = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase)
      const sharp    = 2.0 + this.treble * 3.0
      const twinkle  = Math.pow(raw, sharp)
      const alpha    = 0.20 + twinkle * (0.80 + this.treble * 0.20)
      const r        = s.size * (0.8 + twinkle * 0.5)

      // Core + soft halo via radial gradient
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2)
      grad.addColorStop(0,   `rgba(225,235,255,${alpha})`)
      grad.addColorStop(0.3, `rgba(210,222,255,${(alpha * 0.55).toFixed(3)})`)
      grad.addColorStop(1,   'rgba(190,210,255,0)')
      ctx.beginPath()
      ctx.fillStyle = grad
      ctx.arc(s.x, s.y, r * 2, 0, Math.PI * 2)
      ctx.fill()

      // Four-pointed diffraction cross — only at peak brightness
      if (twinkle > 0.78) {
        const blend = (twinkle - 0.78) / 0.22
        const clen  = r * (1.8 + blend * 2.5)
        ctx.strokeStyle = `rgba(225,235,255,${(blend * alpha * 0.65).toFixed(3)})`
        ctx.lineWidth   = 0.6
        ctx.beginPath()
        ctx.moveTo(s.x - clen, s.y); ctx.lineTo(s.x + clen, s.y)
        ctx.moveTo(s.x, s.y - clen); ctx.lineTo(s.x, s.y + clen)
        ctx.stroke()
      }
    }

    // ── Shooting star timer (only while audio is playing) ───────────────────
    if (this.playing) {
      this.shotTimer += dt
      if (this.shotTimer >= this.nextShotIn) {
        this.spawnShot()
        this.shotTimer  = 0
        this.nextShotIn = 3000 + Math.random() * 7000   // 3-10 s interval
      }
    }

    // ── Shooting stars ──────────────────────────────────────────────────────
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const ss = this.shots[i]
      ss.x    += ss.vx * dt
      ss.y    += ss.vy * dt
      ss.alpha -= ss.decay * (dt / 1000)

      if (ss.alpha <= 0 || ss.x > this.w + 300 || ss.y > this.h + 300) {
        this.shots.splice(i, 1)
        continue
      }

      // Trail: linear gradient from bright head → transparent tail
      const mag  = Math.hypot(ss.vx, ss.vy)
      const tx   = ss.x - (ss.vx / mag) * ss.length
      const ty   = ss.y - (ss.vy / mag) * ss.length

      const trail = ctx.createLinearGradient(ss.x, ss.y, tx, ty)
      trail.addColorStop(0,    `rgba(255,255,255,${ss.alpha.toFixed(3)})`)
      trail.addColorStop(0.12, `rgba(215,228,255,${(ss.alpha * 0.75).toFixed(3)})`)
      trail.addColorStop(0.5,  `rgba(180,205,255,${(ss.alpha * 0.30).toFixed(3)})`)
      trail.addColorStop(1,    'rgba(160,195,255,0)')

      ctx.beginPath()
      ctx.strokeStyle = trail
      ctx.lineWidth   = 1.8
      ctx.moveTo(ss.x, ss.y)
      ctx.lineTo(tx, ty)
      ctx.stroke()

      // Bright glowing head
      const hgr = ctx.createRadialGradient(ss.x, ss.y, 0, ss.x, ss.y, 5)
      hgr.addColorStop(0, `rgba(255,255,255,${ss.alpha.toFixed(3)})`)
      hgr.addColorStop(1, 'rgba(200,220,255,0)')
      ctx.beginPath()
      ctx.fillStyle = hgr
      ctx.arc(ss.x, ss.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.canvas.remove()
  }
}
