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

  // Fired after any slider change so App.ts can notify collab and clear preset
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
  }
}
