import { Chess } from 'chess.js'
import { prisma } from '../dependencies.js'
import { handleGameTermination } from './gameAction.js'

export const handlePlayerMove = async (
  clients,
  redisClient,
  playerId,
  gameId,
  move,
  isGuestGame = false
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

    const playerColor = gameState.turn
    const whitePlayerId = gameState.whitePlayerId
    const blackPlayerId = gameState.blackPlayerId

    if (
      (playerColor === 'w' && playerId !== whitePlayerId) ||
      (playerColor === 'b' && playerId !== blackPlayerId)
    ) {
      // It's not this player's turn.
      return
    }

    const moveTimestamp = Date.now()
    const timeElapsed = moveTimestamp - gameState.lastMoveTimestamp

    // Check if the time elapsed is within this player's turn time limit
    const playerTimeLimit =
      playerColor === 'w' ? gameState.whiteTime : gameState.blackTime
    if (timeElapsed > playerTimeLimit) {
      // Player took too long to make a move
      return await handleGameTermination(
        clients,
        redisClient,
        gameId,
        playerId,
        'timeout'
      )
    }
    // Update the player's time
    if (playerColor === 'w') {
      gameState.whiteTime -= timeElapsed
    } else {
      gameState.blackTime -= timeElapsed
    }

    // Update the last move timestamp
    gameState.lastMoveTimestamp = moveTimestamp

    // Validate and make the move
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
      gameResult = playerColor === 'w' ? '0-1' : '1-0'
      return await handleGameTermination(
        clients,
        redisClient,
        gameId,
        playerId,
        'checkmate'
      )
    } else if (game.isDraw()) {
      gameResult = '1/2-1/2'
      return await handleGameTermination(
        clients,
        redisClient,
        gameId,
        playerId,
        'draw'
      )
    }

    // Save the new state
    await redisClient.set(`game:${gameId}`, JSON.stringify(gameState))

    // Broadcast the updated state to both players
    const moveUpdatePayload = {
      type: 'move_made',
      move: move,
      fen: gameState.board,
      turn: gameState.turn,
      whiteTime: gameState.whiteTime,
      blackTime: gameState.blackTime,
    }

    const whitePlayerSocket = clients.get(whitePlayerId)
    const blackPlayerSocket = clients.get(blackPlayerId)

    if (whitePlayerSocket)
      whitePlayerSocket.send(JSON.stringify(moveUpdatePayload))
    if (blackPlayerSocket)
      blackPlayerSocket.send(JSON.stringify(moveUpdatePayload))

    // If game is over, update permanent storage
    if (gameResult) {
      if (!isGuestGame) {
        await prisma.game.update({
          where: { id: gameId },
          data: {
            result: gameResult,
            status: 'COMPLETED',
            pgn: game.pgn(),
            finishedAt: new Date(),
          },
        })
      }
      // Remove the game state from Redis
      await redisClient.del(`game:${gameId}`)
    }
  } finally {
    // Release the lock
    await redisClient.del(lockKey)
  }
}
