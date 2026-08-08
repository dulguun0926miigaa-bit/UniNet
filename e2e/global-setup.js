const safeDatabaseName = /(test|ci|e2e)/i

export default function globalSetup() {
  const value = process.env.DATABASE_URL
  if (!value) throw new Error('E2E requires DATABASE_URL for a dedicated PostgreSQL test database.')

  let databaseName
  try {
    databaseName = new URL(value).pathname.replace(/^\//, '')
  } catch {
    throw new Error('E2E DATABASE_URL is not a valid URL.')
  }

  if (!safeDatabaseName.test(databaseName) && process.env.E2E_ALLOW_NON_TEST_DATABASE !== 'true') {
    throw new Error(
      `Refusing to run E2E against database "${databaseName}". Use a database name containing test/ci/e2e, or explicitly set E2E_ALLOW_NON_TEST_DATABASE=true.`,
    )
  }
}
