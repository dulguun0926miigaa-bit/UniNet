import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')
let assertions = 0
const has = (source, value, label) => { assert.ok(source.includes(value), label); assertions += 1 }
const lacks = (source, value, label) => { assert.ok(!source.includes(value), label); assertions += 1 }

const schema = read('server/prisma/schema.prisma')
has(schema, 'PAYMENT_PENDING', 'registration payment pending status exists')
has(schema, 'enum EventPricingType', 'event pricing enum exists')
has(schema, 'FREE\n  PAID'.replace('\\n','\n'), 'free and paid pricing values exist')
has(schema, 'model Payment {', 'payment model exists')
has(schema, 'provider          PaymentProvider', 'payment provider abstraction exists')
has(schema, 'PENDING\n  PAID\n  FAILED\n  CANCELED\n  REFUNDED'.replaceAll('\\n','\n'), 'payment lifecycle exists')
has(schema, 'model PasswordResetOtpChallenge {', 'password reset OTP challenge model exists')
has(schema, 'remembered       Boolean', 'remembered session flag exists')

const env = read('server/src/config/env.js')
has(env, 'PASSWORD_RESET_OTP_EXPIRES_IN', 'OTP expiry env exists')
has(env, 'REMEMBER_ME_DAYS', 'remember-me env exists')
has(env, 'STRIPE_SECRET_KEY', 'Stripe secret env exists')
has(env, 'STRIPE_WEBHOOK_SECRET', 'Stripe webhook env exists')

const authRoutes = read('server/src/auth/auth.routes.js')
has(authRoutes, "router.post('/password-reset/verify-otp'", 'OTP verify endpoint exists')
has(authRoutes, 'sessionCookieOptions', 'remember-me cookie policy exists')
has(authRoutes, 'REMEMBER_ME_DAYS', 'persistent cookie uses remember-me days')
has(authRoutes, "requireRole('UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN')", 'MFA management restricted to admin roles')
lacks(authRoutes, "'/password-reset/totp", 'legacy Student Authenticator reset routes removed')

const authService = read('server/src/auth/auth.service.js')
has(authService, "user.role !== 'STUDENT'", 'password reset is Student-specific')
has(authService, "account.provider === 'GOOGLE'", 'linked Google identity used for reset destination')
has(authService, 'sendPasswordResetOtp', 'Resend-capable OTP mailer is used')
has(authService, 'PASSWORD_RESET_OTP_MAX_ATTEMPTS', 'OTP attempt limit exists')
has(authService, "user.role === 'STUDENT' && input.rememberMe", 'remember me restricted to Student local login')

const mfa = read('server/src/auth/mfa.service.js')
has(mfa, "const adminRoles = new Set(['UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN'])", 'admin-only MFA role policy exists')
has(mfa, 'if (!adminRoles.has(user.role)) return null', 'Student/Staff do not receive login MFA')
lacks(mfa, 'PASSWORD_RESET_TOTP', 'Student TOTP password reset implementation removed')

const landing = read('src/Uninetlanding.jsx')
has(landing, 'Намайг сана', 'remember me checkbox exists')
has(landing, 'forgot-otp', 'forgot password OTP UI exists')
has(landing, 'Resend-ээр илгээсэн 6 оронтой OTP', 'forgot password UI explains Resend OTP')
lacks(landing, 'forgot-authenticator', 'forgot-password Authenticator UI removed')

const stripe = read('server/src/payments/stripe.service.js')
has(stripe, "line_items[0][price_data][unit_amount]", 'Stripe inline price_data is used')
has(stripe, 'event.priceAmount * 100', 'Stripe amount comes from DB event price in minor units')
lacks(stripe, 'product_id', 'Stripe Product ID is not required')
lacks(stripe, 'price_id', 'Stripe Price ID is not required')
has(stripe, "createHmac('sha256'", 'webhook HMAC verification exists')
has(stripe, 'timingSafeEqual', 'webhook signature comparison is timing-safe')

const payments = read('server/src/payments/payment.routes.js')
has(payments, "event.type === 'checkout.session.completed'", 'checkout completion webhook handled')
has(payments, "status: 'PAID'", 'webhook marks payment paid')
has(payments, "status: 'CONFIRMED'", 'webhook confirms registration')
has(payments, "event.type === 'charge.refunded'", 'refund webhook handled')

const studentRoutes = read('server/src/student/student.routes.js')
has(studentRoutes, "router.post('/events/:id/checkout'", 'paid event checkout endpoint exists')
has(studentRoutes, "PAID_EVENT_CHECKOUT_REQUIRED", 'paid event cannot use free registration endpoint')
has(studentRoutes, "registration.content.pricingType === 'PAID' && registration.payment?.status !== 'PAID'", 'QR ticket blocked until paid')
has(studentRoutes, "router.get('/events/:id/payment'", 'payment status endpoint exists')

const operations = read('server/src/operations/operations.routes.js')
has(operations, "pricingType: z.enum(['FREE', 'PAID'])", 'Staff content input accepts FREE/PAID')
has(operations, "req.auth.user.role === 'STAFF' && input.type === 'EVENT'", 'Staff events forced through approval')
has(operations, "action === 'APPROVE' && content.type === 'EVENT' ? 'PUBLISHED'", 'Admin approval publishes Staff event')
has(operations, "registration.content.pricingType === 'PAID' && registration.payment?.status !== 'PAID'", 'attendance blocks unpaid paid ticket')

const opsUi = read('src/operations/OperationsExperience.jsx')
has(opsUi, 'FREE · Үнэгүй', 'Staff UI offers FREE event')
has(opsUi, 'PAID · Төлбөртэй', 'Staff UI offers PAID event')
has(opsUi, 'Тасалбарын үнэ', 'Staff UI accepts paid ticket price')

const studentUi = read('src/student/StudentExperience.jsx')
has(studentUi, 'Stripe TEST', 'Student paid-event checkout is labeled test')
has(studentUi, 'Энэхүү QR кодоо event дээр өөрийн биеэр очиж зохион байгуулагчид үзүүлж нэвтэрнэ үү. QR тасалбараа үзүүлэхгүй бол арга хэмжээнд нэвтрэх боломжгүй.', 'required QR instruction exists')
has(studentUi, 'PaymentSuccessPage', 'Stripe return/payment success view exists')

console.log(`Phase 5M smoke passed: ${assertions} assertions.`)
