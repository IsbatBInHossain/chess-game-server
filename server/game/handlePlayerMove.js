import { Chess } from 'chess.js'
import { prisma } from '../dependencies.js'

export const handlePlayerMove = async (
  clients,
  redisClient,
  playerId,
  gameId,
  move
) => {
  const lockKey = `lock:game:${gameId}`
  const lock = await redisClient.set(lockKey, 'locked', { NX: true, EX: 5 }) // Set mutex lock, expire in 5s

  if (!lock) {
    // Could not acquire lock, another move is being processed.
    // We can just ignore this request.
    return
  }

  try {
    // Get the current game state
    const gameStateJSON = await redisClient.get(`game:${gameId}`)
    if (!gameStateJSON) return // Game doesn't exist

    const gameState = JSON.parse(gameStateJSON)
    const game = new Chess(gameState.board) // Load the FEN into chess.js

    // Validate the move
    const playerColor = gameState.turn
    const dbGame = await prisma.game.findUnique({ where: { id: gameId } })

    if (
      (playerColor === 'w' && playerId !== dbGame.whitePlayerId) ||
      (playerColor === 'b' && playerId !== dbGame.blackPlayerId)
    ) {
      // It's not this player's turn.
      return
    }

    // Is the move legal?
    const result = game.move(move)
    if (result === null) {
      // Illegal move
      return
    }

    // Update the game state
    gameState.board = game.fen()
    gameState.turn = game.turn()

    // Check for game over
    let gameResult = null
    if (game.isCheckmate()) {
      gameResult = playerColor === 'w' ? '1-0' : '0-1'
    } else if (game.isDraw()) {
      gameResult = '1/2-1/2'
    }

    // Save the new state
    await redisClient.set(`game:${gameId}`, JSON.stringify(gameState))

    // Broadcast the updated state to both players
    const moveUpdatePayload = {
      type: 'move_made',
      move: move,
      fen: gameState.board,
      turn: gameState.turn,
    }

    const whitePlayerSocket = clients.get(dbGame.whitePlayerId)
    const blackPlayerSocket = clients.get(dbGame.blackPlayerId)

    if (whitePlayerSocket)
      whitePlayerSocket.send(JSON.stringify(moveUpdatePayload))
    if (blackPlayerSocket)
      blackPlayerSocket.send(JSON.stringify(moveUpdatePayload))

    // If game is over, update permanent storage
    if (gameResult) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          result: gameResult,
          status: 'COMPLETED',
          pgn: game.pgn(),
          finishedAt: new Date(),
        },
      })
      // Remove the game state from Redis
      await redisClient.del(`game:${gameId}`)
    }
  } finally {
    // Release the lock
    await redisClient.del(lockKey)
  }
}
