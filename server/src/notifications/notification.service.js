import { notificationBus } from './notification-bus.js'
const preferenceKeyByType = new Map([
  ['APPLICATION_STATUS', 'applicationStatus'],
  ['WAITLIST_PROMOTED', 'waitlist'],
  ['WAITLIST_UPDATE', 'waitlist'],
  ['EVENT_REMINDER', 'eventReminder'],
  ['SURVEY_DEADLINE', 'surveyDeadline'],
  ['ANNOUNCEMENT', 'announcements'],
  ['CONTENT_APPROVAL', 'system'],
  ['EVENT_ATTENDANCE', 'system'],
  ['CONSENT_REVOKED', 'system'],
  ['SYSTEM', 'system'],
])

function asPreferences(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function notificationPreferenceAllows(value, type) {
  const preferences = asPreferences(value)
  if (preferences.inApp === false) return false
  const key = preferenceKeyByType.get(type) ?? (['EVENT', 'INTERNSHIP', 'JOB', 'RESEARCH', 'SURVEY'].includes(type) ? 'opportunities' : 'system')
  return preferences[key] !== false
}

/** @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} client */
export async function createNotification(client, data) {
  const settings = await client.userSettings.findUnique({ where: { userId: data.userId }, select: { notifications: true } })
  if (!notificationPreferenceAllows(settings?.notifications, data.type)) return null
  const notification = await client.notification.create({ data })
  notificationBus.publish(data.userId, { refresh: true, notificationId: notification.id })
  return notification
}

/** @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} client */
export async function createNotifications(client, items) {
  if (!items.length) return { count: 0 }
  const userIds = [...new Set(items.map(item => item.userId))]
  const settings = await client.userSettings.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, notifications: true },
  })
  const preferences = new Map(settings.map(item => [item.userId, item.notifications]))
  const allowed = items.filter(item => notificationPreferenceAllows(preferences.get(item.userId), item.type))
  if (!allowed.length) return { count: 0 }
  const result = await client.notification.createMany({ data: allowed })
  for (const userId of new Set(allowed.map(item => item.userId))) notificationBus.publish(userId)
  return result
}
