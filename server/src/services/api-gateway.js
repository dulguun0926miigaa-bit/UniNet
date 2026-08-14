import http from 'node:http'
import { env } from '../config/env.js'
import { logger } from '../observability/logger.js'
import { UpstreamCircuitBreaker } from './upstream-circuit-breaker.js'

const identityPrefixes = ['/api/auth', '/api/privacy', '/api/notifications']
const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade'])
const circuitBreaker = new UpstreamCircuitBreaker({
  failureThreshold: env.GATEWAY_CIRCUIT_FAILURE_THRESHOLD,
  resetMs: env.GATEWAY_CIRCUIT_RESET_MS,
})

function corsHeaders(origin) {
  if (!origin || !env.corsOrigins.includes(origin)) return null
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'Authorization,Content-Type,Idempotency-Key,X-Request-ID',
    'access-control-expose-headers': 'X-Request-ID,X-UniNet-Service,Retry-After',
    vary: 'Origin',
  }
}

function writeJson(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, ...headers })
  res.end(body)
}

async function aggregateReadiness(req, res, cors) {
  const services = [
    ['identity', `${env.IDENTITY_SERVICE_URL}/api/ready`],
    ['core', `${env.CORE_SERVICE_URL}/api/ready`],
  ]
  const checks = {}
  let ready = true
  await Promise.all(services.map(async ([name, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
      checks[name] = response.ok ? 'up' : 'down'
      if (!response.ok) ready = false
    } catch {
      checks[name] = 'down'
      ready = false
    }
  }))
  writeJson(res, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready', gateway: 'up', services: checks }, cors)
}

function proxy(req, res, targetBase, targetName, cors) {
  const decision = circuitBreaker.canRequest(targetName)
  if (!decision.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000))
    return writeJson(res, 503, {
      error: {
        code: 'UPSTREAM_CIRCUIT_OPEN',
        message: 'Backend service түр хамгаалалтын горимд байна. Түр хүлээгээд дахин оролдоно уу.',
      },
    }, { ...(cors || {}), 'retry-after': String(retryAfterSeconds) })
  }

  const target = new URL(req.url, targetBase)
  const headers = { ...req.headers, host: target.host, 'x-forwarded-host': req.headers.host || '', 'x-forwarded-proto': 'http' }
  delete headers['content-length']
  let settled = false
  const fail = (error, code = 'UPSTREAM_UNAVAILABLE') => {
    if (settled) return
    settled = true
    const breakerState = circuitBreaker.recordFailure(targetName)
    logger.error('gateway.proxy.failed', { targetService: targetName, target: target.toString(), code, breakerState, error })
    if (!res.headersSent) writeJson(res, 503, { error: { code, message: 'Backend service түр ашиглах боломжгүй байна.' } }, cors || {})
    else res.destroy(error)
  }

  const proxyReq = http.request(target, { method: req.method, headers }, proxyRes => {
    if (settled) return proxyRes.destroy()
    settled = true
    if ((proxyRes.statusCode || 500) >= 500) circuitBreaker.recordFailure(targetName)
    else circuitBreaker.recordSuccess(targetName)
    const responseHeaders = {}
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (!hopByHopHeaders.has(key) && value !== undefined) responseHeaders[key] = value
    }
    Object.assign(responseHeaders, cors || {})
    res.writeHead(proxyRes.statusCode || 502, responseHeaders)
    proxyRes.pipe(res)
  })
  proxyReq.setTimeout(env.GATEWAY_UPSTREAM_TIMEOUT_MS, () => {
    const error = /** @type {Error & { code?: string }} */ (new Error(`Gateway upstream timeout after ${env.GATEWAY_UPSTREAM_TIMEOUT_MS}ms`))
    error.code = 'UPSTREAM_TIMEOUT'
    proxyReq.destroy(error)
  })
  proxyReq.on('error', error => fail(error, /** @type {Error & { code?: string }} */ (error).code === 'UPSTREAM_TIMEOUT' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE'))
  req.on('aborted', () => proxyReq.destroy(new Error('Client request aborted')))
  res.on('close', () => {
    if (!res.writableEnded) proxyReq.destroy(new Error('Client response closed'))
  })
  req.pipe(proxyReq)
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  const cors = corsHeaders(origin)
  if (origin && !cors) return writeJson(res, 403, { error: { code: 'CORS_ORIGIN_DENIED', message: 'Энэ origin-оос хандахыг зөвшөөрөөгүй.' } })
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors || {})
    return res.end()
  }
  if (['/api/health', '/api/live', '/live'].includes(req.url?.split('?')[0])) {
    return writeJson(res, 200, { status: 'ok', service: 'api-gateway' }, cors || {})
  }
  if (['/api/ready', '/ready'].includes(req.url?.split('?')[0])) return aggregateReadiness(req, res, cors || {})
  const path = req.url || '/'
  const identityRoute = identityPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  const target = identityRoute ? env.IDENTITY_SERVICE_URL : env.CORE_SERVICE_URL
  return proxy(req, res, target, identityRoute ? 'identity' : 'core', cors || {})
})

server.requestTimeout = 35_000
server.headersTimeout = 40_000
server.keepAliveTimeout = 5_000
server.listen(env.GATEWAY_PORT, env.GATEWAY_BIND_HOST, () => {
  logger.info('api-gateway.started', { host: env.GATEWAY_BIND_HOST, port: env.GATEWAY_PORT, identity: env.IDENTITY_SERVICE_URL, core: env.CORE_SERVICE_URL })
})

const shutdown = signal => {
  logger.info('api-gateway.stopping', { signal })
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
