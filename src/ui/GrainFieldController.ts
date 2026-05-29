import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioParams, GrainBand, GrainFieldParams } from '../types'

// Owns the GrainField tab: master enable toggle, XY scrub pad, knobs, and
// the 3-band freeze/enable matrix. Mirrors the EffectsController pattern —
// captures DOM, wires events, forwards to AudioEngine.setGrainParam(...).

interface PadDot { x: number; y: number; age: number; voice: 0 | 1 | 2 }

export class GrainFieldController {
  private engine: AudioEngine

  // Master enable
  private enableToggle      = document.getElementById('gfEnableToggle') as HTMLInputElement

  // XY pad
  private xyPad             = document.getElementById('gfXYPad') as HTMLCanvasElement
  private xyCtx: CanvasRenderingContext2D | null = null
  private _padDpr           = 1
  private _padDots: PadDot[] = []
  private _padDragging      = false
  // Cached normalized X/Y from the latest pointer event — drives position +
  // density without going through DOM read-back during the rAF loop.
  private _padX             = 0.5
  private _padY             = 0.3

  // Knobs
  private grainSizeSlider   = document.getElementById('gfGrainSizeSlider')   as HTMLInputElement
  private grainSizeValue    = document.getElementById('gfGrainSizeValue')!
  private densitySlider     = document.getElementById('gfDensitySlider')     as HTMLInputElement
  private densityValue      = document.getElementById('gfDensityValue')!
  private spreadSlider      = document.getElementById('gfSpreadSlider')      as HTMLInputElement
  private spreadValue       = document.getElementById('gfSpreadValue')!
  private pitchScatterSlider = document.getElementById('gfPitchScatterSlider') as HTMLInputElement
  private pitchScatterValue  = document.getElementById('gfPitchScatterValue')!
  private attackSlider      = document.getElementById('gfAttackSlider')      as HTMLInputElement
  private attackValue       = document.getElementById('gfAttackValue')!
  private decaySlider       = document.getElementById('gfDecaySlider')       as HTMLInputElement
  private decayValue        = document.getElementById('gfDecayValue')!
  private mixSlider         = document.getElementById('gfMixSlider')         as HTMLInputElement
  private mixValue          = document.getElementById('gfMixValue')!

  // Band toggles
  private bandToggles: Record<GrainBand, { enable: HTMLInputElement; freeze: HTMLInputElement }> = {
    bass:   { enable: document.getElementById('gfBassEnableToggle')   as HTMLInputElement, freeze: document.getElementById('gfBassFreezeToggle')   as HTMLInputElement },
    mid:    { enable: document.getElementById('gfMidEnableToggle')    as HTMLInputElement, freeze: document.getElementById('gfMidFreezeToggle')    as HTMLInputElement },
    treble: { enable: document.getElementById('gfTrebleEnableToggle') as HTMLInputElement, freeze: document.getElementById('gfTrebleFreezeToggle') as HTMLInputElement },
  }

  public onChanged: (() => void) | null = null
  // Notified when a freeze toggle changes — used by App to forward the
  // freeze state to AnomalySphere for the visual hold-multiplier.
  public onFreezeChanged: ((bass: boolean, mid: boolean, treble: boolean) => void) | null = null

  constructor(engine: AudioEngine) {
    this.engine = engine
    if (this.xyPad) {
      this.xyCtx = this.xyPad.getContext('2d')
      this._resizePad()
      this._wirePad()
      this._startPadLoop()
    }
    this._wireKnobs()
    this._wireBandToggles()
    this._wireEnable()
  }

  // ── XY pad ───────────────────────────────────────────────────────────────

