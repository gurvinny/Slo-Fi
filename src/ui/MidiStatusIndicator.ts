import type { MidiStatus } from '../audio/MidiController'

// Updates the small status dot in the header based on MIDI connection state.
export class MidiStatusIndicator {
  private dot = document.getElementById('midiStatus')!

  update(status: MidiStatus): void {
    this.dot.classList.remove('status-dot--connected', 'status-dot--disconnected', 'status-dot--unavailable')
    this.dot.classList.add(`status-dot--${status}`)

    const labels: Record<MidiStatus, string> = {
      connected: 'MIDI: connected',
      disconnected: 'MIDI: no device found',
      unavailable: 'MIDI: not supported in this browser',
    }
    this.dot.title = labels[status]
    this.dot.setAttribute('aria-label', labels[status])
  }
}
