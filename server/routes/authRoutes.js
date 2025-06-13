import {
  registerUser,
  loginUser,
  loginAsGuest,
} from '../controllers/authController.js'
import { Router } from 'express'

const router = Router()

// Register route
router.post('/register', registerUser)

// Login route
router.post('/login', loginUser)

// Guest login route
router.post('/guest', loginAsGuest)

export default router
