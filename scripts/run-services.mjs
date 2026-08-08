import { watch as watchFileSystem } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const watchMode = process.argv.includes('--watch')
const root = process.cwd()
const services = [
  { name: 'identity', file: 'server/src/services/identity-service.js' },
  { name: 'core', file: 'server/src/services/core-service.js' },
  { name: 'gateway', file: 'server/src/services/api-gateway.js' },
]

const children = new Map()
const intentionalStops = new WeakSet()
const crashCounts = new Map()
const restartTimers = new Map()
const watchers = []
let closing = false
let sourceRestartTimer = null
let restarting = false
let generation = 0

function clearServiceRestart(name) {
  const timer = restartTimers.get(name)
  if (timer) clearTimeout(timer)
  restartTimers.delete(name)
}

function scheduleServiceRestart(service, expectedGeneration) {
  if (closing || expectedGeneration !== generation || children.has(service.name)) return
  clearServiceRestart(service.name)
  const failures = (crashCounts.get(service.name) || 0) + 1
  crashCounts.set(service.name, failures)
  const delay = Math.min(500 * (2 ** Math.min(failures - 1, 4)), 8_000)
  console.error(`[supervisor] ${service.name} stopped unexpectedly. Restarting in ${delay}ms.`)
  const timer = setTimeout(() => {
    restartTimers.delete(service.name)
    spawnService(service, expectedGeneration)
  }, delay)
  timer.unref?.()
  restartTimers.set(service.name, timer)
}

function spawnService(service, expectedGeneration = generation) {
  if (closing || expectedGeneration !== generation || children.has(service.name)) return
  clearServiceRestart(service.name)
  const child = spawn(process.execPath, [service.file], {
    stdio: 'inherit',
    env: { ...process.env, UNINET_SERVICE_NAME: service.name },
  })
  children.set(service.name, child)
  console.info(`[supervisor] ${service.name} started (pid ${child.pid})`)

  child.on('exit', (code, signal) => {
    if (children.get(service.name) === child) children.delete(service.name)
    if (closing || intentionalStops.has(child) || expectedGeneration !== generation) return
    console.error(`[supervisor] ${service.name} exited (${signal || (code ?? 'unknown')}).`)
    scheduleServiceRestart(service, expectedGeneration)
  })

  child.on('error', error => {
    console.error(`[supervisor] ${service.name} process error:`, error)
  })

  const stableTimer = setTimeout(() => {
    if (children.get(service.name) === child && child.exitCode === null && expectedGeneration === generation) {
      crashCounts.set(service.name, 0)
    }
  }, 15_000)
  stableTimer.unref?.()
}

async function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return
  intentionalStops.add(child)
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 4_000)
    timeout.unref?.()
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill(signal)
  })
}

async function restartAll(reason) {
  if (closing || restarting) return
  restarting = true
  generation += 1
  const nextGeneration = generation
  console.info(`[supervisor] restarting services: ${reason}`)
  for (const service of services) clearServiceRestart(service.name)
  const running = [...children.values()]
  await Promise.all(running.map(child => stopChild(child)))
  for (const service of services) spawnService(service, nextGeneration)
  restarting = false
}

function scheduleSourceRestart(changedPath) {
  if (!watchMode || closing) return
  const normalized = String(changedPath || '').replaceAll('\\', '/')
  if (normalized && !/\.(?:js|mjs|cjs|json|prisma)$/u.test(normalized) && !normalized.endsWith('.env')) return
  clearTimeout(sourceRestartTimer)
  sourceRestartTimer = setTimeout(() => void restartAll(normalized || 'source change'), 350)
}

function startWatchers() {
  if (!watchMode) return
  for (const target of ['server/src', 'server/prisma']) {
    const absolute = path.join(root, target)
    try {
      const watcher = watchFileSystem(absolute, { recursive: true }, (_eventType, filename) => {
        scheduleSourceRestart(filename ? `${target}/${filename}` : target)
      })
      watchers.push(watcher)
    } catch (error) {
      console.warn(`[supervisor] recursive watch unavailable for ${target}: ${error.message}`)
    }
  }
  try {
    const envWatcher = watchFileSystem(path.join(root, '.env'), () => scheduleSourceRestart('.env'))
    watchers.push(envWatcher)
  } catch {
    // .env is optional; each service still loads its own environment configuration.
  }
}

async function shutdown(signal) {
  if (closing) return
  closing = true
  generation += 1
  clearTimeout(sourceRestartTimer)
  for (const service of services) clearServiceRestart(service.name)
  for (const watcher of watchers) watcher.close()
  console.info(`[supervisor] shutting down (${signal})`)
  await Promise.all([...children.values()].map(child => stopChild(child, signal)))
  process.exit(0)
}

for (const service of services) spawnService(service)
startWatchers()

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
