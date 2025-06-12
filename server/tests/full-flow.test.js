import request from 'supertest'
import WebSocket from 'ws'
import { server } from '../server.js'
import {
  prisma,
  connectDependencies,
  disconnectDependencies,
  redisClient,
} from '../dependencies.js'

/**
 * A robust helper function to wait for a specific message type from a WebSocket.
 * It includes a timeout to prevent tests from hanging and properly handles errors.
 * @param {WebSocket} ws The WebSocket client instance.
 * @param {string} expectedType The 'type' property of the message to wait for.
 * @returns {Promise<object>} A promise that resolves with the parsed message data.
 */
const waitForMessage = (ws, expectedType) => {
  return new Promise((resolve, reject) => {
    // Set a timeout to prevent the test from hanging indefinitely.
    const timeout = setTimeout(() => {
      // Clean up listener before rejecting
      ws.removeListener('message', listener)
      reject(
        new Error(`Test timed out waiting for message type: ${expectedType}`)
      )
    }, 15000) // 15-second timeout, generous for CI environments.

    const listener = message => {
      try {
        const data = JSON.parse(message)
        console.log(`TEST CLIENT RECEIVED:`, data) // Log every message for easier debugging.

        // If we receive the message we're waiting for, we're done.
        if (data.type === expectedType) {
          clearTimeout(timeout)
          ws.removeListener('message', listener)
          resolve(data)
        }
        // If the server sends a specific error, fail the test immediately.
        else if (data.type === 'error') {
          clearTimeout(timeout)
          ws.removeListener('message', listener)
          reject(
            new Error(
              `Server sent an error: ${data.message || 'Unknown error'}`
            )
          )
        }
      } catch (e) {
        // If JSON.parse fails, it's a critical error.
        clearTimeout(timeout)
        ws.removeListener('message', listener)
        reject(new Error(`Failed to parse message from server: ${message}`))
      }
    }
    ws.on('message', listener)
  })
}

describe('Full Chess Game Flow Integration Test', () => {
  let player1 = {}
  let player2 = {}
  let serverInstance

  /**
   * SETUP: Runs ONCE before all tests in this suite.
   * This is the most critical part. We start the server and wait for it to be
   * truly listening before we do anything else. This eliminates race conditions.
   */
  beforeAll(done => {
    serverInstance = server.listen(0, async () => {
      try {
        await connectDependencies()

        // Ensure a clean slate in BOTH databases before the test run.
        await redisClient.flushAll()
        await prisma.game.deleteMany({})
        await prisma.user.deleteMany({})

        // Create test users via the HTTP API.
        await request(serverInstance)
          .post('/api/auth/register')
          .send({ username: 'testuser1', password: 'password' })
        await request(serverInstance)
          .post('/api/auth/register')
          .send({ username: 'testuser2', password: 'password' })

        // Log in users to get their JWTs for WebSocket authentication.
        const res1 = await request(serverInstance)
          .post('/api/auth/login')
          .send({ username: 'testuser1', password: 'password' })
        const res2 = await request(serverInstance)
          .post('/api/auth/login')
          .send({ username: 'testuser2', password: 'password' })

        // Correctly extract token from the Authorization header.
        player1.token = res1.headers.authorization?.split(' ')[1]
        player2.token = res2.headers.authorization?.split(' ')[1]

        if (!player1.token || !player2.token) {
          throw new Error('Failed to retrieve tokens for test users')
        }

        // Signal to Jest that all asynchronous setup is complete.
        done()
      } catch (error) {
        done(error) // If any setup step fails, fail the entire suite.
      }
    })
  })

  /**
   * TEARDOWN: Runs ONCE after all tests in this suite are complete.
   * This gracefully shuts down all connections to prevent "open handles" errors.
   */
  afterAll(done => {
    disconnectDependencies().then(() => {
      serverInstance.close(() => {
        done() // Signal Jest that teardown is complete.
      })
    })
  })

  /**
   * A helper to create and authenticate a WebSocket client.
   * @param {string} token The user's JWT.
   * @returns {Promise<WebSocket>} The authenticated WebSocket client.
   */
  const createAuthenticatedClient = token => {
    const { port } = serverInstance.address() // Get the dynamic port the server is running on.
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`)
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })))
      ws.on('error', reject)
      // Use our robust helper to wait for the authentication success message.
      waitForMessage(ws, 'auth_success')
        .then(() => resolve(ws))
        .catch(reject)
    })
  }

  // The actual test case.
  test('Two players should connect, find a match, and make a move', async () => {
    // Step 1: Create two authenticated clients.
    const ws1 = await createAuthenticatedClient(player1.token)
    const ws2 = await createAuthenticatedClient(player2.token)

    // Step 2: Set up listeners to wait for the 'game_start' message for each player.
    const p1GameStartPromise = waitForMessage(ws1, 'game_start')
    const p2GameStartPromise = waitForMessage(ws2, 'game_start')

    // Step 3: Both players request a match.
    ws1.send(JSON.stringify({ type: 'find_match' }))
    ws2.send(JSON.stringify({ type: 'find_match' }))

    // Step 4: Wait for the server to create the match and send the start event.
    // Promise.all waits for both events to arrive concurrently.
    const [gameData1, gameData2] = await Promise.all([
      p1GameStartPromise,
      p2GameStartPromise,
    ])

    // Assert that a game was created successfully.
    expect(gameData1.gameId).toBeDefined()
    expect(gameData1.gameId).toEqual(gameData2.gameId)
    const gameId = gameData1.gameId

    // Step 5: Determine who is white and set up listeners for the move broadcast.
    const whitePlayerSocket = gameData1.color === 'w' ? ws1 : ws2
    const blackPlayerSocket = gameData1.color === 'w' ? ws2 : ws1

    const whiteMovePromise = waitForMessage(whitePlayerSocket, 'move_made')
    const blackMovePromise = waitForMessage(blackPlayerSocket, 'move_made')

    // Step 6: The white player makes the first move.
    whitePlayerSocket.send(
      JSON.stringify({ type: 'move', gameId, move: { from: 'e2', to: 'e4' } })
    )

    // Step 7: Wait for the move to be processed and broadcasted to both players.
    const [moveResult1, moveResult2] = await Promise.all([
      whiteMovePromise,
      blackMovePromise,
    ])

    // Step 8: Assert that the game state was updated correctly.
    expect(moveResult1.fen).toEqual(moveResult2.fen) // Both players see the same board.
    expect(moveResult1.turn).toBe('b') // It is now black's turn.

    // Step 9: Cleanly close the WebSocket connections.
    ws1.close()
    ws2.close()
  })
})
