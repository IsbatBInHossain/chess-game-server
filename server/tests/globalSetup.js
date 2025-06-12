const { PrismaClient } = require('@prisma/client')
const { createClient } = require('redis')
const { execSync } = require('child_process')

module.exports = async () => {
  console.log('[GlobalSetup] Running Prisma generate and migrate...')
  execSync('npx prisma generate')
  execSync('npx prisma migrate deploy')

  console.log('[GlobalSetup] Cleaning databases...')
  const prisma = new PrismaClient()
  const redisClient = createClient({ url: process.env.REDIS_URL })

  await redisClient.connect()
  await redisClient.flushAll() // Clean Redis
  await prisma.game.deleteMany({}) // Clean Postgres
  await prisma.user.deleteMany({})

  await redisClient.quit()
  await prisma.$disconnect()
  console.log('[GlobalSetup] Teardown complete.')
}
