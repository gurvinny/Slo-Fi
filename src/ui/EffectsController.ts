import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioParams, EQNodeState } from '../types'

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

  private abyssDepthSlider     = document.getElementById('abyssDepthSlider')     as HTMLInputElement
  private abyssResonanceSlider = document.getElementById('abyssResonanceSlider') as HTMLInputElement
  private abyssDepthValue      = document.getElementById('abyssDepthValue')!
  private abyssResonanceValue  = document.getElementById('abyssResonanceValue')!

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

  // ── EQ interactive node configuration ───────────────────────────────────
  private readonly EQ_BANDS = [
    { band: 'low'     as const, label: 'Low',      defaultFreq: 80,    freqMin: 40,   freqMax: 300,   isShelf: true,  defaultQ: 1.0 },
    { band: 'lowMid'  as const, label: 'Low-Mid',  defaultFreq: 250,   freqMin: 100,  freqMax: 800,   isShelf: false, defaultQ: 1.0 },
    { band: 'mid'     as const, label: 'Mid',       defaultFreq: 1000,  freqMin: 400,  freqMax: 4000,  isShelf: false, defaultQ: 1.5 },
    { band: 'highMid' as const, label: 'High-Mid', defaultFreq: 4000,  freqMin: 1000, freqMax: 10000, isShelf: false, defaultQ: 1.0 },
    { band: 'high'    as const, label: 'High',      defaultFreq: 12000, freqMin: 5000, freqMax: 20000, isShelf: true,  defaultQ: 1.0 },
  ]

  // Per-band live state — initialized to defaults, mutated during interaction
  private _eqNodeState: EQNodeState[] = this.EQ_BANDS.map(b => ({
    band: b.band, freq: b.defaultFreq, db: 0, q: b.defaultQ, slope: b.defaultQ,
  }))

  // Drag state
  private _dragBandIdx:  number | null = null
  private _dragStartY    = 0
  private _dragStartDb   = 0
  private _dragStartX    = 0
  private _dragStartFreq = 0

  // Programmatically created DOM elements
  private _eqTooltip:     HTMLDivElement    | null = null
  private _eqToggleBtn:   HTMLButtonElement | null = null
  private _eqSliderGroups: HTMLElement[] = []
  private _slidersVisible = false

  // Pinch state
  private _pinchBandIdx:    number | null = null
  private _pinchInitialDist = 0
  private _pinchInitialQ    = 1

  private readonly NODE_R   = 10   // node radius in CSS pixels
  private readonly DB_RANGE = 15   // visual dB range (±15 dB axis, ±12 dB clamped)
  private readonly DB_MAX   = 12

  public on8DChange: ((enabled: boolean, speed: number) => void) | null = null
  public onChanged:  (() => void) | null = null

  // ── Spectrum ghost animation ──────────────────────────────────────────────
  private _spectrumRafId: number | null = null
  private _spectrumOpacity = 0
  private _isPlayingAudio  = false
  private readonly _SPECTRUM_ALPHA = 0.88  // exponential smoothing factor (calm/fluid)
  private _preSmoothed:  Float32Array | null = null
  private _postSmoothed: Float32Array | null = null
  private _spectrumBins  = 0

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
    // Build interactive EQ DOM first (wraps canvas, creates tooltip + toggle)
    this._buildEQInteractiveDOM()

    const eqSliders: [HTMLInputElement, HTMLElement, 'low' | 'lowMid' | 'mid' | 'highMid' | 'high'][] = [
      [this.eqLowSlider,     this.eqLowValue,     'low'],
      [this.eqLowMidSlider,  this.eqLowMidValue,  'lowMid'],
      [this.eqMidSlider,     this.eqMidValue,      'mid'],
      [this.eqHighMidSlider, this.eqHighMidValue,  'highMid'],
      [this.eqHighSlider,    this.eqHighValue,     'high'],
    ]

    for (let i = 0; i < eqSliders.length; i++) {
      const [slider, badge, band] = eqSliders[i]
      const nodeIdx = i
      slider.addEventListener('input', () => {
        const db = parseFloat(slider.value)
        this.engine.setEQ(band, db)
        badge.textContent = `${db > 0 ? '+' : ''}${db} dB`
        this._eqNodeState[nodeIdx].db = db
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

    this.abyssDepthSlider.addEventListener('input', () => {
      const pct = parseFloat(this.abyssDepthSlider.value)
      this.engine.setAbyssDepth(pct / 100)
      this.abyssDepthValue.textContent = `${pct}%`
      this.onChanged?.()
    })

    this.abyssResonanceSlider.addEventListener('input', () => {
      const pct = parseFloat(this.abyssResonanceSlider.value)
      this.engine.setAbyssResonance(pct / 100)
      this.abyssResonanceValue.textContent = `${pct}%`
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

  // ── EQ interactive DOM setup ──────────────────────────────────────────────

  private _buildEQInteractiveDOM(): void {
    const canvas = this.eqCurveCanvas
    const parent = canvas.parentElement!

    // Wrap canvas in a positioned container for tooltip + toggle button
    const wrap = document.createElement('div')
    wrap.className = 'eq-canvas-wrap'
    parent.insertBefore(wrap, canvas)
    wrap.appendChild(canvas)
    // Collect the 5 slider .control-group siblings that follow the wrapper
    let sibling = wrap.nextElementSibling
    let count = 0
    while (sibling && count < 5) {
      if (sibling.classList.contains('control-group')) {
        this._eqSliderGroups.push(sibling as HTMLElement)
        count++
      }
      sibling = sibling.nextElementSibling
    }

    // Sliders hidden by default — toggle button reveals them
    for (const group of this._eqSliderGroups) {
      group.classList.add('eq-sliders-hidden')
    }

    // Floating tooltip
    const tooltip = document.createElement('div')
    tooltip.className = 'eq-tooltip'
    tooltip.setAttribute('aria-hidden', 'true')
    wrap.appendChild(tooltip)
    this._eqTooltip = tooltip

    // Slider toggle button (mixer-lines icon)
    const btn = document.createElement('button')
    btn.className = 'eq-sliders-btn'
    btn.setAttribute('aria-label', 'Show EQ sliders')
    btn.setAttribute('aria-pressed', 'true')
    btn.setAttribute('title', 'Toggle EQ sliders')
    btn.innerHTML = `<svg width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
      <line x1="0" y1="2" x2="12" y2="2" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="4" cy="2" r="1.5" fill="currentColor"/>
      <line x1="0" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.2"/>
      <circle cx="8" cy="7" r="1.5" fill="currentColor"/>
    </svg>`
    wrap.appendChild(btn)
    this._eqToggleBtn = btn
    btn.addEventListener('click', () => this._toggleSliders())

    this._wireCanvasEvents()

    // ResizeObserver handles the drawer-open case where canvas starts at 0px
    const ro = new ResizeObserver(() => {
      this._resizeCanvas()
      this._scheduleCurveDraw()
    })
    ro.observe(canvas)
  }

  private _wireCanvasEvents(): void {
    const canvas = this.eqCurveCanvas

    canvas.addEventListener('pointerdown',   (e) => this._onPointerDown(e))
    canvas.addEventListener('pointermove',   (e) => this._onPointerMove(e))
    canvas.addEventListener('pointerup',     (e) => this._onPointerUp(e))
    canvas.addEventListener('pointercancel', ()  => this._endDrag())

    // passive:false so we can call preventDefault() inside the handler
    canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false })

    canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true })
    canvas.addEventListener('touchmove',  (e) => this._onTouchMove(e),  { passive: false })
    canvas.addEventListener('touchend',   ()  => this._onTouchEnd())
  }

  // ── Coordinate conversions (log-scale freq axis, linear gain axis) ────────

  // Canvas x [0..W] → frequency Hz  (log-scale 20 Hz – 20 kHz)
  private _xToFreq(x: number, W: number): number {
    return 20 * Math.pow(1000, x / W)
  }

  // Frequency Hz → canvas x [0..W]
  private _freqToX(hz: number, W: number): number {
    return (Math.log10(hz / 20) / Math.log10(1000)) * W
  }

  // Gain dB → canvas y [0..H]  (0 dB = H/2, +DB_RANGE = top)
  private _dbToY(db: number, H: number): number {
    return H * 0.5 - (db / this.DB_RANGE) * H * 0.45
  }

  // ── Node hit detection ────────────────────────────────────────────────────

  private _hitNode(cssPx: { x: number; y: number }, rect: DOMRect): number | null {
    const W = rect.width
    const H = rect.height
    for (let i = 0; i < this._eqNodeState.length; i++) {
      const s  = this._eqNodeState[i]
      const nx = this._freqToX(s.freq, W)
      const ny = this._dbToY(s.db, H)
      const dx = cssPx.x - nx
      const dy = cssPx.y - ny
      if (Math.sqrt(dx * dx + dy * dy) <= this.NODE_R + 4) return i   // +4px grace for touch
    }
    return null
  }

  // ── Pointer event handlers (single-finger drag: gain + freq) ─────────────

  private _onPointerDown(e: PointerEvent): void {
    const rect  = this.eqCurveCanvas.getBoundingClientRect()
    const cssPx = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const idx   = this._hitNode(cssPx, rect)
    if (idx === null) return

    e.preventDefault()
    this.eqCurveCanvas.setPointerCapture(e.pointerId)

    this._dragBandIdx   = idx
    this._dragStartY    = e.clientY
    this._dragStartDb   = this._eqNodeState[idx].db
    this._dragStartX    = e.clientX
    this._dragStartFreq = this._eqNodeState[idx].freq

    this.eqCurveCanvas.classList.add('eq-dragging')
    this._showTooltip(idx, rect)
  }

  private _onPointerMove(e: PointerEvent): void {
    const rect = this.eqCurveCanvas.getBoundingClientRect()

    if (this._dragBandIdx === null) {
      // Hover — update cursor and show tooltip when over a node
      const cssPx = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const idx   = this._hitNode(cssPx, rect)
      this.eqCurveCanvas.style.cursor = idx !== null ? 'grab' : 'crosshair'
      if (idx !== null) this._showTooltip(idx, rect)
      else              this._hideTooltip()
      return
    }

    e.preventDefault()
    const idx  = this._dragBandIdx
    const meta = this.EQ_BANDS[idx]
    const W    = rect.width
    const H    = rect.height

    // Vertical drag → gain
    const pxPerDb = (H * 0.45) / this.DB_RANGE
    const newDb   = Math.max(-this.DB_MAX, Math.min(this.DB_MAX,
      this._dragStartDb - (e.clientY - this._dragStartY) / pxPerDb))
    this._eqNodeState[idx].db = newDb

    // Horizontal drag → frequency (grab-and-drag in log space)
    const startX = this._freqToX(this._dragStartFreq, W)
    const rawX   = Math.max(0, Math.min(W, startX + (e.clientX - this._dragStartX)))
    const newHz  = Math.max(meta.freqMin, Math.min(meta.freqMax, this._xToFreq(rawX, W)))
    this._eqNodeState[idx].freq = newHz

    this.engine.setEQ(meta.band, newDb)
    this.engine.setEQFreq(meta.band, newHz)
    this._syncNodeToSlider(idx)
    this._scheduleCurveDraw()
    this._showTooltip(idx, rect)
    this.onChanged?.()
  }

  private _onPointerUp(e: PointerEvent): void {
    this.eqCurveCanvas.releasePointerCapture(e.pointerId)
    this._endDrag()
  }

  private _endDrag(): void {
    this._dragBandIdx = null
    this.eqCurveCanvas.classList.remove('eq-dragging')
    this.eqCurveCanvas.style.cursor = 'crosshair'
    this._hideTooltip()
  }

  // ── Scroll wheel: Q / slope adjustment on desktop ─────────────────────────

  private _onWheel(e: WheelEvent): void {
    const rect  = this.eqCurveCanvas.getBoundingClientRect()
    const cssPx = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const idx   = this._dragBandIdx ?? this._hitNode(cssPx, rect)
    if (idx === null) return

    e.preventDefault()
    const delta = e.deltaY < 0 ? 1 : -1
    const state = this._eqNodeState[idx]
    const meta  = this.EQ_BANDS[idx]

    if (meta.isShelf) {
      state.slope = Math.max(0.5, Math.min(2.0, state.slope + delta * 0.1))
      this.engine.setEQSlope(meta.band as 'low' | 'high', state.slope)
    } else {
      // Multiplicative Q steps feel natural (each tick = ×1.15 or ÷1.15)
      state.q = Math.max(0.1, Math.min(10, state.q * Math.pow(1.15, delta)))
      this.engine.setEQQ(meta.band, state.q)
    }

    this._scheduleCurveDraw()
    this._showTooltip(idx, rect)
  }

  // ── Touch pinch: Q / slope adjustment on mobile ────────────────────────────

  private _onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 2) return
    const rect = this.eqCurveCanvas.getBoundingClientRect()
    const t0 = e.touches[0]
    const t1 = e.touches[1]
    const inCanvas = (t: Touch) =>
      t.clientX >= rect.left && t.clientX <= rect.right &&
      t.clientY >= rect.top  && t.clientY <= rect.bottom
    if (!inCanvas(t0) || !inCanvas(t1)) return

    const midX = (t0.clientX + t1.clientX) / 2 - rect.left
    const midY = (t0.clientY + t1.clientY) / 2 - rect.top
    const idx  = this._hitNode({ x: midX, y: midY }, rect)
    if (idx === null) return

    this._pinchBandIdx     = idx
    this._pinchInitialDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
    const state = this._eqNodeState[idx]
    this._pinchInitialQ = this.EQ_BANDS[idx].isShelf ? state.slope : state.q
  }

  private _onTouchMove(e: TouchEvent): void {
    if (this._pinchBandIdx === null || e.touches.length !== 2) return
    e.preventDefault()

    const t0    = e.touches[0]
    const t1    = e.touches[1]
    const dist  = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
    const scale = dist / this._pinchInitialDist
    const idx   = this._pinchBandIdx
    const meta  = this.EQ_BANDS[idx]
    const state = this._eqNodeState[idx]
    const rect  = this.eqCurveCanvas.getBoundingClientRect()

    if (meta.isShelf) {
      state.slope = Math.max(0.5, Math.min(2.0, this._pinchInitialQ * scale))
      this.engine.setEQSlope(meta.band as 'low' | 'high', state.slope)
    } else {
      state.q = Math.max(0.1, Math.min(10, this._pinchInitialQ * scale))
      this.engine.setEQQ(meta.band, state.q)
    }

    this._scheduleCurveDraw()
    this._showTooltip(idx, rect)
  }

  private _onTouchEnd(): void {
    this._pinchBandIdx = null
    this._hideTooltip()
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────

  private _showTooltip(idx: number, rect: DOMRect): void {
    const tooltip = this._eqTooltip
    if (!tooltip) return

    const state = this._eqNodeState[idx]
    const meta  = this.EQ_BANDS[idx]

    const fmtFreq = (hz: number) => hz >= 1000 ? `${(hz / 1000).toFixed(1)}kHz` : `${Math.round(hz)}Hz`
    const fmtDb   = (db: number) => `${db >= 0 ? '+' : ''}${db.toFixed(1)}dB`

    if (meta.isShelf) {
      tooltip.textContent = `${fmtFreq(state.freq)} | ${fmtDb(state.db)} | Slope: ${state.slope.toFixed(1)}`
    } else {
      tooltip.textContent = `${fmtFreq(state.freq)} | ${fmtDb(state.db)} | Q: ${state.q.toFixed(1)}`
    }

    tooltip.classList.add('eq-tooltip--visible')

    // Position tooltip above node, clamped within wrapper bounds
    const W  = rect.width
    const H  = rect.height
    const nx = this._freqToX(state.freq, W)
    const ny = this._dbToY(state.db, H)
    const tw = tooltip.offsetWidth  || 120
    const th = tooltip.offsetHeight || 22

    let tx = nx - tw / 2
    let ty = ny - th - 10

    tx = Math.max(4, Math.min(W - tw - 4, tx))
    if (ty < 4) ty = ny + 16   // flip below if not enough space above

    tooltip.style.left = `${tx}px`
    tooltip.style.top  = `${ty}px`
  }

  private _hideTooltip(): void {
    this._eqTooltip?.classList.remove('eq-tooltip--visible')
  }

  // ── Slider toggle ─────────────────────────────────────────────────────────

  private _toggleSliders(): void {
    this._slidersVisible = !this._slidersVisible
    const btn = this._eqToggleBtn!
    btn.setAttribute('aria-pressed', String(!this._slidersVisible))
    btn.setAttribute('aria-label', this._slidersVisible ? 'Hide EQ sliders' : 'Show EQ sliders')
    for (const group of this._eqSliderGroups) {
      group.classList.toggle('eq-sliders-hidden', !this._slidersVisible)
    }
  }

  // ── Bidirectional sync: node → slider ────────────────────────────────────

  private _syncNodeToSlider(idx: number): void {
    const state   = this._eqNodeState[idx]
    const sliders = [this.eqLowSlider, this.eqLowMidSlider, this.eqMidSlider, this.eqHighMidSlider, this.eqHighSlider]
    const badges  = [this.eqLowValue,  this.eqLowMidValue,  this.eqMidValue,  this.eqHighMidValue,  this.eqHighValue]
    const db = parseFloat(state.db.toFixed(1))
    sliders[idx].value      = String(db)
    badges[idx].textContent = this._fmtDb(db)
  }

  // ── Canvas DPR-aware resize ───────────────────────────────────────────────

  private _resizeCanvas(): void {
    const canvas = this.eqCurveCanvas
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = window.devicePixelRatio || 1
    canvas.width  = Math.round(rect.width  * dpr)
    canvas.height = Math.round(rect.height * dpr)
  }

  // ── Curve drawing ─────────────────────────────────────────────────────────

  // Schedules a curve redraw on the next animation frame (debounced).
  private _scheduleCurveDraw(): void {
    if (this._curveRafId !== null) return
    this._curveRafId = requestAnimationFrame(() => {
      this._curveRafId = null
      this._drawEQCurve()
    })
  }

  // Renders the composite EQ frequency response curve + interactive nodes.
  // Uses BiquadFilterNode.getFrequencyResponse() for accuracy — same computation
  // the Web Audio engine uses internally.
  private _drawEQCurve(): void {
    const canvas = this.eqCurveCanvas
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    if (!W || !H) return

    // Scale context to device pixels so all draw calls use CSS px coordinates
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const filters = this.engine.effectsChain?.getEQNodes()
    if (!filters || filters.length < 5) {
      this._drawFlatCurve(ctx, W, H)
      return
    }

    const N = this._freqArr.length

    // Compute composite magnitude response (product of all 5 filters)
    const composite = new Float32Array(N).fill(1)
    for (const filter of filters) {
      filter.getFrequencyResponse(this._freqArr, this._magArr, this._phArr)
      for (let i = 0; i < N; i++) composite[i] *= this._magArr[i]
    }

    // Convert to dB
    const dbArr = new Float32Array(N)
    for (let i = 0; i < N; i++) dbArr[i] = 20 * Math.log10(Math.max(composite[i], 1e-6))

    // Map: ±DB_RANGE dB range → canvas Y (0 dB = midpoint)
    const toY = (db: number) => H * 0.5 - (db / this.DB_RANGE) * H * 0.45

    ctx.clearRect(0, 0, W, H)

    this._drawGrid(ctx, W, H)
    if (this._spectrumOpacity > 0.01) this._drawSpectrumGhosts(ctx, W, H)

    const accentRgb = this._getAccentRGB()

    // Fill under the curve
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let i = 0; i < N; i++) {
      ctx.lineTo((i / (N - 1)) * W, toY(dbArr[i]))
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
      else         ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(${accentRgb},0.85)`
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    this._drawEQNodes(ctx, W, H, accentRgb)
  }

  private _drawEQNodes(ctx: CanvasRenderingContext2D, W: number, H: number, accentRgb: string): void {
    for (let i = 0; i < this._eqNodeState.length; i++) {
      const s        = this._eqNodeState[i]
      const x        = this._freqToX(s.freq, W)
      const y        = this._dbToY(s.db, H)
      const isActive = this._dragBandIdx === i

      // Glow ring when actively dragging
      if (isActive) {
        ctx.beginPath()
        ctx.arc(x, y, this.NODE_R + 5, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${accentRgb},0.30)`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Main circle
      ctx.beginPath()
      ctx.arc(x, y, this.NODE_R, 0, Math.PI * 2)
      ctx.fillStyle   = `rgba(${accentRgb},${isActive ? 0.95 : 0.75})`
      ctx.strokeStyle = `rgba(${accentRgb},1)`
      ctx.lineWidth   = 1.5
      ctx.fill()
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fill()
    }
  }

  private _drawFlatCurve(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.clearRect(0, 0, W, H)
    this._drawGrid(ctx, W, H)
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.moveTo(0, H * 0.5)
    ctx.lineTo(W, H * 0.5)
    ctx.stroke()
  }

  // ── Grid (Ableton/Pro-Q style) ────────────────────────────────────────────

  private _drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const toY = (db: number) => H * 0.5 - (db / this.DB_RANGE) * H * 0.45

    // Horizontal dB lines
    const dbLevels = [
      { db: 12,  label: '+12', alpha: 0.10, dash: [3, 4] },
      { db: 6,   label: '+6',  alpha: 0.14, dash: [3, 4] },
      { db: 0,   label: '0',   alpha: 0.28, dash: []     },
      { db: -6,  label: '-6',  alpha: 0.14, dash: [3, 4] },
      { db: -12, label: '-12', alpha: 0.10, dash: [3, 4] },
    ]

    ctx.save()
    ctx.font = '9px system-ui, sans-serif'
    ctx.textBaseline = 'middle'

    for (const level of dbLevels) {
      const y = toY(level.db)
      ctx.beginPath()
      ctx.setLineDash(level.dash)
      ctx.strokeStyle = `rgba(255,255,255,${level.alpha})`
      ctx.lineWidth = level.db === 0 ? 1.5 : 1
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
      ctx.setLineDash([])

      // Labels on both sides
      ctx.fillStyle = `rgba(255,255,255,${level.alpha + 0.10})`
      ctx.textAlign = 'left'
      ctx.fillText(level.label, 4, y)
      ctx.textAlign = 'right'
      ctx.fillText(level.label, W - 4, y)
    }

    // Vertical frequency lines + labels
    const freqMarkers = [
      { hz: 20,    label: '20'   },
      { hz: 50,    label: '50'   },
      { hz: 100,   label: '100'  },
      { hz: 200,   label: '200'  },
      { hz: 500,   label: '500'  },
      { hz: 1000,  label: '1k'   },
      { hz: 2000,  label: '2k'   },
      { hz: 5000,  label: '5k'   },
      { hz: 10000, label: '10k'  },
      { hz: 20000, label: '20k'  },
    ]

    ctx.font = '8px system-ui, sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'center'

    for (const m of freqMarkers) {
      const x = this._freqToX(m.hz, W)
      ctx.beginPath()
      ctx.setLineDash([2, 4])
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H - 12)
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = 'rgba(255,255,255,0.30)'
      ctx.fillText(m.label, x, H)
    }

    ctx.restore()
  }

  // ── Spectrum ghosts (pre-EQ + post-EQ filled curves) ─────────────────────

  private _drawSpectrumGhosts(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this._preSmoothed || !this._postSmoothed) return
    const op = this._spectrumOpacity
    const bins = this._spectrumBins
    if (!bins) return

    // dBFS → canvas Y: -10 dBFS (loud) = top, -90 dBFS (silence) = bottom
    const specToY = (dBFS: number) => H - ((dBFS + 90) / 80) * H

    const nyquist = (this.engine.analyserPreEQ?.context.sampleRate ?? 44100) / 2

    const drawGhost = (data: Float32Array, rgb: string, fillAlpha: number, strokeAlpha: number, lineW: number) => {
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let xi = 0; xi <= W; xi += 2) {
        const hz  = this._xToFreq(xi, W)
        const bin = Math.min(Math.floor((hz / nyquist) * bins), bins - 1)
        const y   = specToY(data[bin])
        ctx.lineTo(xi, y)
      }
      ctx.lineTo(W, H)
      ctx.closePath()
      ctx.fillStyle = `rgba(${rgb},${fillAlpha * op})`
      ctx.fill()

      // Stroke the top edge
      ctx.beginPath()
      ctx.moveTo(0, specToY(data[0]))
      for (let xi = 2; xi <= W; xi += 2) {
        const hz  = this._xToFreq(xi, W)
        const bin = Math.min(Math.floor((hz / nyquist) * bins), bins - 1)
        ctx.lineTo(xi, specToY(data[bin]))
      }
      ctx.strokeStyle = `rgba(${rgb},${strokeAlpha * op})`
      ctx.lineWidth = lineW
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // Pre-EQ ghost (complementary hue, drawn first so it's behind)
    drawGhost(this._preSmoothed,  this._getComplementaryRGB(), 0.15, 0.30, 1.0)
    // Post-EQ ghost (accent color, drawn on top)
    drawGhost(this._postSmoothed, this._getAccentRGB(),        0.12, 0.25, 1.2)
  }

  // ── Spectrum RAF loop ─────────────────────────────────────────────────────

  setPlaybackState(playing: boolean): void {
    this._isPlayingAudio = playing
    if (playing) this._startSpectrumLoop()
  }

  private _startSpectrumLoop(): void {
    if (this._spectrumRafId !== null) return
    this._spectrumRafId = requestAnimationFrame(this._spectrumRafLoop)
  }

  private _spectrumRafLoop = (): void => {
    const target = this._isPlayingAudio ? 1 : 0
    this._spectrumOpacity += (target - this._spectrumOpacity) * 0.04

    if (this._spectrumOpacity > 0.01) this._updateSmoothedSpectrum()

    this._drawEQCurve()

    if (this._isPlayingAudio || this._spectrumOpacity > 0.01) {
      this._spectrumRafId = requestAnimationFrame(this._spectrumRafLoop)
    } else {
      this._spectrumRafId = null
    }
  }

  private _updateSmoothedSpectrum(): void {
    const preA  = this.engine.analyserPreEQ
    const postA = this.engine.analyserNode
    if (!preA || !postA) return

    const bins = preA.frequencyBinCount
    if (!this._preSmoothed || this._spectrumBins !== bins) {
      this._preSmoothed  = new Float32Array(bins)
      this._postSmoothed = new Float32Array(bins)
      this._spectrumBins = bins
    }

    const raw   = new Uint8Array(bins)
    const alpha = this._SPECTRUM_ALPHA
    const minDb = preA.minDecibels
    const range = preA.maxDecibels - minDb

    preA.getByteFrequencyData(raw)
    for (let i = 0; i < bins; i++) {
      const v = (raw[i] / 255) * range + minDb
      this._preSmoothed![i] = alpha * this._preSmoothed![i] + (1 - alpha) * v
    }

    postA.getByteFrequencyData(raw)
    for (let i = 0; i < bins; i++) {
      const v = (raw[i] / 255) * range + minDb
      this._postSmoothed![i] = alpha * this._postSmoothed![i] + (1 - alpha) * v
    }
  }

  // Returns 180°-hue-rotated, slightly desaturated version of the accent colour.
  private _getComplementaryRGB(): string {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (accent.startsWith('#')) {
      const hex = accent.slice(1)
      if (hex.length === 6) {
        // Hex → linear [0,1] RGB
        const r = parseInt(hex.slice(0, 2), 16) / 255
        const g = parseInt(hex.slice(2, 4), 16) / 255
        const b = parseInt(hex.slice(4, 6), 16) / 255
        // RGB → HSL
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        const l = (max + min) / 2
        const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min)
        let h = 0
        if (d !== 0) {
          if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
          else if (max === g) h = ((b - r) / d + 2) / 6
          else                h = ((r - g) / d + 4) / 6
        }
        // Rotate hue 180°, desaturate slightly, normalize lightness
        const ch = (h + 0.5) % 1
        const cs = s * 0.8
        const cl = Math.max(0.30, Math.min(0.70, l))
        // HSL → RGB
        const hue2rgb = (p: number, q: number, t: number) => {
          const tt = ((t % 1) + 1) % 1
          if (tt < 1/6) return p + (q - p) * 6 * tt
          if (tt < 1/2) return q
          if (tt < 2/3) return p + (q - p) * (2/3 - tt) * 6
          return p
        }
        const q2 = cl < 0.5 ? cl * (1 + cs) : cl + cs - cl * cs
        const p2 = 2 * cl - q2
        const cr = Math.round(hue2rgb(p2, q2, ch + 1/3) * 255)
        const cg = Math.round(hue2rgb(p2, q2, ch      ) * 255)
        const cb = Math.round(hue2rgb(p2, q2, ch - 1/3) * 255)
        return `${cr},${cg},${cb}`
      }
    }
    return '0,200,255'  // cyan — complements Meridian lime green
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

  // Syncs all slider positions, badges, and EQ node states to a given params object.
  syncToParams(params: AudioParams): void {
    const bands: [HTMLInputElement, HTMLElement, keyof typeof params.eq][] = [
      [this.eqLowSlider,     this.eqLowValue,     'low'],
      [this.eqLowMidSlider,  this.eqLowMidValue,  'lowMid'],
      [this.eqMidSlider,     this.eqMidValue,      'mid'],
      [this.eqHighMidSlider, this.eqHighMidValue,  'highMid'],
      [this.eqHighSlider,    this.eqHighValue,     'high'],
    ]
    for (let i = 0; i < bands.length; i++) {
      const [slider, badge, key] = bands[i]
      const db = params.eq[key]
      slider.value            = String(db)
      badge.textContent       = this._fmtDb(db)
      this._eqNodeState[i].db = db
    }

    this.chorusRateSlider.value     = String(params.chorus.rate)
    this.chorusRateValue.textContent = `${params.chorus.rate.toFixed(1)} Hz`

    const depthPct = Math.round(params.chorus.depth * 100)
    this.chorusDepthSlider.value     = String(depthPct)
    this.chorusDepthValue.textContent = `${depthPct}%`

    const satPct = Math.round(params.saturationDrive * 100)
    this.satDriveSlider.value     = String(satPct)
    this.satDriveValue.textContent = `${satPct}%`

    const abyssDepthPct = Math.round(params.abyss.depth * 100)
    this.abyssDepthSlider.value     = String(abyssDepthPct)
    this.abyssDepthValue.textContent = `${abyssDepthPct}%`

    const abyssResPct = Math.round(params.abyss.resonance * 100)
    this.abyssResonanceSlider.value     = String(abyssResPct)
    this.abyssResonanceValue.textContent = `${abyssResPct}%`

    this._updateHzButtons(params.hzFrequency)
    this._scheduleCurveDraw()
  }
}
