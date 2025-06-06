import express from 'express'
import authRoutes from './routes/authRoutes.js'

// Set up app and port
const app = express()
const PORT = 8080

// Base URL for API
const API_BASE_URL = '/api'

// Middleware to parse JSON bodies
app.use(express.json())

// Use auth routes
app.use(`${API_BASE_URL}/auth`, authRoutes)

app.get('/', (req, res) => {
  res.send('API Server is running with Prisma!')
})

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`)
})
