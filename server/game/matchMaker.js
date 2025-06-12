import redisClient from '../redis.js'
import prisma from '../db.js'

export const attemptToCreateMatch = async clients => {
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

    console.log(
      `Attempting to find sockets for ${whitePlayerId} and ${blackPlayerId} in clients map. Current keys:`,
      Array.from(clients.keys())
    )
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
