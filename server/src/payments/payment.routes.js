import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { createNotification } from '../notifications/notification.service.js'
import { verifyStripeWebhook } from './stripe.service.js'
import { createEventTicket, hashEventTicket } from '../tickets/event-ticket.js'

const router = Router()

async function auditPayment(tx, payment, action, nextData = {}) {
  await tx.auditLog.create({
    data: {
      actorId: payment.userId,
      universityId: payment.content?.universityId ?? null,
      action,
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      resourceName: payment.content?.title || 'Stripe event payment',
      severity: 'INFO',
      nextData,
    },
  })
}

async function completeCheckout(session) {
  const providerSessionId = session.id
  const paymentId = session.metadata?.paymentId || session.client_reference_id
  if (!providerSessionId || !paymentId || session.payment_status !== 'paid') return
  await prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { content: true, registration: true },
    })
    if (!payment || payment.providerSessionId !== providerSessionId || payment.status === 'REFUNDED') return
    if (payment.status === 'PAID') return
    const expectedMinorAmount = payment.amount * 100
    const sessionCurrency = String(session.currency || '').toUpperCase()
    if (Number(session.amount_total) !== expectedMinorAmount || sessionCurrency !== payment.currency.toUpperCase()) return
    const providerPaymentId = typeof session.payment_intent === 'string' ? session.payment_intent : null
    const paidAt = new Date()
    const ticketTokenHash = hashEventTicket(createEventTicket({ registrationId: payment.registrationId }))
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', providerPaymentId, paidAt },
    })
    await tx.eventRegistration.updateMany({
      where: { id: payment.registrationId, status: 'PAYMENT_PENDING' },
      data: { status: 'CONFIRMED', cancelledAt: null, ticketTokenHash, ticketIssuedAt: paidAt },
    })
    await createNotification(tx, {
      userId: payment.userId,
      universityId: payment.content.universityId,
      contentId: payment.contentId,
      type: 'SYSTEM',
      title: 'Төлбөр амжилттай баталгаажлаа',
      description: `${payment.content.title} арга хэмжээний QR тасалбар бэлэн боллоо.`,
      actionUrl: '/student/registrations',
    })
    await auditPayment(tx, payment, 'STRIPE_PAYMENT_PAID', { providerSessionId, providerPaymentId, amount: payment.amount, currency: payment.currency })
  })
}

async function closePendingPayment({ paymentId, providerSessionId, status, action }) {
  if (!paymentId && !providerSessionId) return
  await prisma.$transaction(async tx => {
    const payment = paymentId
      ? await tx.payment.findUnique({ where: { id: paymentId }, include: { content: true } })
      : await tx.payment.findUnique({ where: { providerSessionId }, include: { content: true } })
    if (!payment || payment.status !== 'PENDING') return
    await tx.payment.update({ where: { id: payment.id }, data: { status } })
    await tx.eventRegistration.updateMany({ where: { id: payment.registrationId, status: 'PAYMENT_PENDING' }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    await auditPayment(tx, payment, action, { providerSessionId: providerSessionId || payment.providerSessionId })
  })
}

async function refundPayment(charge) {
  const providerPaymentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
  if (!providerPaymentId || !charge.refunded) return
  await prisma.$transaction(async tx => {
    const payment = await tx.payment.findUnique({ where: { providerPaymentId }, include: { content: true } })
    if (!payment || payment.status === 'REFUNDED') return
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } })
    await tx.eventRegistration.updateMany({
      where: { id: payment.registrationId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), ticketTokenHash: null, ticketIssuedAt: null },
    })
    await createNotification(tx, {
      userId: payment.userId,
      universityId: payment.content.universityId,
      contentId: payment.contentId,
      type: 'SYSTEM',
      title: 'Тасалбарын төлбөр буцаагдлаа',
      description: `${payment.content.title} арга хэмжээний QR тасалбар хүчингүй боллоо.`,
      actionUrl: '/student/registrations',
    })
    await auditPayment(tx, payment, 'STRIPE_PAYMENT_REFUNDED', { providerPaymentId })
  })
}

router.post('/stripe/webhook', async (req, res, next) => {
  try {
    const rawBody = /** @type {import('express').Request & { rawBody?: Buffer }} */ (req).rawBody
    const event = verifyStripeWebhook(rawBody, req.get('stripe-signature'))
    if (event.type === 'checkout.session.completed') await completeCheckout(event.data?.object || {})
    if (event.type === 'checkout.session.expired') {
      const session = event.data?.object || {}
      await closePendingPayment({ paymentId: session.metadata?.paymentId, providerSessionId: session.id, status: 'CANCELED', action: 'STRIPE_CHECKOUT_EXPIRED' })
    }
    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data?.object || {}
      await closePendingPayment({ paymentId: intent.metadata?.paymentId, providerSessionId: null, status: 'FAILED', action: 'STRIPE_PAYMENT_FAILED' })
    }
    if (event.type === 'charge.refunded') await refundPayment(event.data?.object || {})
    res.json({ received: true })
  } catch (error) { next(error) }
})

export { router as paymentRouter }
