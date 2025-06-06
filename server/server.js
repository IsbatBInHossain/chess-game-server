import express from 'express'
import authRoutes from './routes/authRoutes.js'
import cors from 'cors'
import helmet from 'helmet'

// Set up app and port
const app = express()
const PORT = 8080

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

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`)
})
