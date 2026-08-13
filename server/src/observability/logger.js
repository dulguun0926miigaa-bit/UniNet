import { env } from '../config/env.js'

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 8
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 2_048

const sensitiveKeyPattern = /(authorization|cookie|password|passwd|credential|secret|token|sessionid|api[-_]?key|otp|verificationcode|recoverycode)/i
const piiKeyPattern = /(email|phone|firstname|lastname|fullname|givenname|familyname|address|birthdate|registernumber|studentnumber|ipaddress|remoteaddress)/i

function normalizedKey(value) {
  return String(value).replace(/[._-]/g, '')
}

function isSensitiveKey(key) {
  const normalized = normalizedKey(key)
  return sensitiveKeyPattern.test(normalized) || piiKeyPattern.test(normalized)
}

function sanitizeUrl(value) {
  return value.replace(/[?#].*$/, '')
}

/**
 * Redacts secrets and direct PII before data reaches a log sink. The function
 * deliberately returns a copy so logging can never mutate application data.
 */
export function redactLogData(value, key = '', seen = new WeakSet(), depth = 0) {
  if (isSensitiveKey(key)) return REDACTED
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') {
    const sanitized = /url$/i.test(key) ? sanitizeUrl(value) : value
    return sanitized.length > MAX_STRING_LENGTH
      ? `${sanitized.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`
      : sanitized
  }
  if (typeof value === 'function' || typeof value === 'symbol') return undefined
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]'
  if (Buffer.isBuffer(value)) return `[BINARY:${value.byteLength}]`
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    const errorCode = 'code' in value ? value.code : undefined
    const errorMeta = 'meta' in value && value.meta && typeof value.meta === 'object'
      ? redactLogData(value.meta, 'errorMeta', seen, depth + 1)
      : undefined
    return {
      name: value.name,
      ...(typeof errorCode === 'string' ? { code: errorCode } : {}),
      ...(errorMeta ? { meta: errorMeta } : {}),
    }
  }
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => redactLogData(entry, '', seen, depth + 1))
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([entryKey, entryValue]) => [entryKey, redactLogData(entryValue, entryKey, seen, depth + 1)])
      .filter(([, entryValue]) => entryValue !== undefined),
  )
}

function defaultWrite(line) {
  process.stdout.write(`${line}\n`)
}

/**
 * Small dependency-free JSON logger. Stable timestamp/level/service/event
 * fields make its output directly ingestible by log collectors and OTel processors.
 */
export function createLogger({
  write = defaultWrite,
  service = 'uninet-api',
  environment = env.NODE_ENV,
  now = () => new Date(),
} = {}) {
  function emit(level, event, attributes = {}) {
    const record = redactLogData({
      timestamp: now().toISOString(),
      level,
      service,
      environment,
      event,
      ...attributes,
    })
    write(JSON.stringify(record))
  }

  return {
    debug(event, attributes) { emit('debug', event, attributes) },
    info(event, attributes) { emit('info', event, attributes) },
    warn(event, attributes) { emit('warn', event, attributes) },
    error(event, attributes) { emit('error', event, attributes) },
  }
}

export const logger = createLogger()
