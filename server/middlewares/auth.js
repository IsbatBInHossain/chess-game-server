import { verifyToken } from '../utils/jwt.js'

// Middleware to authenticate user
export const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' })
  }

  try {
    const decoded = verifyToken(token)
    req.user = decoded // Attach user info to request object
    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(401).json({ error: 'Invalid token.' })
  }
}
