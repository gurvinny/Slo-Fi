// Minimal WebSocket signaling server for WebRTC peer discovery.
// Handles offer/answer/ICE candidate exchange only.
// All audio stays on the clients - this server never sees it.
//
// Run with: node signaling.js
// Default port: 8080 (set PORT env var to override)

const { WebSocketServer } = require('ws')

const PORT = parseInt(process.env.PORT ?? '8080', 10)
const MAX_PEERS_PER_ROOM = 2
const MAX_MESSAGE_BYTES = 4096
const RATE_LIMIT_WINDOW_MS = 1000
const RATE_LIMIT_MAX_MESSAGES = 10

// rooms: Map<roomId, Set<WebSocket>>
const rooms = new Map()

// Per-connection rate limit tracking
const rateCounters = new Map() // ws -> { count, resetAt }

const wss = new WebSocketServer({ port: PORT })

wss.on('listening', () => {
  console.log(`Signaling server running on ws://localhost:${PORT}`)
})

wss.on('connection', (ws) => {
  let currentRoom = null

  ws.on('message', (rawData) => {
    // Enforce message size limit
    if (rawData.length > MAX_MESSAGE_BYTES) {
      send(ws, { type: 'error', message: 'Message too large' })
      return
    }

    // Rate limiting
    if (!checkRateLimit(ws)) {
      send(ws, { type: 'error', message: 'Rate limit exceeded' })
      return
    }

    let msg
    try {
      msg = JSON.parse(rawData.toString())
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    if (!msg || typeof msg.type !== 'string') return

    switch (msg.type) {
      case 'join-room': {
        const roomId = msg.roomId
        // Validate room ID: alphanumeric only, max 32 chars
        if (typeof roomId !== 'string' || !/^[a-zA-Z0-9]{1,32}$/.test(roomId)) {
          send(ws, { type: 'error', message: 'Invalid room ID' })
          return
        }

        if (!rooms.has(roomId)) rooms.set(roomId, new Set())
        const room = rooms.get(roomId)

        if (room.size >= MAX_PEERS_PER_ROOM) {
          send(ws, { type: 'error', message: 'Room is full' })
          return
        }

        room.add(ws)
        currentRoom = roomId

        send(ws, { type: 'joined', roomId, peerCount: room.size })

        // Tell the other peer someone joined
        if (room.size === 2) {
          broadcast(room, ws, { type: 'peer-joined' })
        }
        break
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate': {
        if (!currentRoom) return
        const room = rooms.get(currentRoom)
        if (!room) return
        // Forward to the other peer - never trust origin, just forward the payload
        broadcast(room, ws, { type: msg.type, payload: msg.payload })
        break
      }

      case 'leave': {
        handleLeave(ws, currentRoom)
        currentRoom = null
        break
      }

      default:
        break
    }
  })

  ws.on('close', () => {
    handleLeave(ws, currentRoom)
    rateCounters.delete(ws)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message)
  })
})

function handleLeave(ws, roomId) {
  if (!roomId) return
  const room = rooms.get(roomId)
  if (!room) return
  room.delete(ws)
  // Tell the remaining peer their partner left
  broadcast(room, null, { type: 'peer-left' })
  // Clean up empty rooms
  if (room.size === 0) rooms.delete(roomId)
}

// Send to all peers in a room except 'except'
function broadcast(room, except, msg) {
  room.forEach((peer) => {
    if (peer !== except && peer.readyState === 1) {
      send(peer, msg)
    }
  })
}

function send(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg))
  }
}

function checkRateLimit(ws) {
  const now = Date.now()
  let counter = rateCounters.get(ws)

  if (!counter || now > counter.resetAt) {
    counter = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateCounters.set(ws, counter)
  }

  counter.count++
  return counter.count <= RATE_LIMIT_MAX_MESSAGES
}
