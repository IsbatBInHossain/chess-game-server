import express from 'express'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
const PORT = 8080

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(PORT, () => {
  console.log(`API Server is running on http://localhost:${PORT}`)
})