  private _resizePad(): void {
    if (!this.xyPad || !this.xyCtx) return
    const dpr = window.devicePixelRatio || 1
    const rect = this.xyPad.getBoundingClientRect()
    if (rect.width === 0) return
    this._padDpr = dpr
    this.xyPad.width  = rect.width * dpr
    this.xyPad.height = rect.height * dpr
    this.xyCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private _wirePad(): void {
    const pad = this.xyPad
    const updateFromEvent = (clientX: number, clientY: number) => {
      const rect = pad.getBoundingClientRect()
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const ny = Math.max(0, Math.min(1, (clientY - rect.top)  / rect.height))
      this._padX = nx
      this._padY = ny
      this.engine.setGrainParam('position', nx)
      // Y inverted: top = high density (40), bottom = low (1)
      const density = 1 + (1 - ny) * 39
      this.engine.setGrainParam('density', density)
      this.densitySlider.value = String(Math.round(density))
      this.densityValue.textContent = `${Math.round(density)} /s`
      this.onChanged?.()
    }
    pad.addEventListener('pointerdown', (e) => {
      this._padDragging = true
      pad.setPointerCapture(e.pointerId)
      updateFromEvent(e.clientX, e.clientY)
      e.preventDefault()
    })
    pad.addEventListener('pointermove', (e) => {
      if (!this._padDragging) return
      updateFromEvent(e.clientX, e.clientY)
    })
    const endDrag = (e: PointerEvent) => {
      this._padDragging = false
      try { pad.releasePointerCapture(e.pointerId) } catch { /* not captured */ }
    }
    pad.addEventListener('pointerup', endDrag)
    pad.addEventListener('pointercancel', endDrag)
    window.addEventListener('resize', () => this._resizePad())
  }

  // Called by App when the worklet reports a grain spawn — adds a dot at the
  // grain's harvest position on the pad for visual feedback.
  public onGrainSpawn(voice: 0 | 1 | 2, posNorm: number, _sizeMs: number, _pan: number): void {
    if (!this.xyPad) return
    // Cap the dot pool — 64 max is plenty
    if (this._padDots.length >= 64) this._padDots.shift()
    this._padDots.push({ x: posNorm, y: this._padY, age: 0, voice })
  }

  private _startPadLoop(): void {
    if (!this.xyCtx) return
    const draw = () => {
      requestAnimationFrame(draw)
      this._drawPad()
    }
    requestAnimationFrame(draw)
  }

  private _drawPad(): void {
    const ctx = this.xyCtx
    const pad = this.xyPad
    if (!ctx || !pad) return
    const rect = pad.getBoundingClientRect()
    const W = rect.width
    const H = rect.height
    if (W === 0 || H === 0) return

    // If size changed (e.g. drawer just opened), refresh internal dims
    if (pad.width !== Math.round(W * this._padDpr)) this._resizePad()

    ctx.clearRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 1; i < 5; i++) {
      const x = (i / 5) * W
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      const y = (i / 5) * H
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Grain dots — age out over ~30 frames
    const surviving: PadDot[] = []
    for (const d of this._padDots) {
      d.age++
      const alpha = Math.max(0, 1 - d.age / 30)
      if (alpha <= 0) continue
      surviving.push(d)
      const px = d.x * W
      const py = d.y * H
      // Voice colour: bass = warm, mid = neutral, treble = cool
      const hueByVoice = d.voice === 0 ? 20 : d.voice === 1 ? 280 : 200
      ctx.fillStyle = `hsla(${hueByVoice}, 80%, 65%, ${alpha})`
      ctx.beginPath()
      ctx.arc(px, py, 3 + alpha * 4, 0, Math.PI * 2)
      ctx.fill()
    }
    this._padDots = surviving

    // Crosshair at current position / density
    const cx = this._padX * W
    const cy = this._padY * H
    ctx.strokeStyle = 'rgba(176, 138, 255, 0.55)'
    ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke()
    ctx.fillStyle = '#b08aff'
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill()
  }

  // ── Knobs ────────────────────────────────────────────────────────────────

  private _wireKnobs(): void {
    this.grainSizeSlider.addEventListener('input', () => {
      const ms = parseInt(this.grainSizeSlider.value)
      this.engine.setGrainParam('grainSize', ms / 1000)
      this.grainSizeValue.textContent = `${ms} ms`
      this.onChanged?.()
    })
    this.densitySlider.addEventListener('input', () => {
      const d = parseInt(this.densitySlider.value)
      this.engine.setGrainParam('density', d)
      this.densityValue.textContent = `${d} /s`
      this.onChanged?.()
    })
    this.spreadSlider.addEventListener('input', () => {
      const pct = parseInt(this.spreadSlider.value)
      this.engine.setGrainParam('spread', pct / 100)
      this.spreadValue.textContent = `${pct}%`
      this.onChanged?.()
    })
    this.pitchScatterSlider.addEventListener('input', () => {
      const st = parseInt(this.pitchScatterSlider.value)
      this.engine.setGrainParam('pitchScatter', st)
      this.pitchScatterValue.textContent = st === 0 ? '0 st' : `±${st} st`
      this.onChanged?.()
    })
    this.attackSlider.addEventListener('input', () => {
      const pct = parseInt(this.attackSlider.value)
      this.engine.setGrainParam('attack', pct / 100)
      this.attackValue.textContent = `${pct}%`
      this.onChanged?.()
    })
    this.decaySlider.addEventListener('input', () => {
      const pct = parseInt(this.decaySlider.value)
      this.engine.setGrainParam('decay', pct / 100)
      this.decayValue.textContent = `${pct}%`
      this.onChanged?.()
    })
    this.mixSlider.addEventListener('input', () => {
      const pct = parseInt(this.mixSlider.value)
      this.engine.setGrainParam('mix', pct / 100)
      this.mixValue.textContent = `${pct}%`
      this.onChanged?.()
    })
  }

  private _wireBandToggles(): void {
    for (const band of ['bass', 'mid', 'treble'] as GrainBand[]) {
      const refs = this.bandToggles[band]
      refs.enable.addEventListener('change', () => {
        this.engine.setGrainBandEnable(band, refs.enable.checked)
        this.onChanged?.()
      })
      refs.freeze.addEventListener('change', () => {
        this.engine.setGrainBandFreeze(band, refs.freeze.checked)
        this._fireFreezeChanged()
        this.onChanged?.()
      })
    }
  }

  private _wireEnable(): void {
    this.enableToggle.addEventListener('change', () => {
      this.engine.setGrainEnabled(this.enableToggle.checked)
      this.onChanged?.()
    })
  }

  // Called by App on preset apply so the GrainField DOM reflects the new state.
  public syncToParams(params: AudioParams): void {
    const g: GrainFieldParams = params.grainField ?? this.engine.getGrainParams()
    this.enableToggle.checked = g.enabled
    this.grainSizeSlider.value = String(Math.round(g.grainSize * 1000))
    this.grainSizeValue.textContent = `${Math.round(g.grainSize * 1000)} ms`
    this.densitySlider.value = String(Math.round(g.density))
    this.densityValue.textContent = `${Math.round(g.density)} /s`
    this.spreadSlider.value = String(Math.round(g.spread * 100))
    this.spreadValue.textContent = `${Math.round(g.spread * 100)}%`
    this.pitchScatterSlider.value = String(Math.round(g.pitchScatter))
    this.pitchScatterValue.textContent = g.pitchScatter === 0 ? '0 st' : `±${Math.round(g.pitchScatter)} st`
    this.attackSlider.value = String(Math.round(g.attack * 100))
    this.attackValue.textContent = `${Math.round(g.attack * 100)}%`
    this.decaySlider.value = String(Math.round(g.decay * 100))
    this.decayValue.textContent = `${Math.round(g.decay * 100)}%`
    this.mixSlider.value = String(Math.round(g.mix * 100))
    this.mixValue.textContent = `${Math.round(g.mix * 100)}%`
    for (const band of ['bass', 'mid', 'treble'] as GrainBand[]) {
      this.bandToggles[band].enable.checked = g.bandEnable[band]
      this.bandToggles[band].freeze.checked = g.freeze[band]
    }
    this._padX = g.position
    this._padY = 1 - (g.density - 1) / 39
  }

  // Called when the GrainField tab becomes visible — refresh canvas dims
  public onTabShown(): void {
    this._resizePad()
  }

  private _fireFreezeChanged(): void {
    this.onFreezeChanged?.(
      this.bandToggles.bass.freeze.checked,
      this.bandToggles.mid.freeze.checked,
      this.bandToggles.treble.freeze.checked,
    )
  }
}
