import type { AudioEngine } from '../audio/AudioEngine'
import { PRESETS } from '../presets'
import type { AudioParams, VisualParams } from '../types'

// Manages the preset strip buttons and fires onPresetApplied / onVisualApplied
// so App.ts can sync all sliders and sphere state.
export class PresetController {
  private engine: AudioEngine
  private buttons: NodeListOf<HTMLButtonElement>

  public onPresetApplied:  ((params: AudioParams)  => void) | null = null
  public onThemeApplied:   ((theme: string)         => void) | null = null
  public onVisualApplied:  ((visual: VisualParams)  => void) | null = null

  constructor(engine: AudioEngine) {
    this.engine = engine
    this.buttons = document.querySelectorAll<HTMLButtonElement>('.preset-card')
    this.wire()
  }

  private wire(): void {
    this.buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.spawnRipple(btn, e)

        const id = btn.dataset.preset
        if (!id) return

        if (id === 'custom') {
          this.setActive(btn)
          this.onPresetApplied?.(this.engine.getParams())
          return
        }

        const preset = PRESETS.find((p) => p.id === id)
        if (!preset) return

        this.engine.applyPreset(preset.params)
        this.setActive(btn)
        this.onPresetApplied?.(preset.params)
        if (preset.theme)  this.onThemeApplied?.(preset.theme)
        if (preset.visual) this.onVisualApplied?.(preset.visual)
      })
    })
  }

  private spawnRipple(btn: HTMLButtonElement, e: MouseEvent): void {
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = (e.clientX - rect.left) - size / 2
    const y = (e.clientY - rect.top) - size / 2
    const ripple = document.createElement('span')
    ripple.className = 'ink-ripple'
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`
    btn.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
  }

  // Marks the given button active and clears the rest
  private setActive(active: HTMLButtonElement): void {
    this.buttons.forEach((btn) => btn.classList.remove('preset-card--active'))
    active.classList.add('preset-card--active')
  }

  // Called when the user manually moves a slider - clears the active preset
  clearActive(): void {
    this.buttons.forEach((btn) => btn.classList.remove('preset-card--active'))
  }
}
