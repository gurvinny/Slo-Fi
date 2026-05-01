import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioParams } from '../types'

// Owns the effects chain control section (EQ, chorus, saturation sliders).
export class EffectsController {
  private engine: AudioEngine

  // EQ sliders — 5 bands
  private eqLowSlider     = document.getElementById('eqLowSlider')     as HTMLInputElement
  private eqLowMidSlider  = document.getElementById('eqLowMidSlider')  as HTMLInputElement
  private eqMidSlider     = document.getElementById('eqMidSlider')     as HTMLInputElement
  private eqHighMidSlider = document.getElementById('eqHighMidSlider') as HTMLInputElement
  private eqHighSlider    = document.getElementById('eqHighSlider')     as HTMLInputElement

  private eqLowValue     = document.getElementById('eqLowValue')!
  private eqLowMidValue  = document.getElementById('eqLowMidValue')!
  private eqMidValue     = document.getElementById('eqMidValue')!
  private eqHighMidValue = document.getElementById('eqHighMidValue')!
  private eqHighValue    = document.getElementById('eqHighValue')!

  // EQ frequency response curve canvas
  private eqCurveCanvas = document.getElementById('eqCurveCanvas') as HTMLCanvasElement

  private chorusRateSlider  = document.getElementById('chorusRateSlider')  as HTMLInputElement
  private chorusDepthSlider = document.getElementById('chorusDepthSlider') as HTMLInputElement
  private chorusRateValue   = document.getElementById('chorusRateValue')!
  private chorusDepthValue  = document.getElementById('chorusDepthValue')!

  private satDriveSlider = document.getElementById('satDriveSlider') as HTMLInputElement
  private satDriveValue  = document.getElementById('satDriveValue')!

  private eightDToggle      = document.getElementById('eightDToggle')      as HTMLInputElement
  private eightDSpeedSlider = document.getElementById('eightDSpeedSlider') as HTMLInputElement
  private eightDSpeedValue  = document.getElementById('eightDSpeedValue')!
  private eightDSpeedRow    = document.getElementById('eightDSpeedRow')!
  private eightDSpeedTicks  = document.getElementById('eightDSpeedTicks')!
  private eightDHint        = document.getElementById('eightDHint')!

  private hzButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-hz'))
  private hzValue   = document.getElementById('hzValue')!
  private hzHint    = document.getElementById('hzHint')!

  private readonly HZ_LABELS: Record<string, string> = {
    off:   'No frequency boost applied',
    '432': '432 Hz — Natural tuning, relaxation & harmony',
    '528': '528 Hz — Love frequency, transformation',
    '639': '639 Hz — Relationship healing, emotional balance',
    '741': '741 Hz — Expression, intuition & mental clarity',
    '852': '852 Hz — Spiritual awareness & inner strength',
    '963': '963 Hz — Divine connection & enlightenment',
  }

  // Log-spaced frequency array for getFrequencyResponse() — allocated once
  private readonly _freqArr: Float32Array<ArrayBuffer>
  private readonly _magArr:  Float32Array<ArrayBuffer>
  private readonly _phArr:   Float32Array<ArrayBuffer>
  private _curveRafId: number | null = null

  public on8DChange: ((enabled: boolean, speed: number) => void) | null = null
  public onChanged:  (() => void) | null = null

  constructor(engine: AudioEngine) {
    this.engine = engine

    const N = 512
    this._freqArr = new Float32Array(N) as Float32Array<ArrayBuffer>
    this._magArr  = new Float32Array(N) as Float32Array<ArrayBuffer>
    this._phArr   = new Float32Array(N) as Float32Array<ArrayBuffer>
    // Log-spaced from 20 Hz to 20 kHz
    for (let i = 0; i < N; i++) {
      this._freqArr[i] = 20 * Math.pow(1000, i / (N - 1))
    }

    this.wire()
    this._scheduleCurveDraw()
  }

