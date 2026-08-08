process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/uninet_test'
process.env.JWT_ACCESS_SECRET = 'test-access-secret-at-least-32-characters-long'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long'
process.env.APP_URL = 'http://localhost:5173'
process.env.CORS_ORIGINS = 'http://localhost:5173'

process.env.EMAIL_VERIFICATION_ENABLED = 'true'
