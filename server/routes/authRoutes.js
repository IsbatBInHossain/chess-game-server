import { registerUser, loginUser } from '../controllers/authController.js'
import { Router } from 'express'

const router = Router()

// Register route
router.post('/register', registerUser)

// Login route
router.post('/login', loginUser)

export default router
