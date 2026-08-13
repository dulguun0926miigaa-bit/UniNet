import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const accountEmail = String(process.argv[2] || '').trim().toLowerCase()
const googleEmail = String(process.argv[3] || '').trim().toLowerCase()

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) throw new Error('A valid Staff account email is required')
if (!/^[^\s@]+@gmail\.com$/.test(googleEmail)) throw new Error('A valid Gmail address is required')

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

try {
  const staff = await prisma.user.findUnique({ where: { normalizedEmail: accountEmail } })
  if (!staff) throw new Error(`Staff account not found: ${accountEmail}`)
  if (staff.role !== 'STAFF') throw new Error(`Target account is not Staff: ${accountEmail}`)

  const duplicate = await prisma.user.findFirst({
    where: { gmail: { equals: googleEmail, mode: 'insensitive' }, id: { not: staff.id } },
    select: { normalizedEmail: true },
  })
  if (duplicate) throw new Error(`Gmail is already prelinked to another account: ${duplicate.normalizedEmail}`)

  await prisma.user.update({
    where: { id: staff.id },
    data: { gmail: googleEmail },
  })
  console.log(`Prelinked ${googleEmail} to ${accountEmail}. The verified Google subject will be bound on first OAuth login.`)
} finally {
  await prisma.$disconnect()
}
