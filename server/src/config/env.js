import 'dotenv/config'
import { z } from 'zod'
import crypto from 'node:crypto'

const placeholderSecret = /(replace|changeme|change-before|example|password|secret)/i
const emptyToUndefined = value => typeof value === 'string' && value.trim() === '' ? undefined : value
const optionalString = schema => z.preprocess(emptyToUndefined, schema.optional())

export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
  IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(4101),
  CORE_SERVICE_PORT: z.coerce.number().int().positive().default(4102),
  GATEWAY_BIND_HOST: z.string().trim().min(1).default('127.0.0.1'),
  SERVICE_BIND_HOST: z.string().trim().min(1).default('127.0.0.1'),
  IDENTITY_SERVICE_URL: z.string().url().default('http://127.0.0.1:4101'),
  CORE_SERVICE_URL: z.string().url().default('http://127.0.0.1:4102'),
  GATEWAY_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(120000).default(15000),
  GATEWAY_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(2).max(20).default(5),
  GATEWAY_CIRCUIT_RESET_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TICKET_SIGNING_SECRET: optionalString(z.string().min(32)),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(43200).default(720),
  SESSION_TOUCH_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  MFA_CHALLENGE_SECRET: optionalString(z.string().min(32)),
  MFA_ENCRYPTION_KEY: optionalString(z.string().regex(/^[a-fA-F0-9]{64}$/, 'MFA_ENCRYPTION_KEY must be 64 hex characters.')),
  MFA_ISSUER: z.string().trim().min(2).max(80).default('UniNet'),
  MFA_LOGIN_CHALLENGE_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('10m'),
  MFA_SETUP_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('10m'),
  STEP_UP_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('10m'),
  PASSWORD_HISTORY_COUNT: z.coerce.number().int().min(0).max(24).default(5),
  LOGIN_BACKOFF_THRESHOLD: z.coerce.number().int().min(2).max(20).default(3),
  LOGIN_BACKOFF_MAX_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
  LOGIN_ALERT_THRESHOLD: z.coerce.number().int().min(3).max(30).default(5),
  EMAIL_CHANGE_TOKEN_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('30m'),
  PASSWORD_RESET_TOKEN_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('1h'),
  PASSWORD_RESET_OTP_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('10m'),
  PASSWORD_RESET_OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  REMEMBER_ME_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  EMAIL_VERIFICATION_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  EMAIL_VERIFICATION_CODE_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('10m'),
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  EMAIL_VERIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  EMAIL_VERIFICATION_SECRET: optionalString(z.string().min(32)),
  INVITATION_TOKEN_EXPIRES_IN: z.string().regex(/^\d+[mhd]$/).default('72h'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  GOOGLE_OAUTH_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  GOOGLE_OAUTH_CLIENT_ID: optionalString(z.string().trim().min(1)),
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString(z.string().trim().min(1)),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/auth/google/callback'),
  GOOGLE_OAUTH_AUTH_URL: z.string().url().default('https://accounts.google.com/o/oauth2/v2/auth'),
  GOOGLE_OAUTH_TOKEN_URL: z.string().url().default('https://oauth2.googleapis.com/token'),
  GOOGLE_OAUTH_TOKENINFO_URL: z.string().url().default('https://oauth2.googleapis.com/tokeninfo'),
  OAUTH_STATE_SECRET: optionalString(z.string().min(32)),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  EMAIL_DELIVERY_MODE: z.enum(['console', 'smtp', 'resend', 'disabled']).default('console'),
  EMAIL_FROM: z.string().email().default('no-reply@uninet.local'),
  SMTP_HOST: optionalString(z.string().trim().min(1)),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.string().transform(value => value === 'true').default(false),
  SMTP_USER: optionalString(z.string().trim().min(1)),
  SMTP_PASSWORD: optionalString(z.string().min(1)),
  RESEND_API_KEY: optionalString(z.string().min(10)),
  RESEND_API_URL: z.string().url().default('https://api.resend.com/emails'),
  RESEND_REPLY_TO: optionalString(z.string().email()),
  STRIPE_ENABLED: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  STRIPE_SECRET_KEY: optionalString(z.string().min(12)),
  STRIPE_WEBHOOK_SECRET: optionalString(z.string().min(12)),
  TRUST_PROXY: z.string().default('false').transform((value, context) => {
    if (value === 'false') return false
    if (/^[1-9]\d*$/.test(value)) return Number(value)
    context.addIssue({ code: 'custom', message: 'TRUST_PROXY must be false or a positive hop count.' })
    return z.NEVER
  }),
  REDIS_URL: optionalString(z.string()).refine(value => !value || /^rediss?:\/\//i.test(value), 'REDIS_URL must use redis:// or rediss://.'),
  FILE_STORAGE_PROVIDER: z.enum(['s3']).default('s3'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default('uninet-files'),
  S3_ACCESS_KEY: z.string().min(3).default('uninet-local'),
  S3_SECRET_KEY: z.string().min(8).default('uninet-local-secret'),
  S3_FORCE_PATH_STYLE: z.string().transform(value => value === 'true').default(true),
  FILE_CV_MAX_BYTES: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(5 * 1024 * 1024),
  FILE_AVATAR_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(2 * 1024 * 1024),
  FILE_UNIVERSITY_LOGO_MAX_BYTES: z.coerce.number().int().min(1024).max(10 * 1024 * 1024).default(2 * 1024 * 1024),
  CLAMAV_MODE: z.enum(['disabled', 'clamd']).default('disabled'),
  CLAMAV_HOST: z.string().trim().min(1).default('localhost'),
  CLAMAV_PORT: z.coerce.number().int().positive().max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.EMAIL_VERIFICATION_ENABLED) {
    context.addIssue({ code: 'custom', path: ['EMAIL_VERIFICATION_ENABLED'], message: 'Production requires email verification.' })
  }
  if (value.NODE_ENV === 'production' && ['console', 'disabled'].includes(value.EMAIL_DELIVERY_MODE)) {
    context.addIssue({ code: 'custom', path: ['EMAIL_DELIVERY_MODE'], message: 'Production requires SMTP or Resend email delivery.' })
  }
  if (value.GOOGLE_OAUTH_ENABLED && (!value.GOOGLE_OAUTH_CLIENT_ID || !value.GOOGLE_OAUTH_CLIENT_SECRET)) {
    context.addIssue({ code: 'custom', path: ['GOOGLE_OAUTH_CLIENT_ID'], message: 'Google OAuth requires a client ID and client secret.' })
  }
  if (value.STRIPE_ENABLED && !value.STRIPE_SECRET_KEY) {
    context.addIssue({ code: 'custom', path: ['STRIPE_SECRET_KEY'], message: 'STRIPE_SECRET_KEY is required when Stripe is enabled.' })
  }
  if (value.NODE_ENV === 'production' && value.STRIPE_ENABLED && !value.STRIPE_WEBHOOK_SECRET) {
    context.addIssue({ code: 'custom', path: ['STRIPE_WEBHOOK_SECRET'], message: 'Production Stripe payments require a webhook signing secret.' })
  }
  if (value.EMAIL_DELIVERY_MODE === 'resend' && !value.RESEND_API_KEY) {
    context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required for Resend delivery.' })
  }
  if (value.EMAIL_DELIVERY_MODE === 'smtp') {
    for (const field of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: `${field} is required for SMTP delivery.` })
    }
  }
  if (value.NODE_ENV === 'production') {
    if (!value.REDIS_URL) {
      context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'Production requires Redis for distributed rate limiting and workers.' })
    } else if (!value.REDIS_URL.startsWith('rediss://')) {
      context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'Production Redis transport must use TLS (rediss://).' })
    }
    if (value.FILE_STORAGE_PROVIDER !== 's3') {
      context.addIssue({ code: 'custom', path: ['FILE_STORAGE_PROVIDER'], message: 'Production file storage must use S3-compatible object storage.' })
    }
    if (!value.S3_ENDPOINT.startsWith('https://')) {
      context.addIssue({ code: 'custom', path: ['S3_ENDPOINT'], message: 'Production object storage must use HTTPS.' })
    }
    for (const field of ['S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
      if (placeholderSecret.test(value[field]) || /(^|[-_])local($|[-_])/i.test(value[field])) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} must be a production credential.` })
      }
    }
    if (value.CLAMAV_MODE !== 'clamd') {
      context.addIssue({ code: 'custom', path: ['CLAMAV_MODE'], message: 'Production uploads require a fail-closed malware scanner.' })
    }
    if (!value.TICKET_SIGNING_SECRET) {
      context.addIssue({ code: 'custom', path: ['TICKET_SIGNING_SECRET'], message: 'A dedicated ticket signing secret is required in production.' })
    }
    if (!value.EMAIL_VERIFICATION_SECRET) {
      context.addIssue({ code: 'custom', path: ['EMAIL_VERIFICATION_SECRET'], message: 'A dedicated email verification secret is required in production.' })
    }
    if (!value.MFA_CHALLENGE_SECRET) {
      context.addIssue({ code: 'custom', path: ['MFA_CHALLENGE_SECRET'], message: 'A dedicated MFA challenge secret is required in production.' })
    }
    if (!value.MFA_ENCRYPTION_KEY) {
      context.addIssue({ code: 'custom', path: ['MFA_ENCRYPTION_KEY'], message: 'A dedicated MFA encryption key is required in production.' })
    }
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      context.addIssue({ code: 'custom', path: ['JWT_REFRESH_SECRET'], message: 'JWT secrets must be different in production.' })
    }
    for (const field of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TICKET_SIGNING_SECRET']) {
      if (!value[field]) continue
      if (placeholderSecret.test(value[field])) {
        context.addIssue({ code: 'custom', path: [field], message: `${field} looks like a placeholder.` })
      }
    }
    if ([value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].includes(value.TICKET_SIGNING_SECRET)) {
      context.addIssue({ code: 'custom', path: ['TICKET_SIGNING_SECRET'], message: 'Ticket signing secret must be independent from JWT secrets.' })
    }
    if (value.EMAIL_VERIFICATION_SECRET && [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET, value.TICKET_SIGNING_SECRET].includes(value.EMAIL_VERIFICATION_SECRET)) {
      context.addIssue({ code: 'custom', path: ['EMAIL_VERIFICATION_SECRET'], message: 'Email verification secret must be independent from other signing secrets.' })
    }
    if (value.MFA_CHALLENGE_SECRET && [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET, value.TICKET_SIGNING_SECRET, value.EMAIL_VERIFICATION_SECRET].includes(value.MFA_CHALLENGE_SECRET)) {
      context.addIssue({ code: 'custom', path: ['MFA_CHALLENGE_SECRET'], message: 'MFA challenge secret must be independent from other signing secrets.' })
    }
    let databaseUrl
    try { databaseUrl = new URL(value.DATABASE_URL) } catch { databaseUrl = null }
    if (!databaseUrl || !['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
      context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Production DATABASE_URL must use PostgreSQL.' })
    } else {
      if (['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) {
        context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Production database cannot point to localhost.' })
      }
      const sslMode = databaseUrl.searchParams.get('sslmode')
      if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
        context.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'Production database TLS is required.' })
      }
    }
    if (!value.APP_URL.startsWith('https://')) {
      context.addIssue({ code: 'custom', path: ['APP_URL'], message: 'Production APP_URL must use HTTPS.' })
    }
    for (const origin of value.CORS_ORIGINS.split(',').map(item => item.trim())) {
      if (origin === '*' || !origin.startsWith('https://')) {
        context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'Production CORS origins must be explicit HTTPS origins.' })
        break
      }
    }
  }
})

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
  throw new Error(`Backend environment configuration is invalid: ${fields}`)
}

export const env = {
  ...result.data,
  corsOrigins: result.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  trustProxy: result.data.TRUST_PROXY,
  ticketSigningSecret: result.data.TICKET_SIGNING_SECRET ?? result.data.JWT_ACCESS_SECRET,
  emailVerificationEnabled: result.data.EMAIL_VERIFICATION_ENABLED,
  emailVerificationSecret: result.data.EMAIL_VERIFICATION_SECRET ?? result.data.JWT_ACCESS_SECRET,
  oauthStateSecret: result.data.OAUTH_STATE_SECRET ?? result.data.JWT_ACCESS_SECRET,
  mfaChallengeSecret: result.data.MFA_CHALLENGE_SECRET ?? result.data.JWT_ACCESS_SECRET,
  mfaEncryptionKey: result.data.MFA_ENCRYPTION_KEY
    ? Buffer.from(result.data.MFA_ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update(result.data.JWT_ACCESS_SECRET).digest(),
  fileStorage: {
    endpoint: result.data.S3_ENDPOINT,
    region: result.data.S3_REGION,
    bucket: result.data.S3_BUCKET,
    accessKey: result.data.S3_ACCESS_KEY,
    secretKey: result.data.S3_SECRET_KEY,
    forcePathStyle: result.data.S3_FORCE_PATH_STYLE,
  },
}
