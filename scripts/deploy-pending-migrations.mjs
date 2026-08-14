import { spawn } from 'node:child_process'
import process from 'node:process'

export async function deployPendingMigrations() {
  if (process.env.SKIP_AUTO_MIGRATIONS === 'true') {
    console.info('[migration] automatic deployment skipped by SKIP_AUTO_MIGRATIONS=true')
    return
  }

  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  console.info('[migration] applying pending Prisma migrations before server startup')

  await new Promise((resolve, reject) => {
    const child = spawn(npmExecutable, ['run', 'db:deploy'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })

    child.once('error', error => {
      reject(new Error(`Unable to start Prisma migration deployment: ${error.message}`, { cause: error }))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        console.info('[migration] database schema is up to date')
        resolve()
        return
      }
      reject(new Error(`Prisma migration deployment failed (${signal || `exit code ${code ?? 'unknown'}`})`))
    })
  })
}
