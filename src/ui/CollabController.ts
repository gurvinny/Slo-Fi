import { CollabSession } from '../collab/CollabSession'
import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioParams } from '../types'

// Owns the collab panel UI and wires it to CollabSession.
export class CollabController {
  private engine: AudioEngine
  private session: CollabSession | null = null

  private startBtn = document.getElementById('collabStartBtn') as HTMLButtonElement
  private joinBtn = document.getElementById('collabJoinBtn') as HTMLButtonElement
  private roomInput = document.getElementById('collabRoomInput') as HTMLInputElement
  private statusEl = document.getElementById('collabStatus')!

  // Called by App.ts after any local param change when a session is active
  public broadcast(params: AudioParams): void {
    this.session?.send({ type: 'params', payload: params, peerId: '' })
  }

  constructor(engine: AudioEngine) {
    this.engine = engine

    // Warn if not on HTTPS (needed for remote peers)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      this.setStatus('warning', 'HTTPS required for remote connections')
    }

    this.wire()
  }

  private wire(): void {
    this.startBtn.addEventListener('click', async () => {
      try {
        this.setStatus('info', 'Starting session...')
        const session = this.newSession()
        const roomId = await session.startSession()
        this.setStatus('info', `Room ID: ${roomId} — share this with your collaborator`)
        this.startBtn.disabled = true
        this.joinBtn.disabled = true
      } catch (err) {
        this.setStatus('error', 'Could not start session')
        console.error(err)
      }
    })

    this.joinBtn.addEventListener('click', async () => {
      const roomId = this.roomInput.value.trim()
      if (!roomId) return

      // Client-side validation (server also validates)
      if (!/^[a-zA-Z0-9]{1,32}$/.test(roomId)) {
        this.setStatus('error', 'Invalid room ID')
        return
      }

      try {
        this.setStatus('info', 'Connecting...')
        const session = this.newSession()
        await session.joinSession(roomId)
        this.startBtn.disabled = true
        this.joinBtn.disabled = true
      } catch (err) {
        this.setStatus('error', 'Could not join session')
        console.error(err)
      }
    })
  }

  private newSession(): CollabSession {
    this.session?.disconnect()

    const session = new CollabSession()
    this.session = session

    session.onStatusChange = (status) => {
      const labels = {
        idle: '',
        connecting: 'Connecting...',
        connected: 'Connected',
        disconnected: 'Disconnected',
        error: 'Connection error',
      }
      const type = status === 'connected' ? 'success' : status === 'error' || status === 'disconnected' ? 'error' : 'info'
      this.setStatus(type, labels[status])

      if (status === 'disconnected' || status === 'error' || status === 'idle') {
        this.startBtn.disabled = false
        this.joinBtn.disabled = false
      }
    }

    session.onMessage = (msg) => {
      if (msg.type === 'params') {
        // applyPreset validates ranges internally via the setters
        this.engine.applyPreset(msg.payload)
      }
    }

    return session
  }

  // Sets the status text safely (textContent only, no innerHTML)
  private setStatus(type: 'info' | 'success' | 'error' | 'warning', text: string): void {
    this.statusEl.textContent = text
    this.statusEl.className = `collab-status collab-status--${type}`
  }
}
