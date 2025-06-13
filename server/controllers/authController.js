import { prisma } from '../dependencies.js'
import { hashPassword, comparePassword } from '../utils/password.js'
import { generateToken } from '../utils/jwt.js'
import { generateUsername } from 'friendly-username-generator'
import { v4 as uuidv4 } from 'uuid'

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

    // Create JWT payload
    const payload = {
      id: user.id,
      username: user.username,
    }

    // Generate JWT token
    const token = generateToken(payload)

    // Set token in response header
    res.setHeader('Authorization', `Bearer ${token}`)

    res.status(200).json({ message: 'Login successful', userId: user.id })
  } catch (error) {
    console.error('Error logging in user:', error)
    res.status(500).json({ error: 'Internal server error.' })
  }
}

// Login as guest
export const loginAsGuest = async (req, res) => {
  const guestUsername = generateUsername()

  const guestId = uuidv4()
  const payload = {
    guestId,
    username: guestUsername,
    isGuest: true,
  }
  const token = generateToken(payload)
  res.setHeader('Authorization', `Bearer ${token}`)
  res.status(200).json({
    message: 'Guest login successful',
    guestId,
    username: guestUsername,
  })
}
