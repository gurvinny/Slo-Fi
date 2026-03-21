import type { AudioEngine } from '../audio/AudioEngine'
import { exportAudio } from '../audio/Exporter'

// Owns the export button and status text.
export class ExportController {
  private engine: AudioEngine
  private btn = document.getElementById('exportBtn') as HTMLButtonElement
  private status = document.getElementById('exportStatus')!

  // The current track name (set by App.ts after file load)
  public trackName = 'slo-fi-export'

  constructor(engine: AudioEngine) {
    this.engine = engine
    this.wire()
  }

  private wire(): void {
    this.btn.addEventListener('click', () => this.run())
  }

  private async run(): Promise<void> {
    if (!this.engine.hasBuffer) return

    this.btn.disabled = true
    this.status.textContent = 'Rendering...'

    try {
      await exportAudio(this.engine, this.trackName)
      this.status.textContent = 'Done'
    } catch (err) {
      console.error('Export failed:', err)
      this.status.textContent = 'Export failed'
    } finally {
      this.btn.disabled = false
      // Clear the status message after a couple of seconds
      setTimeout(() => { this.status.textContent = '' }, 3000)
    }
  }
}
