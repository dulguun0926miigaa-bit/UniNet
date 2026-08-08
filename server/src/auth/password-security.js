import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { verifyPassword } from '../utils/password.js'
import { assertNotCommonBreachedPassword } from './password-policy.js'

export { assertNotCommonBreachedPassword } from './password-policy.js'

export async function assertPasswordHistory(userId, password, currentHash = null) {
  assertNotCommonBreachedPassword(password)
  if (currentHash && await verifyPassword(currentHash, password).catch(() => false)) {
    throw new AppError('Шинэ нууц үг одоогийн нууц үгээс өөр байх ёстой.', 422, 'PASSWORD_REUSE_FORBIDDEN')
  }
  if (!userId || env.PASSWORD_HISTORY_COUNT <= 0) return
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: env.PASSWORD_HISTORY_COUNT,
  })
  for (const item of history) {
    if (await verifyPassword(item.passwordHash, password).catch(() => false)) {
      throw new AppError(`Сүүлийн ${env.PASSWORD_HISTORY_COUNT} нууц үгийн аль нэгийг дахин ашиглах боломжгүй.`, 422, 'PASSWORD_HISTORY_REUSE_FORBIDDEN')
    }
  }
}

export async function recordPasswordHistory(transaction, userId, previousHash) {
  if (!previousHash || env.PASSWORD_HISTORY_COUNT <= 0) return
  await transaction.passwordHistory.create({ data: { userId, passwordHash: previousHash } })
  const stale = await transaction.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: env.PASSWORD_HISTORY_COUNT,
    select: { id: true },
  })
  if (stale.length) await transaction.passwordHistory.deleteMany({ where: { id: { in: stale.map(item => item.id) } } })
}
