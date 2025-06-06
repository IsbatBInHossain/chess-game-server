import prisma from '../db.js'
import { hashPassword, comparePassword } from '../utils/password.js'

// Register user contoller
export const registerUser = async (req, res) => {
  const { username, password } = req.body

  try {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    })

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists.' })
    }
    const hashedPassword = await hashPassword(password)

    const newUser = await prisma.user.create({
      data: {
        username,
        hashedPassword,
      },
    })

    const { hashedPassword: _, ...userData } = newUser
    res.status(201).json(userData)
  } catch (error) {
    console.error('Error registering user:', error)
    res.status(500).json({ error: 'Internal server error.' })
  }
}

// Login user controller
export const loginUser = async (req, res) => {
  const { username, password } = req.body

  try {
    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const isPasswordValid = await comparePassword(password, user.hashedPassword)

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password.' })
    }

    // Here you would typically generate a JWT token and send it back
    res.status(200).json({ message: 'Login successful', userId: user.id })
  } catch (error) {
    console.error('Error logging in user:', error)
    res.status(500).json({ error: 'Internal server error.' })
  }
}
