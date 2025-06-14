import request from 'supertest'
import WebSocket from 'ws'

const BASE_URL = 'http://localhost:8080'
const WS_URL = 'ws://localhost:8080'

// The waitForMessage helper is perfect. Keep it as is.
const waitForMessage = (ws, expectedType) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', listener)
      reject(
        new Error(`Test timed out waiting for message type: ${expectedType}`)
      )
    }, 15000)
    const listener = message => {
      try {
        const data = JSON.parse(message)
        console.log(`TEST CLIENT RECEIVED:`, data)
        if (data.type === expectedType) {
          clearTimeout(timeout)
          ws.removeListener('message', listener)
          resolve(data)
        } else if (data.type === 'error') {
          clearTimeout(timeout)
          ws.removeListener('message', listener)
          reject(
            new Error(
              `Server sent an error: ${data.message || 'Unknown error'}`
            )
          )
        }
      } catch (e) {
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

  // Setup runs once to create the users for all tests in this suite.
  beforeAll(async () => {
    await request(BASE_URL)
      .post('/api/auth/register')
      .send({ username: 'testuser1', password: 'password' })
    await request(BASE_URL)
      .post('/api/auth/register')
      .send({ username: 'testuser2', password: 'password' })

    const res1 = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ username: 'testuser1', password: 'password' })
    const res2 = await request(BASE_URL)
      .post('/api/auth/login')
      .send({ username: 'testuser2', password: 'password' })

    player1.token = res1.headers.authorization?.split(' ')[1]
    player2.token = res2.headers.authorization?.split(' ')[1]

    if (!player1.token || !player2.token)
      throw new Error('Failed to get tokens')
  })

  // Helper to create an authenticated client.
  const createAuthenticatedClient = token => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })))
      ws.on('error', reject)
      waitForMessage(ws, 'auth_success')
        .then(() => resolve(ws))
        .catch(reject)
    })
  }

  // Helper to setup a new game for a test case.
  const setupNewGame = async () => {
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
    const gameId = gameData1.gameId

    const whitePlayerSocket = gameData1.color === 'w' ? ws1 : ws2
    const blackPlayerSocket = gameData1.color === 'w' ? ws2 : ws1

    return { gameId, whitePlayerSocket, blackPlayerSocket, ws1, ws2 }
  }

  /**
   * TEST CASE 1: The "Happy Path" - a normal move is made.
   */
  test('Two players should connect, find a match, and make a move', async () => {
    const { gameId, whitePlayerSocket, blackPlayerSocket, ws1, ws2 } =
      await setupNewGame()

    const whiteMovePromise = waitForMessage(whitePlayerSocket, 'move_made')
    const blackMovePromise = waitForMessage(blackPlayerSocket, 'move_made')

    whitePlayerSocket.send(
      JSON.stringify({ type: 'move', gameId, move: { from: 'e2', to: 'e4' } })
    )

    const [moveResult1, moveResult2] = await Promise.all([
      whiteMovePromise,
      blackMovePromise,
    ])

    expect(moveResult1.turn).toBe('b')
    expect(moveResult1.fen).toEqual(moveResult2.fen)

    ws1.close()
    ws2.close()
  })

  /**
   * TEST CASE 2: Player Resignation.
   */
  test('A player should be able to resign, ending the game', async () => {
    const { gameId, whitePlayerSocket, blackPlayerSocket, ws1, ws2 } =
      await setupNewGame()

    // Setup listeners for the game_over event
    const whiteGameOverPromise = waitForMessage(whitePlayerSocket, 'game_over')
    const blackGameOverPromise = waitForMessage(blackPlayerSocket, 'game_over')

    // Black resigns
    blackPlayerSocket.send(JSON.stringify({ type: 'resign', gameId }))

    // Wait for both players to receive the game over message
    const [gameOverData1, gameOverData2] = await Promise.all([
      whiteGameOverPromise,
      blackGameOverPromise,
    ])

    // Assert that the game ended correctly
    expect(gameOverData1.reason).toBe('resign')
    expect(gameOverData1.winner).toBe('white')
    expect(gameOverData1.result).toBe('1-0')
    expect(gameOverData1).toEqual(gameOverData2)

    ws1.close()
    ws2.close()
  })

  /**
   * TEST CASE 3: Game Abort.
   */
  test('A player should be able to abort, ending the game', async () => {
    const { gameId, whitePlayerSocket, blackPlayerSocket, ws1, ws2 } =
      await setupNewGame()

    const whiteGameOverPromise = waitForMessage(whitePlayerSocket, 'game_over')
    const blackGameOverPromise = waitForMessage(blackPlayerSocket, 'game_over')

    // White aborts
    whitePlayerSocket.send(JSON.stringify({ type: 'abort', gameId }))

    const [gameOverData1, gameOverData2] = await Promise.all([
      whiteGameOverPromise,
      blackGameOverPromise,
    ])

    expect(gameOverData1.reason).toBe('abort')
    expect(gameOverData1.winner).toBe('none')
    expect(gameOverData1.result).toBe('*')
    expect(gameOverData1).toEqual(gameOverData2)

    ws1.close()
    ws2.close()
  })
})
