import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'
import redisClient from '../redis.js'
import prisma from '../db.js'

// This map stores the live connections.
const clients = new Map()

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

        // --- Add other handlers like 'move' here later ---
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

// --- Matchmaking Logic (moved here as a helper function) ---
async function attemptToCreateMatch() {
  const queueLength = await redisClient.lLen('matchmaking_queue')

  if (queueLength >= 2) {
    // Pop two player IDs from the queue. They will be strings.
    const playerOneIdStr = await redisClient.rPop('matchmaking_queue')
    const playerTwoIdStr = await redisClient.rPop('matchmaking_queue')

    if (!playerOneIdStr || !playerTwoIdStr) return

    console.log(
      `Popped players from queue: ${playerOneIdStr}, ${playerTwoIdStr}`
    )

    // Convert to numbers for database and map keys
    const playerOneId = parseInt(playerOneIdStr)
    const playerTwoId = parseInt(playerTwoIdStr)

    // Assign colors randomly
    let whitePlayerId, blackPlayerId
    if (Math.random() > 0.5) {
      whitePlayerId = playerOneId
      blackPlayerId = playerTwoId
    } else {
      whitePlayerId = playerTwoId
      blackPlayerId = playerOneId
    }

    console.log(
      `Assigned colors: White=${whitePlayerId}, Black=${blackPlayerId}`
    )

    const game = await prisma.game.create({
      data: { whitePlayerId, blackPlayerId, status: 'IN_PROGRESS' },
    })
    console.log(`Created game ${game.id} in database.`)

    const initialGameState = {
      board: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      whiteTime: 300,
      blackTime: 300,
    }
    await redisClient.set(`game:${game.id}`, JSON.stringify(initialGameState))

    // --- MORE ROBUST NOTIFICATION LOGIC ---
    const whitePlayerSocket = clients.get(whitePlayerId)
    const blackPlayerSocket = clients.get(blackPlayerId)

    if (whitePlayerSocket) {
      whitePlayerSocket.send(
        JSON.stringify({ type: 'game_start', gameId: game.id, color: 'w' })
      )
      console.log(`Sent game_start to White Player: ${whitePlayerId}`)
    } else {
      console.log(
        `Could not find active socket for White Player: ${whitePlayerId}`
      )
    }

    if (blackPlayerSocket) {
      blackPlayerSocket.send(
        JSON.stringify({ type: 'game_start', gameId: game.id, color: 'b' })
      )
      console.log(`Sent game_start to Black Player: ${blackPlayerId}`)
    } else {
      console.log(
        `Could not find active socket for Black Player: ${blackPlayerId}`
      )
    }
  }
}
