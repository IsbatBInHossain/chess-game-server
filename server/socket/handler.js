import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import { redisClient } from '../dependencies.js'
import { attemptToCreateMatch } from '../game/matchMaker.js'
import { handlePlayerMove } from '../game/handlePlayerMove.js'
import { handleGameTermination } from '../game/gameAction.js'
import { TerminationReasons } from '../constants/index.js'

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

          if (decoded.isGuest) ws.isGuest = true
          else ws.isGuest = false

          if (!authenticatedUserId) return ws.close(1008, 'Invalid token')

          // Store the authenticated user in the clients map
          clients.set(authenticatedUserId, ws)

          console.log(
            `Storing connection for userId: ${authenticatedUserId}. Current clients:`,
            Array.from(clients.keys())
          )
          ws.send(JSON.stringify({ type: 'auth_success' }))
          return
        }

        // If the user is not authenticated, we can't process any other messages.
        if (!authenticatedUserId) {
          // Close the connection because the client is not following the protocol.
          return ws.close(1008, 'Client must authenticate first')
        }

        // --- Matchmaking Logic ---
        if (data.type === 'find_match') {
          console.log(`User ${authenticatedUserId} is looking for a match.`)
          if (ws.isGuest) {
            await redisClient.lPush(
              'matchmaking_queue:guest',
              authenticatedUserId.toString()
            )
          } else {
            await redisClient.lPush(
              'matchmaking_queue',
              authenticatedUserId.toString()
            )
          }
          await attemptToCreateMatch(clients, redisClient, ws.isGuest)
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
          await handlePlayerMove(
            clients,
            redisClient,
            authenticatedUserId,
            gameId,
            move,
            ws.isGuest
          )
        }

        // --- Game Termination Logic ---
        if (Object.values(TerminationReasons).includes(data.type)) {
          const { gameId } = data
          const reason = data.type

          if (!gameId) {
            return ws.send(
              JSON.stringify({
                type: 'error',
                message: 'Missing gameId for termination.',
              })
            )
          }

          // Delegate the complex logic to a dedicated function
          await handleGameTermination(
            clients,
            redisClient,
            gameId,
            authenticatedUserId,
            reason
          )
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
        if (ws.isGuest) {
          redisClient.lRem(
            'matchmaking_queue:guest',
            0,
            authenticatedUserId.toString()
          )
        } else {
          redisClient.lRem(
            'matchmaking_queue',
            0,
            authenticatedUserId.toString()
          )
        }
        console.log(`User ${authenticatedUserId} disconnected.`)
      } else {
        console.log('Unauthenticated client disconnected.')
      }
    })
  })
}