  private wire(): void {
    const eqSliders: [HTMLInputElement, HTMLElement, 'low' | 'lowMid' | 'mid' | 'highMid' | 'high'][] = [
      [this.eqLowSlider,     this.eqLowValue,     'low'],
      [this.eqLowMidSlider,  this.eqLowMidValue,  'lowMid'],
      [this.eqMidSlider,     this.eqMidValue,      'mid'],
      [this.eqHighMidSlider, this.eqHighMidValue,  'highMid'],
      [this.eqHighSlider,    this.eqHighValue,     'high'],
    ]

    for (const [slider, badge, band] of eqSliders) {
      slider.addEventListener('input', () => {
        const db = parseFloat(slider.value)
        this.engine.setEQ(band, db)
        badge.textContent = `${db > 0 ? '+' : ''}${db} dB`
        this._scheduleCurveDraw()
        this.onChanged?.()
      })
    }

    this.chorusRateSlider.addEventListener('input', () => {
      const rate = parseFloat(this.chorusRateSlider.value)
      this.engine.setChorusRate(rate)
      this.chorusRateValue.textContent = `${rate.toFixed(1)} Hz`
      this.onChanged?.()
    })

    this.chorusDepthSlider.addEventListener('input', () => {
      const depth = parseFloat(this.chorusDepthSlider.value) / 100
      this.engine.setChorusDepth(depth)
      this.chorusDepthValue.textContent = `${this.chorusDepthSlider.value}%`
      this.onChanged?.()
    })

    this.satDriveSlider.addEventListener('input', () => {
      const drive = parseFloat(this.satDriveSlider.value) / 100
      this.engine.setSaturationDrive(drive)
      this.satDriveValue.textContent = `${this.satDriveSlider.value}%`
      this.onChanged?.()
    })

    this.eightDToggle.addEventListener('change', () => {
      const enabled = this.eightDToggle.checked
      const speed   = this._get8DSpeed()
      this.engine.set8DEnabled(enabled)
      this._show8DSpeedControls(enabled)
      this.on8DChange?.(enabled, speed)
      this.onChanged?.()
    })

    this.eightDSpeedSlider.addEventListener('input', () => {
      const speed = this._get8DSpeed()
      this.engine.set8DSpeed(speed)
      this.eightDSpeedValue.textContent = `${speed.toFixed(1)} Hz`
      this.on8DChange?.(this.eightDToggle.checked, speed)
    })

    this.hzButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.hz
        const hz = raw === 'off' ? null : parseInt(raw!, 10)
        this.engine.setHzFrequency(hz)
        this._updateHzButtons(hz)
        this.onChanged?.()
      })
    })
  }

  // Schedules a curve redraw on the next animation frame (debounced).
  private _scheduleCurveDraw(): void {
    if (this._curveRafId !== null) return
    this._curveRafId = requestAnimationFrame(() => {
      this._curveRafId = null
      this._drawEQCurve()
    })
  }

  // Renders the composite frequency response of all 5 EQ bands onto the canvas.
  // Uses BiquadFilterNode.getFrequencyResponse() for accuracy — the same
  // computation the Web Audio engine uses internally.
  private _drawEQCurve(): void {
    const canvas = this.eqCurveCanvas
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const filters = this.engine.effectsChain?.getEQNodes()
    if (!filters || filters.length < 5) {
      // Audio context not yet initialized — draw flat line
      this._drawFlatCurve(ctx, canvas.width, canvas.height)
      return
    }

    const N = this._freqArr.length
    const W = canvas.width  || canvas.offsetWidth  || 300
    const H = canvas.height || canvas.offsetHeight || 80

    // Resize backing store to match display size
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W
      canvas.height = H
    }

    // Compute composite magnitude response (product of all 5 filters)
    const composite = new Float32Array(N).fill(1)
    for (const filter of filters) {
      filter.getFrequencyResponse(this._freqArr, this._magArr, this._phArr)
      for (let i = 0; i < N; i++) composite[i] *= this._magArr[i]
    }

    // Convert to dB
    const dbArr = new Float32Array(N)
    for (let i = 0; i < N; i++) dbArr[i] = 20 * Math.log10(Math.max(composite[i], 1e-6))

    // Map: ±15 dB range → canvas Y (dB=0 → midpoint)
    const DB_RANGE = 15
    const toY = (db: number) => H * 0.5 - (db / DB_RANGE) * H * 0.45

    // Draw background
    ctx.clearRect(0, 0, W, H)

    // 0 dB reference line
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.moveTo(0, H * 0.5)
    ctx.lineTo(W, H * 0.5)
    ctx.stroke()

    // Fill under the curve
    const accentRgb = this._getAccentRGB()
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W
      const y = toY(dbArr[i])
      if (i === 0) ctx.lineTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.fillStyle = `rgba(${accentRgb},0.10)`
    ctx.fill()

    // Curve line
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * W
      const y = toY(dbArr[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(${accentRgb},0.85)`
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  private _drawFlatCurve(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.clearRect(0, 0, W, H)
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.moveTo(0, H * 0.5)
    ctx.lineTo(W, H * 0.5)
    ctx.stroke()
  }

  // Reads the current --accent CSS variable to use the active theme colour.
  private _getAccentRGB(): string {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    // Parse hex (#rrggbb or #rgb) or fall back to theme-neutral cyan
    if (accent.startsWith('#')) {
      const hex = accent.slice(1)
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16)
        const g = parseInt(hex.slice(2, 4), 16)
        const b = parseInt(hex.slice(4, 6), 16)
        return `${r},${g},${b}`
      }
    }
    return '180,255,0'  // Meridian accent fallback
  }

  private _updateHzButtons(hz: number | null): void {
    const target = hz === null ? 'off' : String(hz)
    this.hzButtons.forEach(btn => {
      const active = btn.dataset.hz === target
      btn.classList.toggle('btn-hz--active', active)
      btn.setAttribute('aria-pressed', String(active))
    })
    this.hzValue.textContent = hz === null ? 'Off' : `${hz} Hz`
    this.hzHint.textContent = this.HZ_LABELS[target] ?? ''
  }

  private _get8DSpeed(): number {
    return parseFloat(this.eightDSpeedSlider.value) / 10
  }

  private _show8DSpeedControls(show: boolean): void {
    const display = show ? '' : 'none'
    this.eightDSpeedRow.style.display    = display
    this.eightDSpeedSlider.style.display = display
    this.eightDSpeedTicks.style.display  = display
    this.eightDHint.style.display        = show ? 'none' : ''
  }

  private _fmtDb(db: number): string {
    return `${db > 0 ? '+' : ''}${db} dB`
  }

  // Syncs all slider positions and badges to a given params object.
  syncToParams(params: AudioParams): void {
    const bands: [HTMLInputElement, HTMLElement, keyof typeof params.eq][] = [
      [this.eqLowSlider,     this.eqLowValue,     'low'],
      [this.eqLowMidSlider,  this.eqLowMidValue,  'lowMid'],
      [this.eqMidSlider,     this.eqMidValue,      'mid'],
      [this.eqHighMidSlider, this.eqHighMidValue,  'highMid'],
      [this.eqHighSlider,    this.eqHighValue,     'high'],
    ]
    for (const [slider, badge, key] of bands) {
      const db = params.eq[key]
      slider.value    = String(db)
      badge.textContent = this._fmtDb(db)
    }

    this.chorusRateSlider.value     = String(params.chorus.rate)
    this.chorusRateValue.textContent = `${params.chorus.rate.toFixed(1)} Hz`

    const depthPct = Math.round(params.chorus.depth * 100)
    this.chorusDepthSlider.value     = String(depthPct)
    this.chorusDepthValue.textContent = `${depthPct}%`

    const satPct = Math.round(params.saturationDrive * 100)
    this.satDriveSlider.value     = String(satPct)
    this.satDriveValue.textContent = `${satPct}%`

    this._updateHzButtons(params.hzFrequency)
    this._scheduleCurveDraw()
  }
}
