import http from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import authRoutes from './routes/authRoutes.js'
import { connectDependencies } from './dependencies.js'
import { initializeWebSocket } from './socket/handler.js'

// --- INITIAL SETUP ---
const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 8080
const API_BASE_URL = '/api'

// --- MIDDLEWARE ---
app.use(cors())
app.use(helmet())
app.use(express.json())

// --- ROUTES ---
app.use(`${API_BASE_URL}/auth`, authRoutes)
app.get('/', (req, res) => res.send('API Server is running!'))

// --- INITIALIZE WEBSOCKETS ---
initializeWebSocket(server)

// --- SERVER STARTUP ---
async function startServer() {
  try {
    await connectDependencies()

    server.listen(PORT, () => {
      console.log(`API Server is running on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer()
}

export { server, startServer }
