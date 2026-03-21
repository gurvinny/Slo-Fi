// Handles Web MIDI API input and routes CC messages to bound callbacks.
// Bindings are set up by App.ts, not here, to keep this class generic.

export type MidiStatus = 'unavailable' | 'disconnected' | 'connected'

export class MidiController {
  private bindings = new Map<number, (normalizedValue: number) => void>()
  private status: MidiStatus = 'unavailable'

  public onStatusChange: ((status: MidiStatus) => void) | null = null

  // Returns true if MIDI was initialised successfully
  async init(): Promise<boolean> {
    if (!('requestMIDIAccess' in navigator)) {
      this.setStatus('unavailable')
      return false
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      this.attachListeners(access)
      this.setStatus(access.inputs.size > 0 ? 'connected' : 'disconnected')

      // Re-attach when devices are plugged/unplugged
      access.onstatechange = () => {
        this.attachListeners(access)
        this.setStatus(access.inputs.size > 0 ? 'connected' : 'disconnected')
      }

      return true
    } catch {
      this.setStatus('unavailable')
      return false
    }
  }

  // Bind a CC number (0-127) to a callback. The value is normalised to 0-1.
  bindCC(ccNumber: number, handler: (normalizedValue: number) => void): void {
    this.bindings.set(ccNumber, handler)
  }

  getStatus(): MidiStatus {
    return this.status
  }

  private attachListeners(access: MIDIAccess): void {
    access.inputs.forEach((input) => {
      input.onmidimessage = (event: MIDIMessageEvent) => this.handleMessage(event)
    })
  }

  private handleMessage(event: MIDIMessageEvent): void {
    const data = event.data
    if (!data || data.length < 3) return

    const statusByte = data[0]!
    // CC messages have status byte 0xB0-0xBF (channel 1-16)
    if ((statusByte & 0xf0) !== 0xb0) return

    const ccNumber = data[1]!
    const rawValue = data[2]!
    const handler = this.bindings.get(ccNumber)
    if (handler) {
      // Normalize 0-127 to 0-1
      handler(rawValue / 127)
    }
  }

  private setStatus(status: MidiStatus): void {
    this.status = status
    this.onStatusChange?.(status)
  }
}
