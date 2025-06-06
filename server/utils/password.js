import bcrypt from 'bcryptjs'

// Hash password using bcrypt
export const hashPassword = async password => {
  try {
    const salt = await bcrypt.genSalt(10)
    return await bcrypt.hash(password, salt)
  } catch (error) {
    console.error('Error hashing password:', error)
    throw new Error('Failed to hash password')
  }
}

// Compare password with hashed password
export const comparePassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword)
  } catch (error) {
    console.error('Error comparing password:', error)
    throw new Error('Failed to compare password')
  }
}
