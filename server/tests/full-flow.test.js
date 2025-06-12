import request from 'supertest'
import WebSocket from 'ws'
import { server } from '../server.js' // Import the raw server
import prisma from '../db.js'
import redisClient from '../redis.js'

// --- NEW ROBUST HELPER FUNCTION ---
const waitForMessage = (ws, expectedType) => {
  return new Promise((resolve, reject) => {
    // Set a timeout to prevent the test from hanging indefinitely
    const timeout = setTimeout(() => {
      reject(
        new Error(`Test timed out waiting for message type: ${expectedType}`)
      )
    }, 10000) // 10 second timeout

    const listener = message => {
      try {
        const data = JSON.parse(message)
        console.log(`TEST CLIENT RECEIVED:`, data) // Log every message for debugging

        // If we receive the message we're waiting for, resolve the promise
        if (data.type === expectedType) {
          clearTimeout(timeout) // Clear the timeout
          ws.removeListener('message', listener) // Clean up the listener
          resolve(data)
        }
        // If the server sends an error, fail the test immediately
        else if (data.type === 'error') {
          clearTimeout(timeout)
          ws.removeListener('message', listener)
          reject(new Error(`Server sent an error: ${data.message}`))
        }
      } catch (e) {
        // If JSON.parse fails, fail the test
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

  beforeAll(async () => {
    serverInstance = server.listen(0) // Listen on a random port
    const { port } = serverInstance.address()
    process.env.TEST_PORT = port // Store port for use in tests if needed

    if (!redisClient.isOpen) await redisClient.connect()

    await prisma.game.deleteMany({})
    await prisma.user.deleteMany({})

    await request(serverInstance)
      .post('/api/auth/register')
      .send({ username: 'testuser1', password: 'password' })
    await request(serverInstance)
      .post('/api/auth/register')
      .send({ username: 'testuser2', password: 'password' })

    const res1 = await request(serverInstance)
      .post('/api/auth/login')
      .send({ username: 'testuser1', password: 'password' })
    const res2 = await request(serverInstance)
      .post('/api/auth/login')
      .send({ username: 'testuser2', password: 'password' })

    player1.token = res1.headers.authorization?.split(' ')[1]
    player2.token = res2.headers.authorization?.split(' ')[1]

    if (!player1.token || !player2.token)
      throw new Error('Failed to get tokens')
  })

  afterAll(async () => {
    if (redisClient.isOpen) await redisClient.quit()
    await prisma.$disconnect()
    serverInstance.close()
  })

  const createAuthenticatedClient = token => {
    const { port } = serverInstance.address()
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`)
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })))
      ws.on('error', reject)
      // Use our new helper to wait for auth_success
      waitForMessage(ws, 'auth_success')
        .then(() => resolve(ws))
        .catch(reject)
    })
  }

  test('Two players should connect, find a match, and make a move', async () => {
    const ws1 = await createAuthenticatedClient(player1.token)
    const ws2 = await createAuthenticatedClient(player2.token)

    const p1GameStartPromise = waitForMessage(ws1, 'game_start')
    const p2GameStartPromise = waitForMessage(ws2, 'game_start')

    ws1.send(JSON.stringify({ type: 'find_match' }))
    ws2.send(JSON.stringify({ type: 'find_match' }))

    const [gameData1, gameData2] = await Promise.all([
      p1GameStartPromise,
      p2GameStartPromise,
    ])

    expect(gameData1.gameId).toBeDefined()
    expect(gameData1.gameId).toEqual(gameData2.gameId)
    const gameId = gameData1.gameId

    const whitePlayerSocket = gameData1.color === 'w' ? ws1 : ws2
    const blackPlayerSocket = gameData1.color === 'w' ? ws2 : ws1

    const whiteMovePromise = waitForMessage(whitePlayerSocket, 'move_made')
    const blackMovePromise = waitForMessage(blackPlayerSocket, 'move_made')

    whitePlayerSocket.send(
      JSON.stringify({ type: 'move', gameId, move: { from: 'e2', to: 'e4' } })
    )

    const [moveResult1, moveResult2] = await Promise.all([
      whiteMovePromise,
      blackMovePromise,
    ])

    expect(moveResult1.fen).toEqual(moveResult2.fen)
    expect(moveResult1.turn).toBe('b')

    ws1.close()
    ws2.close()
  })
})
