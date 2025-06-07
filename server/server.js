import express from 'express'
import http from 'http'
import authRoutes from './routes/authRoutes.js'
import cors from 'cors'
import helmet from 'helmet'
import { WebSocketServer } from 'ws'
import redisClient from './redis.js'

// Set up app and server
const app = express()
const PORT = process.env.PORT || 8080
const server = http.createServer(app)

// Base URL for API
const API_BASE_URL = '/api'

// Middlewares and app set up
app.use(express.json())
app.use(cors())
app.use(helmet())

// Use auth routes
app.use(`${API_BASE_URL}/auth`, authRoutes)

app.get('/', (req, res) => {
  res.send('API Server is running with Prisma!')
})

// Set up WebSocket server
const wss = new WebSocketServer({ server })

// Handle WebSocket connections
wss.on('connection', ws => {
  console.log('New WebSocket connection established')

  // Handle incoming messages
  ws.on('message', message => {
    console.log(`Received message: ${message}`)
    ws.send(`Server received: ${message}`)
  })

  // Handle errors
  ws.on('error', error => {
    console.error(`WebSocket error: ${error}`)
  })

  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed')
  })
})

// Start the server and connect to Redis
async function startServer() {
  try {
    await redisClient.connect()
    console.log('Successfully connected to Redis.')

    server.listen(PORT, () => {
      console.log(`API Server is running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
