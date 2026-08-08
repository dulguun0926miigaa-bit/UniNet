import 'dotenv/config'
import { spawn } from 'node:child_process'

const requiredConfirmation = 'RESET_UNINET_DEMO'
if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo database reset is forbidden in production.')
}
if (process.env.DEMO_RESET_CONFIRM !== requiredConfirmation) {
  throw new Error(`Set DEMO_RESET_CONFIRM=${requiredConfirmation} before resetting the demo database.`)
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.')

let databaseName = ''
try { databaseName = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, '') } catch { /* Prisma will report invalid URL */ }
if (!/(uninet|demo|dev|local|test)/i.test(databaseName)) {
  throw new Error(`Refusing to reset unexpected database "${databaseName}".`)
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(command, ['prisma', 'migrate', 'reset', '--force', '--skip-generate'], {
  stdio: 'inherit',
  env: { ...process.env, SEED_ROLE_USERS: process.env.SEED_ROLE_USERS || 'true' },
})
child.on('exit', code => process.exit(code ?? 1))
child.on('error', error => { console.error(error); process.exit(1) })
