import { ZodError } from 'zod'
import { env } from '../config/env.js'
import { logger as defaultLogger } from '../observability/logger.js'
import { AppError } from '../utils/app-error.js'
import { requestAction } from './request-context.js'

const messages = {
  invalidJson: 'JSON хүсэлтийн бүтэц буруу байна.',
  invalidRequest: 'Хүсэлтийг боловсруулах боломжгүй байна.',
  unsupportedEncoding: 'Хүсэлтийн encoding эсвэл charset дэмжигдэхгүй байна.',
  payloadTooLarge: 'Хүсэлтийн хэмжээ зөвшөөрөгдсөн хязгаараас их байна.',
  validation: 'Оруулсан мэдээллээ шалгана уу.',
  conflict: 'Энэ өгөгдөл өмнө нь бүртгэгдсэн байна.',
  notFound: 'Хүссэн өгөгдөл олдсонгүй.',
  unauthenticated: 'Нэвтрэх эрх хүчингүй эсвэл хугацаа дууссан байна.',
  internal: 'Серверийн алдаа гарлаа.',
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(`${req.method} route олдсонгүй.`, 404, 'ROUTE_NOT_FOUND'))
}

export function normalizeHttpError(error) {
  if (error instanceof ZodError) {
    return {
      status: 422,
      code: 'VALIDATION_ERROR',
      message: messages.validation,
      details: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    }
  }
  if (error?.type === 'entity.parse.failed' && error instanceof SyntaxError) {
    return { status: 400, code: 'INVALID_JSON', message: messages.invalidJson }
  }
  if (error?.type === 'request.aborted' || error?.type === 'request.size.invalid') {
    return { status: 400, code: 'INVALID_REQUEST', message: messages.invalidRequest }
  }
  if (error?.type === 'encoding.unsupported' || error?.type === 'charset.unsupported') {
    return { status: 415, code: 'UNSUPPORTED_CONTENT_ENCODING', message: messages.unsupportedEncoding }
  }
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: messages.payloadTooLarge }
  }
  if (error?.code === 'P2002') {
    return { status: 409, code: 'CONFLICT', message: messages.conflict }
  }
  if (error?.code === 'P2025') {
    return { status: 404, code: 'NOT_FOUND', message: messages.notFound }
  }
  if (error?.name === 'TokenExpiredError' || error?.name === 'JsonWebTokenError') {
    return { status: 401, code: 'INVALID_ACCESS_TOKEN', message: messages.unauthenticated }
  }
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    }
  }
  return { status: 500, code: 'INTERNAL_SERVER_ERROR', message: messages.internal }
}

export function createErrorHandler({ logger = defaultLogger, logServerErrors = env.NODE_ENV !== 'test' } = {}) {
  return function errorHandler(error, req, res, next) {
    void next
    const normalized = normalizeHttpError(error)
    if (normalized.status >= 500 && logServerErrors) {
      logger.error('http.request.failed', {
        requestId: req.requestId,
        action: requestAction(req),
        error,
      })
    }

    res.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        requestId: req.requestId || null,
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    })
  }
}

export const errorHandler = createErrorHandler()
