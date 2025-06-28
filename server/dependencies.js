import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'

export const prisma = new PrismaClient()
// Redis options object
const redisOptions = {
  url: process.env.REDIS_URL,
}

// Add the TLS socket configuration in prod
if (process.env.NODE_ENV === 'production') {
  redisOptions.socket = {
    tls: true,
    rejectUnauthorized: false,
  }
}

export const redisClient = createClient(redisOptions)

let isRedisConnected = false

export async function connectDependencies() {
  if (!isRedisConnected) {
    await redisClient.connect()
    isRedisConnected = true
    console.log('Dependencies: Redis connected.')
  }
  // Prisma connects lazily, so no explicit connect() is needed here.
  console.log('Dependencies: Ready.')
}

export async function disconnectDependencies() {
  if (isRedisConnected) {
    await redisClient.quit()
    isRedisConnected = false
    console.log('Dependencies: Redis disconnected.')
  }
  await prisma.$disconnect()
  console.log('Dependencies: Prisma disconnected.')
}
