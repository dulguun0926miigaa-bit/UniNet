export const DEFAULT_EVENT_TICKET_DURATION_MS = 86_400_000

/** @returns {Date | null} */
export function eventTicketExpiresAt(content, missingDateFallback = null) {
  if (content?.endsAt) return new Date(content.endsAt)
  if (content?.startsAt) return new Date(new Date(content.startsAt).getTime() + DEFAULT_EVENT_TICKET_DURATION_MS)
  return missingDateFallback ? new Date(missingDateFallback) : null
}

/** @returns {import('@prisma/client').Prisma.ContentWhereInput} */
export function activeContentWhere(now = new Date()) {
  return /** @type {import('@prisma/client').Prisma.ContentWhereInput} */ ({
    OR: [
      { type: { not: 'EVENT' } },
      { type: 'EVENT', endsAt: { gt: now } },
      { type: 'EVENT', endsAt: null, startsAt: { gt: new Date(now.getTime() - DEFAULT_EVENT_TICKET_DURATION_MS) } },
      { type: 'EVENT', endsAt: null, startsAt: null },
    ],
  })
}
