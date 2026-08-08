import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { environmentSchema } from '../src/config/env.js'

const productionEnvironment = {
  NODE_ENV: 'production',
  PORT: '4000',
  DATABASE_URL: 'postgresql://uninet:strong-value@db.internal:5432/uninet?sslmode=require',
  JWT_ACCESS_SECRET: '2d20c62bdba647b2b9624a327e875138afe5f1aa',
  JWT_REFRESH_SECRET: 'db1908d76d7042f58027f6e9428fbde0397b3e49',
  TICKET_SIGNING_SECRET: 'e35f8cd1c65749e988979f240f13013b5ae36e25',
  EMAIL_VERIFICATION_ENABLED: 'true',
  EMAIL_VERIFICATION_SECRET: '7f9c3a1b5d8e2f4a6c0b9e7d3f1a5c8e2b6d4f9a',
  APP_URL: 'https://uninet.mn',
  CORS_ORIGINS: 'https://uninet.mn,https://admin.uninet.mn',
  EMAIL_DELIVERY_MODE: 'resend',
  RESEND_API_KEY: 're_test_12345678901234567890',
  EMAIL_FROM: 'no-reply@uninet.mn',
  TRUST_PROXY: '1',
  REDIS_URL: 'rediss://redis.internal:6380',
  FILE_STORAGE_PROVIDER: 's3',
  S3_ENDPOINT: 'https://objects.uninet.mn',
  S3_REGION: 'ap-east-1',
  S3_BUCKET: 'uninet-production-files',
  S3_ACCESS_KEY: 'UNINETPRODUCTIONACCESS',
  S3_SECRET_KEY: '7e9073bd2db24e1f990a9c3347041e3b',
  S3_FORCE_PATH_STYLE: 'false',
  CLAMAV_MODE: 'clamd',
  CLAMAV_HOST: 'clamd.internal',
  CLAMAV_PORT: '3310',
}

describe('production environment safety', () => {
  it('accepts explicit TLS origins, remote TLS PostgreSQL and distinct non-placeholder secrets', () => {
    const result = environmentSchema.safeParse(productionEnvironment)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.TRUST_PROXY).toBe(1)
  })

  it('rejects placeholder/equal secrets, localhost database, missing DB TLS and non-HTTPS origins', () => {
    const result = environmentSchema.safeParse({
      ...productionEnvironment,
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/uninet',
      JWT_ACCESS_SECRET: 'replace-with-a-shared-secret-value-123456',
      JWT_REFRESH_SECRET: 'replace-with-a-shared-secret-value-123456',
      APP_URL: 'http://localhost:5173',
      CORS_ORIGINS: '*',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(issue => issue.path.join('.'))
      expect(paths).toEqual(expect.arrayContaining(['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'APP_URL', 'CORS_ORIGINS']))
    }
  })

  it('requires an independent ticket signing key in production', () => {
    const missing = environmentSchema.safeParse({ ...productionEnvironment, TICKET_SIGNING_SECRET: undefined })
    expect(missing.success).toBe(false)
    const reused = environmentSchema.safeParse({
      ...productionEnvironment,
      TICKET_SIGNING_SECRET: productionEnvironment.JWT_ACCESS_SECRET,
    })
    expect(reused.success).toBe(false)
  })

  it('does not allow the development email-verification bypass in production', () => {
    const result = environmentSchema.safeParse({
      ...productionEnvironment,
      EMAIL_VERIFICATION_ENABLED: 'false',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path.join('.'))).toContain('EMAIL_VERIFICATION_ENABLED')
    }
  })

  it('requires a Resend API key when Resend delivery is selected', () => {
    const result = environmentSchema.safeParse({ ...productionEnvironment, RESEND_API_KEY: undefined })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map(issue => issue.path.join('.'))).toContain('RESEND_API_KEY')
  })

  it('requires a dedicated email-verification secret in production', () => {
    const missing = environmentSchema.safeParse({ ...productionEnvironment, EMAIL_VERIFICATION_SECRET: undefined })
    expect(missing.success).toBe(false)
    const reused = environmentSchema.safeParse({
      ...productionEnvironment,
      EMAIL_VERIFICATION_SECRET: productionEnvironment.JWT_ACCESS_SECRET,
    })
    expect(reused.success).toBe(false)
  })

  it('fails closed when object storage TLS or malware scanning is disabled in production', () => {
    const result = environmentSchema.safeParse({
      ...productionEnvironment,
      S3_ENDPOINT: 'http://objects.internal:9000',
      CLAMAV_MODE: 'disabled',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(issue => issue.path.join('.'))
      expect(paths).toEqual(expect.arrayContaining(['S3_ENDPOINT', 'CLAMAV_MODE']))
    }
  })
})

describe('API browser security headers', () => {
  it('sends CSP, frame, referrer, MIME and permissions policy headers', async () => {
    const response = await request(app).get('/missing-security-header-check')
    expect(response.status).toBe(404)
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
    expect(response.headers['permissions-policy']).toContain('camera=()')
  })
})
