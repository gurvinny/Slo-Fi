import type { CollabMessage, AudioParams } from '../types'
import { isValidAudioParams } from '../types'

export type CollabStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

// Manages a WebRTC peer connection + data channel for real-time param sync.
// WebSocket is used only for signaling (offer/answer/ICE).
// Once the data channel opens, all messages go peer-to-peer.
export class CollabSession {
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private peerId: string
  private pendingCandidates: RTCIceCandidateInit[] = []
  private remoteDescriptionSet = false

  public onMessage: ((msg: CollabMessage) => void) | null = null
  public onStatusChange: ((status: CollabStatus) => void) | null = null

  // Point this at your signaling server
  static signalingUrl = `ws://${location.hostname}:8080`

  constructor() {
    // Each peer gets a unique ID to prevent echo-back
    this.peerId = crypto.randomUUID()
  }

  // Start a new room. Returns the room ID to share with the other peer.
  async startSession(): Promise<string> {
    // Room ID: 8 random alphanumeric chars
    const roomId = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => (b % 36).toString(36))
      .join('')
      .toUpperCase()

    await this.connectSignaling(roomId)
    return roomId
  }

  // Join an existing room using the room ID the other peer shared.
  async joinSession(roomId: string): Promise<void> {
    // Validate before sending to the server
    if (!/^[a-zA-Z0-9]{1,32}$/.test(roomId)) {
      throw new Error('Invalid room ID')
    }
    await this.connectSignaling(roomId)
  }

  send(msg: CollabMessage): void {
    if (this.dc?.readyState === 'open') {
      this.dc.send(JSON.stringify(msg))
    }
  }

  disconnect(): void {
    this.dc?.close()
    this.pc?.close()
    this.ws?.close()
    this.dc = null
    this.pc = null
    this.ws = null
    this.setStatus('idle')
  }

  private async connectSignaling(roomId: string): Promise<void> {
    this.setStatus('connecting')

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(CollabSession.signalingUrl)
      this.ws = ws

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('Signaling server connection timed out'))
      }, 10000)

      ws.onopen = () => {
        clearTimeout(timeout)
        ws.send(JSON.stringify({ type: 'join-room', roomId }))
        resolve()
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        this.setStatus('error')
        reject(new Error('Could not connect to signaling server'))
      }

      ws.onmessage = (event) => {
        this.handleSignalingMessage(event.data)
      }

      ws.onclose = () => {
        if (this.dc?.readyState !== 'open') {
          this.setStatus('disconnected')
        }
      }
    })
  }

  private async handleSignalingMessage(rawData: string): Promise<void> {
    let msg: { type: string; payload?: unknown; roomId?: string; peerCount?: number }
    try {
      msg = JSON.parse(rawData)
    } catch {
      return
    }

    switch (msg.type) {
      case 'joined':
        // We're in the room. If we're the first peer, just wait for peer-joined.
        // (roomId and peerCount from msg.roomId / msg.peerCount are informational only)
        break

      case 'peer-joined':
        // We were here first - initiate the offer
        await this.createOffer()
        break

      case 'offer': {
        await this.handleOffer(msg.payload as RTCSessionDescriptionInit)
        break
      }

      case 'answer': {
        if (this.pc) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit))
          this.remoteDescriptionSet = true
          await this.flushPendingCandidates()
        }
        break
      }

      case 'ice-candidate': {
        const candidate = msg.payload as RTCIceCandidateInit
        if (this.remoteDescriptionSet && this.pc) {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
        } else {
          // Buffer until after offer/answer exchange
          this.pendingCandidates.push(candidate)
        }
        break
      }

      case 'peer-left':
        this.setStatus('disconnected')
        break

      case 'error':
        console.error('Signaling error:', (msg as { message?: string }).message)
        this.setStatus('error')
        break
    }
  }

  private buildPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [
        // Public STUN server for NAT traversal.
        // Note: this sends your IP to stun.l.google.com for connectivity discovery only.
        // No audio or session data is transmitted.
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws?.send(JSON.stringify({ type: 'ice-candidate', payload: event.candidate }))
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.setStatus('connected')
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.setStatus('disconnected')
      }
    }

    return pc
  }

  private async createOffer(): Promise<void> {
    const pc = this.buildPeerConnection()
    this.pc = pc

    const dc = pc.createDataChannel('params', { ordered: true })
    this.dc = dc
    this.wireDataChannel(dc)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.ws?.send(JSON.stringify({ type: 'offer', payload: offer }))
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.buildPeerConnection()
    this.pc = pc

    pc.ondatachannel = (event) => {
      this.dc = event.channel
      this.wireDataChannel(event.channel)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))
    this.remoteDescriptionSet = true
    await this.flushPendingCandidates()

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.ws?.send(JSON.stringify({ type: 'answer', payload: answer }))
  }

  private wireDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => {
      this.setStatus('connected')
      // Once the data channel is open, we don't need the WebSocket anymore
    }

    dc.onclose = () => {
      this.setStatus('disconnected')
    }

    dc.onmessage = (event) => {
      this.handleDataMessage(event.data)
    }
  }

  private handleDataMessage(rawData: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(rawData)
    } catch {
      return
    }

    if (!msg || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>

    // Ignore messages we sent ourselves
    if (m.peerId === this.peerId) return

    // Validate message type
    if (m.type !== 'params' && m.type !== 'ping' && m.type !== 'pong') return

    if (m.type === 'params') {
      // Strict validation before applying to the audio engine
      if (!isValidAudioParams(m.payload)) {
        console.warn('Received invalid AudioParams from peer, ignoring')
        return
      }
      this.onMessage?.({ type: 'params', payload: m.payload as AudioParams, peerId: String(m.peerId) })
    }
  }

  private async flushPendingCandidates(): Promise<void> {
    for (const candidate of this.pendingCandidates) {
      await this.pc?.addIceCandidate(new RTCIceCandidate(candidate))
    }
    this.pendingCandidates = []
  }

  private setStatus(status: CollabStatus): void {
    this.onStatusChange?.(status)
  }
}
