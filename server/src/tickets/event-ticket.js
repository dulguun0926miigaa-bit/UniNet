import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'

const EVENT_TICKET_PREFIX = 'uninet_evt_v1'
const registrationIdSchema = z.string().uuid()
const eventTicketTokenPattern = /^uninet_evt_v1\.[A-Za-z0-9_-]{43}$/

function assertEventTicketFormat(token) {
  if (typeof token !== 'string' || !eventTicketTokenPattern.test(token)) {
    throw new AppError('Энэ QR нь UniNet-ээс үүсгэсэн төлбөртэй тасалбар биш байна.', 422, 'EVENT_TICKET_INVALID')
  }
}

/**
 * Produces one stable, opaque token per registration. Repeated ticket reads return
 * the same QR while the database stores only its SHA-256 hash.
 */
export function createEventTicket({ registrationId }) {
  const normalizedRegistrationId = registrationIdSchema.parse(registrationId)
  const authenticator = createHmac('sha256', env.ticketSigningSecret)
    .update(`event-ticket:v1:${normalizedRegistrationId}`)
    .digest('base64url')
  return `${EVENT_TICKET_PREFIX}.${authenticator}`
}

/** Hash the exact scanned token before any database lookup. */
export function hashEventTicket(token) {
  assertEventTicketFormat(token)
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export { EVENT_TICKET_PREFIX, eventTicketTokenPattern }
