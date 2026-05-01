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
      btn.addEventListener('click', () => {
        const id = btn.dataset.preset
        if (!id) return

        if (id === 'custom') {
          // Custom just captures current state and marks itself active
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
