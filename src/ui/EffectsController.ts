import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioParams } from '../types'

// Owns the effects chain control section (EQ, chorus, saturation sliders).
// Mirrors the slider pattern already used in App.ts.
export class EffectsController {
  private engine: AudioEngine

  private eqLowSlider = document.getElementById('eqLowSlider') as HTMLInputElement
  private eqMidSlider = document.getElementById('eqMidSlider') as HTMLInputElement
  private eqHighSlider = document.getElementById('eqHighSlider') as HTMLInputElement
  private eqLowValue = document.getElementById('eqLowValue')!
  private eqMidValue = document.getElementById('eqMidValue')!
  private eqHighValue = document.getElementById('eqHighValue')!

  private chorusRateSlider = document.getElementById('chorusRateSlider') as HTMLInputElement
  private chorusDepthSlider = document.getElementById('chorusDepthSlider') as HTMLInputElement
  private chorusRateValue = document.getElementById('chorusRateValue')!
  private chorusDepthValue = document.getElementById('chorusDepthValue')!

  private satDriveSlider = document.getElementById('satDriveSlider') as HTMLInputElement
  private satDriveValue = document.getElementById('satDriveValue')!

  private eightDToggle     = document.getElementById('eightDToggle')     as HTMLInputElement
  private eightDSpeedSlider = document.getElementById('eightDSpeedSlider') as HTMLInputElement
  private eightDSpeedValue  = document.getElementById('eightDSpeedValue')!
  private eightDSpeedRow    = document.getElementById('eightDSpeedRow')!
  private eightDSpeedTicks  = document.getElementById('eightDSpeedTicks')!
  private eightDHint        = document.getElementById('eightDHint')!

  private hzButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-hz'))
  private hzValue   = document.getElementById('hzValue')!
  private hzHint    = document.getElementById('hzHint')!

  private readonly HZ_LABELS: Record<string, string> = {
    off:  'No frequency boost applied',
    '432': '432 Hz — Natural tuning, relaxation & harmony',
    '528': '528 Hz — Love frequency, transformation',
    '639': '639 Hz — Relationship healing, emotional balance',
    '741': '741 Hz — Expression, intuition & mental clarity',
    '852': '852 Hz — Spiritual awareness & inner strength',
    '963': '963 Hz — Divine connection & enlightenment',
  }

  // Fires when the 8D toggle changes so App.ts can sync the sphere
  public on8DChange: ((enabled: boolean, speed: number) => void) | null = null

  // Fired after any slider change so App.ts can clear the active preset
  public onChanged: (() => void) | null = null

  constructor(engine: AudioEngine) {
    this.engine = engine
    this.wire()
  }

  private wire(): void {
    this.eqLowSlider.addEventListener('input', () => {
      const db = parseFloat(this.eqLowSlider.value)
      this.engine.setEQ('low', db)
      this.eqLowValue.textContent = `${db > 0 ? '+' : ''}${db} dB`
      this.onChanged?.()
    })

    this.eqMidSlider.addEventListener('input', () => {
      const db = parseFloat(this.eqMidSlider.value)
      this.engine.setEQ('mid', db)
      this.eqMidValue.textContent = `${db > 0 ? '+' : ''}${db} dB`
      this.onChanged?.()
    })

    this.eqHighSlider.addEventListener('input', () => {
      const db = parseFloat(this.eqHighSlider.value)
      this.engine.setEQ('high', db)
      this.eqHighValue.textContent = `${db > 0 ? '+' : ''}${db} dB`
      this.onChanged?.()
    })

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
    // Slider range 1-20 maps to 0.1-2.0 Hz (divide by 10)
    return parseFloat(this.eightDSpeedSlider.value) / 10
  }

  private _show8DSpeedControls(show: boolean): void {
    const display = show ? '' : 'none'
    this.eightDSpeedRow.style.display  = display
    this.eightDSpeedSlider.style.display = display
    this.eightDSpeedTicks.style.display  = display
    this.eightDHint.style.display = show ? 'none' : ''
  }

  // Syncs slider positions and badges to a given params object.
  // Called when a preset is applied.
  syncToParams(params: AudioParams): void {
    this.eqLowSlider.value = String(params.eq.low)
    this.eqMidSlider.value = String(params.eq.mid)
    this.eqHighSlider.value = String(params.eq.high)
    this.eqLowValue.textContent = `${params.eq.low > 0 ? '+' : ''}${params.eq.low} dB`
    this.eqMidValue.textContent = `${params.eq.mid > 0 ? '+' : ''}${params.eq.mid} dB`
    this.eqHighValue.textContent = `${params.eq.high > 0 ? '+' : ''}${params.eq.high} dB`

    this.chorusRateSlider.value = String(params.chorus.rate)
    this.chorusRateValue.textContent = `${params.chorus.rate.toFixed(1)} Hz`

    const depthPct = Math.round(params.chorus.depth * 100)
    this.chorusDepthSlider.value = String(depthPct)
    this.chorusDepthValue.textContent = `${depthPct}%`

    const satPct = Math.round(params.saturationDrive * 100)
    this.satDriveSlider.value = String(satPct)
    this.satDriveValue.textContent = `${satPct}%`

    this._updateHzButtons(params.hzFrequency)
  }
}
