import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'

export const prisma = new PrismaClient()
export const redisClient = createClient({
  url: process.env.REDIS_URL,
})

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
