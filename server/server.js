import express from 'express'
import prisma from './db.js'

const app = express()
const PORT = 8080

app.get('/', (req, res) => {
  res.send('API Server is running with Prisma!')
})

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany()
    res.json(users)
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch users.' })
  }
})

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`)
})
