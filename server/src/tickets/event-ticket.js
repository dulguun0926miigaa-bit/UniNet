import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'

const ticketPayloadSchema = z.object({
  v: z.literal(1),
  kind: z.literal('EVENT_TICKET'),
  jti: z.string().regex(/^[a-f0-9]{32}$/),
  registrationId: z.string().uuid(),
  contentId: z.string().uuid(),
  userId: z.string().uuid(),
  registrationCode: z.string().min(16).max(100),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
}).strict()

function signatureFor(encodedPayload) {
  return createHmac('sha256', env.ticketSigningSecret).update(encodedPayload).digest()
}

/**
 * Creates an opaque, tamper-evident event ticket. The QR only contains this token;
 * all authoritative registration data is looked up again when it is scanned.
 */
export function createEventTicket({ registrationId, contentId, userId, registrationCode, expiresAt }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = ticketPayloadSchema.parse({
    v: 1,
    kind: 'EVENT_TICKET',
    jti: randomBytes(16).toString('hex'),
    registrationId,
    contentId,
    userId,
    registrationCode,
    iat: now,
    exp: Math.floor(expiresAt.getTime() / 1000),
  })
  if (payload.exp <= now) throw new AppError('Тасалбарын хугацаа дууссан байна.', 410, 'EVENT_TICKET_EXPIRED')
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${signatureFor(encodedPayload).toString('base64url')}`
}

export function verifyEventTicket(token) {
  if (typeof token !== 'string' || token.length > 4096) {
    throw new AppError('QR тасалбарын формат буруу байна.', 422, 'EVENT_TICKET_INVALID')
  }
  const segments = token.split('.')
  if (segments.length !== 2 || !segments.every(segment => /^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new AppError('QR тасалбарын формат буруу байна.', 422, 'EVENT_TICKET_INVALID')
  }
  const [encodedPayload, encodedSignature] = segments
  let suppliedSignature
  try {
    suppliedSignature = Buffer.from(encodedSignature, 'base64url')
  } catch {
    throw new AppError('QR тасалбарын формат буруу байна.', 422, 'EVENT_TICKET_INVALID')
  }
  const expectedSignature = signatureFor(encodedPayload)
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new AppError('QR тасалбарын гарын үсэг хүчингүй байна.', 422, 'EVENT_TICKET_SIGNATURE_INVALID')
  }
  let payload
  try {
    payload = ticketPayloadSchema.parse(JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')))
  } catch {
    throw new AppError('QR тасалбарын өгөгдөл буруу байна.', 422, 'EVENT_TICKET_INVALID')
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new AppError('QR тасалбарын хугацаа дууссан байна.', 410, 'EVENT_TICKET_EXPIRED')
  }
  return payload
}

export { ticketPayloadSchema }
