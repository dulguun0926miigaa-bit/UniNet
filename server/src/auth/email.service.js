import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const smtpTransport = env.EMAIL_DELIVERY_MODE === 'smtp'
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
  : null

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function sendWithResend(message) {
  const response = await fetch(env.RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'UniNet/Phase5D',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(env.RESEND_REPLY_TO ? { reply_to: env.RESEND_REPLY_TO } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const reason = payload?.message || payload?.error?.message || `HTTP ${response.status}`
    throw new Error(`Resend email delivery failed: ${reason}`)
  }
  return { delivered: true, provider: 'resend', messageId: payload?.id ?? null }
}

export function createEmailService({ transport = smtpTransport, logger = console } = {}) {
  async function deliver(message) {
    if (env.EMAIL_DELIVERY_MODE === 'disabled') return { delivered: false, provider: 'disabled' }
    if (env.EMAIL_DELIVERY_MODE === 'console') {
      logger.info(`[email:${message.kind}] ${message.to} ${message.subject}`)
      logger.info(message.text)
      return { delivered: true, provider: 'console' }
    }
    if (env.EMAIL_DELIVERY_MODE === 'resend') return sendWithResend(message)
    const result = await transport.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(env.RESEND_REPLY_TO ? { replyTo: env.RESEND_REPLY_TO } : {}),
    })
    return { delivered: true, provider: 'smtp', messageId: result.messageId ?? null }
  }

  return {
    async sendEmailVerification({ to, code, expiresInMinutes }) {
      const safeExpiry = Number.isFinite(expiresInMinutes) ? expiresInMinutes : 10
      return deliver({
        kind: 'verification',
        to,
        subject: 'UniNet имэйл баталгаажуулах код',
        text: `Таны UniNet баталгаажуулах код: ${code}. Код ${safeExpiry} минут хүчинтэй.`,
        html: `<p>Таны UniNet баталгаажуулах код:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${htmlEscape(code)}</p><p>Код ${safeExpiry} минут хүчинтэй.</p>`,
      })
    },
    async sendInvitation({ to, token }) {
      const invitationUrl = new URL('/accept-invitation', env.APP_URL)
      invitationUrl.searchParams.set('token', token)
      return deliver({
        kind: 'invitation',
        to,
        subject: 'UniNet invitation',
        text: `Accept your UniNet invitation: ${invitationUrl.toString()}`,
        html: `<p>Accept your UniNet invitation using <a href="${htmlEscape(invitationUrl.toString())}">this secure link</a>.</p>`,
      })
    },
    async sendEmailChangeVerification({ to, token }) {
      const verifyUrl = new URL('/', env.APP_URL)
      verifyUrl.searchParams.set('emailChangeToken', token)
      return deliver({
        kind: 'email-change-verification',
        to,
        subject: 'UniNet шинэ имэйл баталгаажуулах',
        text: `Шинэ имэйлээ баталгаажуулахын тулд холбоосыг нээнэ үү: ${verifyUrl.toString()}`,
        html: `<p>UniNet шинэ имэйлээ баталгаажуулахын тулд <a href="${htmlEscape(verifyUrl.toString())}">энэ холбоосыг</a> нээнэ үү.</p>`,
      })
    },
    async sendPasswordResetOtp({ to, code, expiresInMinutes }) {
      const safeExpiry = Number.isFinite(expiresInMinutes) ? expiresInMinutes : 10
      return deliver({
        kind: 'password-reset-otp',
        to,
        subject: 'UniNet нууц үг сэргээх OTP код',
        text: `Таны UniNet нууц үг сэргээх код: ${code}. Код ${safeExpiry} минут хүчинтэй.`,
        html: `<p>Таны UniNet нууц үг сэргээх OTP код:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${htmlEscape(code)}</p><p>Код ${safeExpiry} минут хүчинтэй. Хэрэв та хүсэлт гаргаагүй бол энэ имэйлийг үл тооно уу.</p>`,
      })
    },
    async sendPasswordReset({ to, token }) {
      const resetUrl = new URL('/reset-password', env.APP_URL)
      resetUrl.searchParams.set('token', token)
      return deliver({
        kind: 'password-reset',
        to,
        subject: 'UniNet нууц үг сэргээх',
        text: `Нууц үгээ сэргээхийн тулд дараах холбоосыг нээнэ үү: ${resetUrl.toString()}`,
        html: `<p>Нууц үгээ сэргээхийн тулд <a href="${htmlEscape(resetUrl.toString())}">энэ холбоосыг</a> нээнэ үү.</p>`,
      })
    },

    async sendApplicationStatus({ to, studentName, opportunityTitle, status, reason }) {
      const safeName = studentName || 'Оюутан'
      const detail = reason ? ` Шалтгаан: ${reason}` : ''
      return deliver({
        kind: 'application-status',
        to,
        subject: `UniNet өргөдлийн төлөв: ${status}`,
        text: `${safeName}, таны “${opportunityTitle}” өргөдлийн төлөв ${status} боллоо.${detail}`,
        html: `<p>Сайн байна уу, <strong>${htmlEscape(safeName)}</strong>.</p><p>Таны <strong>${htmlEscape(opportunityTitle)}</strong> өргөдлийн төлөв <strong>${htmlEscape(status)}</strong> боллоо.</p>${reason ? `<p>Шалтгаан: ${htmlEscape(reason)}</p>` : ''}`,
      })
    },
    async sendEventAttendance({ to, studentName, eventTitle, attendedAt }) {
      const time = attendedAt instanceof Date ? attendedAt.toISOString() : String(attendedAt)
      return deliver({
        kind: 'event-attendance',
        to,
        subject: 'UniNet арга хэмжээний ирц баталгаажлаа',
        text: `${studentName || 'Оюутан'}, таны “${eventTitle}” арга хэмжээний ирц ${time}-д бүртгэгдлээ.`,
        html: `<p>Сайн байна уу, <strong>${htmlEscape(studentName || 'Оюутан')}</strong>.</p><p>Таны <strong>${htmlEscape(eventTitle)}</strong> арга хэмжээний ирц бүртгэгдлээ.</p><p>${htmlEscape(time)}</p>`,
      })
    },
    async sendWaitlistPromotion({ to, studentName, eventTitle }) {
      return deliver({
        kind: 'waitlist-promotion',
        to,
        subject: 'UniNet хүлээлгийн жагсаалтаас баталгаажлаа',
        text: `${studentName || 'Оюутан'}, “${eventTitle}” арга хэмжээний суудал баталгаажлаа.`,
        html: `<p>Сайн байна уу, <strong>${htmlEscape(studentName || 'Оюутан')}</strong>.</p><p><strong>${htmlEscape(eventTitle)}</strong> арга хэмжээний суудал баталгаажлаа.</p>`,
      })
    },
  }
}

export const emailService = createEmailService()
