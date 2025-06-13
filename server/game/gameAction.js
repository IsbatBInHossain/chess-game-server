import { prisma } from '../dependencies.js'
import { TerminationReasons } from '../constants/index.js'

export const handleGameTermination = async (
  clients,
  redisClient,
  gameId,
  playerId,
  reason
) => {
  // Set up a mutex lock
  const lockKey = `lock:gamestatus:${gameId}`
  const lock = await redisClient.set(lockKey, 'locked', { NX: true, EX: 5 }) // Set mutex lock, expire in 5s
  if (!lock) {
    // Could not acquire lock, another termination is being processed.
    // We can just ignore this request.
    return
  }

  try {
    const gameStateJSON = await redisClient.get(`game:${gameId}`)
    if (!gameStateJSON) {
      // Game doesn't exist
      console.warn(`Game ${gameId} does not exist. Cannot terminate.`)
      return
    }

    const gameState = JSON.parse(gameStateJSON)
    const { whitePlayerId, blackPlayerId } = gameState

    if (playerId !== whitePlayerId && playerId !== blackPlayerId) {
      console.warn(
        `Player ${playerId} is not part of game ${gameId}. Cannot terminate.`
      )
      return
    }

    // Determine if its a guest game
    const isGuestGame = typeof whitePlayerId === 'string'

    let result, status

    switch (reason) {
      case TerminationReasons.CHECKMATE:
        result = playerId === whitePlayerId ? '0-1' : '1-0'
        status =
          playerId === whitePlayerId ? 'white_checkmated' : 'black_checkmated'
        break

      case TerminationReasons.STALEMATE:
        result = '1/2-1/2'
        status = 'stalemate'
        break

      case TerminationReasons.DRAW:
        result = '1/2-1/2'
        status = 'draw'
        break

      case TerminationReasons.RESIGNATION:
        result = playerId === whitePlayerId ? '0-1' : '1-0'
        status =
          playerId === whitePlayerId ? 'white_resigned' : 'black_resigned'
        break

      case TerminationReasons.TIMEOUT:
        result = playerId === whitePlayerId ? '0-1' : '1-0'
        status =
          playerId === whitePlayerId ? 'white_timed_out' : 'black_timed_out'
        break

      case TerminationReasons.ABANDONMENT:
        result = playerId === whitePlayerId ? '0-1' : '1-0'
        status =
          playerId === whitePlayerId ? 'white_abandoned' : 'black_abandoned'
        break

      case TerminationReasons.ABORTED:
        result = '*'
        status = 'aborted'
        break

      default:
        result = '*'
        status = 'unknown'
        break
    }

    if (!result || !status) {
      // Invalid termination reason
      console.warn(`Invalid termination reason: ${reason}`)
      return
    }

    // Create the termination payload
    const terminationPayload = {
      type: 'game_over',
      reason,
      winner: result === '1-0' ? 'white' : result === '0-1' ? 'black' : 'none',
      result,
    }

    const whitePlayerSocket = clients.get(whitePlayerId)
    const blackPlayerSocket = clients.get(blackPlayerId)

    if (whitePlayerSocket) {
      whitePlayerSocket.send(JSON.stringify(terminationPayload))
    } else {
      console.warn(`White player socket not found for ID: ${whitePlayerId}`)
    }
    if (blackPlayerSocket) {
      blackPlayerSocket.send(JSON.stringify(terminationPayload))
    } else {
      console.warn(`Black player socket not found for ID: ${blackPlayerId}`)
    }

    // Update the game status in the database if it's not a guest game
    if (!isGuestGame) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          result,
          status,
          finishedAt: new Date(),
        },
      })
    }

    // Remove the game state from Redis
    await redisClient.del(`game:${gameId}`)
    console.log(`Game ${gameId} terminated: ${reason} by player ${playerId}`)
  } catch (error) {
    console.error(`Error terminating game ${gameId}:`, error)
  } finally {
    // Ensure the lock is released in case of an error
    await redisClient.del(lockKey)
  }
}
