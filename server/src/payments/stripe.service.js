import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'

const stripeApiBase = 'https://api.stripe.com/v1'
const webhookToleranceSeconds = 300

function requireStripe() {
  if (!env.STRIPE_ENABLED || !env.STRIPE_SECRET_KEY) {
    throw new AppError('Stripe TEST/SANDBOX payment тохируулагдаагүй байна.', 503, 'STRIPE_DISABLED')
  }
}

function append(params, key, value) {
  if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
}

export async function createEventCheckoutSession({ payment, event, user }) {
  requireStripe()
  if (!Number.isInteger(event.priceAmount) || event.priceAmount <= 0) {
    throw new AppError('Paid event-ийн үнэ буруу байна.', 422, 'EVENT_PRICE_INVALID')
  }
  const currency = String(event.currency || 'MNT').toLowerCase()
  const unitAmount = event.priceAmount * 100
  const params = new URLSearchParams()
  append(params, 'mode', 'payment')
  append(params, 'expires_at', Math.floor(Date.now() / 1000) + 30 * 60)
  append(params, 'client_reference_id', payment.id)
  append(params, 'customer_email', user.gmail || user.email)
  append(params, 'success_url', `${env.APP_URL}/student/payment/success?eventId=${encodeURIComponent(event.id)}&session_id={CHECKOUT_SESSION_ID}`)
  append(params, 'cancel_url', `${env.APP_URL}/student/content/${encodeURIComponent(event.id)}?payment=cancelled`)
  append(params, 'line_items[0][price_data][currency]', currency)
  append(params, 'line_items[0][price_data][product_data][name]', event.title)
  append(params, 'line_items[0][price_data][product_data][description]', `UniNet event ticket · ${event.university?.shortName || event.university?.name || 'UniNet'}`)
  append(params, 'line_items[0][price_data][unit_amount]', unitAmount)
  append(params, 'line_items[0][quantity]', 1)
  for (const [key, value] of Object.entries({ paymentId: payment.id, eventId: event.id, userId: user.id, registrationId: payment.registrationId })) {
    append(params, `metadata[${key}]`, value)
    append(params, `payment_intent_data[metadata][${key}]`, value)
  }

  const response = await fetch(`${stripeApiBase}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `uninet-payment-${payment.id}`,
    },
    body: params,
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.id || !payload?.url) {
    const reason = payload?.error?.message || `Stripe HTTP ${response.status}`
    throw new AppError(`Stripe Checkout үүсгэж чадсангүй: ${reason}`, 502, 'STRIPE_CHECKOUT_CREATE_FAILED')
  }
  return payload
}


export async function retrieveCheckoutSession(sessionId) {
  requireStripe()
  const response = await fetch(`${stripeApiBase}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.id) {
    const reason = payload?.error?.message || `Stripe HTTP ${response.status}`
    throw new AppError(`Stripe Checkout session татаж чадсангүй: ${reason}`, 502, 'STRIPE_CHECKOUT_RETRIEVE_FAILED')
  }
  return payload
}

function parseSignatureHeader(header) {
  const parts = String(header || '').split(',').map(value => value.trim()).filter(Boolean)
  const timestamps = []
  const signatures = []
  for (const part of parts) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const key = part.slice(0, index)
    const value = part.slice(index + 1)
    if (key === 't') timestamps.push(value)
    if (key === 'v1') signatures.push(value)
  }
  return { timestamp: timestamps[0], signatures }
}

function safeHexEqual(expectedHex, actualHex) {
  try {
    const expected = Buffer.from(expectedHex, 'hex')
    const actual = Buffer.from(actualHex, 'hex')
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch { return false }
}

export function verifyStripeWebhook(rawBody, signatureHeader) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new AppError('Stripe webhook secret тохируулагдаагүй байна.', 503, 'STRIPE_WEBHOOK_NOT_CONFIGURED')
  if (!Buffer.isBuffer(rawBody)) throw new AppError('Stripe webhook raw body олдсонгүй.', 400, 'STRIPE_WEBHOOK_RAW_BODY_MISSING')
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader)
  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber) || !signatures.length) throw new AppError('Stripe webhook signature буруу байна.', 400, 'STRIPE_WEBHOOK_SIGNATURE_INVALID')
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > webhookToleranceSeconds) {
    throw new AppError('Stripe webhook signature хугацаа хэтэрсэн байна.', 400, 'STRIPE_WEBHOOK_SIGNATURE_EXPIRED')
  }
  const expected = crypto.createHmac('sha256', env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex')
  if (!signatures.some(signature => safeHexEqual(expected, signature))) {
    throw new AppError('Stripe webhook signature баталгаажаагүй байна.', 400, 'STRIPE_WEBHOOK_SIGNATURE_INVALID')
  }
  try { return JSON.parse(rawBody.toString('utf8')) } catch {
    throw new AppError('Stripe webhook JSON буруу байна.', 400, 'STRIPE_WEBHOOK_JSON_INVALID')
  }
}
