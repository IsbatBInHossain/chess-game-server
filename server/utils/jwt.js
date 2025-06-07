import jsonwebtoken from 'jsonwebtoken'
import { JWT_EXPIRATION } from '../constants/index.js'

const { sign, verify } = jsonwebtoken
// Constants
const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables')
}

// Generate JWT token
export const generateToken = payload => {
  return sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION })
}

// Verify JWT token
export const verifyToken = token => {
  try {
    return verify(token, JWT_SECRET)
  } catch (error) {
    console.error('Error verifying token:', error)
    throw new Error('Invalid token')
  }
}
