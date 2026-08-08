process.env.NODE_ENV = 'test'
process.env.JWT_ACCESS_SECRET ||= 'integration-access-secret-at-least-32-characters'
process.env.JWT_REFRESH_SECRET ||= 'integration-refresh-secret-at-least-32-characters'
process.env.TICKET_SIGNING_SECRET ||= 'integration-ticket-secret-at-least-32-characters'
process.env.APP_URL ||= 'http://localhost:5173'
process.env.CORS_ORIGINS ||= 'http://localhost:5173'
process.env.EMAIL_DELIVERY_MODE ||= 'disabled'

if (!process.env.DATABASE_URL) {
  throw new Error('Integration tests require an explicit dedicated DATABASE_URL.')
}

process.env.EMAIL_VERIFICATION_ENABLED = 'true'
