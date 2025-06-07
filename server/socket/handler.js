import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import redisClient from '../redis.js'
import { attemptToCreateMatch } from '../game/matchMaker.js'
import { handlePlayerMove } from '../game/handlePlayerMove.js'

// This map stores the live connections.
export const clients = new Map()

// This function will set up all the WebSocket logic.
export function initializeWebSocket(server) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', ws => {
    console.log('A new client connected. Awaiting authentication...')
    let authenticatedUserId = null

    ws.on('message', async message => {
      try {
        const data = JSON.parse(message)

        // --- Authentication Logic ---
        if (data.type === 'auth') {
          const { token } = data
          if (!token) return ws.close(1008, 'Token not provided')

          const decoded = jwt.verify(token, process.env.JWT_SECRET)
          authenticatedUserId = decoded.id
          if (!authenticatedUserId) return ws.close(1008, 'Invalid token')

          // Store the authenticated user in the clients map
          clients.set(authenticatedUserId, ws)
          console.log(`User ${authenticatedUserId} authenticated.`)
          ws.send(JSON.stringify({ type: 'auth_success' }))
          return
        }

        // --- Matchmaking Logic ---
        if (data.type === 'find_match') {
          console.log(`User ${authenticatedUserId} is looking for a match.`)
          await redisClient.lPush(
            'matchmaking_queue',
            authenticatedUserId.toString()
          )
          await attemptToCreateMatch()
        }

        // --- Game Move Logic ---
        if (data.type === 'move') {
          const { gameId, move } = data

          if (!gameId || !move) {
            return ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Missing gameId or move data.',
              })
            )
          }

          // Delegate the complex logic to a dedicated function
          await handlePlayerMove(authenticatedUserId, gameId, move)
        }
      } catch (error) {
        console.error('WebSocket Error:', error)
        ws.send(
          JSON.stringify({ type: 'error', message: 'An error occurred.' })
        )
      }
    })

    ws.on('close', () => {
      if (authenticatedUserId) {
        clients.delete(authenticatedUserId)
        redisClient.lRem('matchmaking_queue', 0, authenticatedUserId.toString())
        console.log(`User ${authenticatedUserId} disconnected.`)
      } else {
        console.log('Unauthenticated client disconnected.')
      }
    })
  })
}
