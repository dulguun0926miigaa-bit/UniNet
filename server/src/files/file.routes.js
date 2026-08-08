import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/authenticate.js'
import { fileUploadLimiter, studentMutationLimiter } from '../middleware/rate-limits.js'
import { AppError } from '../utils/app-error.js'
import { env } from '../config/env.js'
import { fileService, serializeFileAsset } from './file.service.js'

const router = Router()
const uuid = z.string().uuid()
const purposeQuery = z.enum(['STUDENT_CV', 'PROFILE_AVATAR', 'UNIVERSITY_LOGO']).optional()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(env.FILE_CV_MAX_BYTES, env.FILE_AVATAR_MAX_BYTES, env.FILE_UNIVERSITY_LOGO_MAX_BYTES),
    files: 1,
    fields: 0,
    parts: 1,
  },
})

function receiveSingleFile(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') return next(new AppError('Файлын хэмжээ зөвшөөрөгдсөн хэмжээнээс хэтэрлээ.', 413, 'FILE_TOO_LARGE'))
    next(new AppError('Multipart файл хүсэлт буруу байна.', 422, 'FILE_UPLOAD_INVALID'))
  })
}

function contentDisposition(originalName) {
  const extension = originalName.includes('.') ? `.${originalName.split('.').pop().replace(/[^a-z0-9]/giu, '').slice(0, 10)}` : ''
  const asciiName = `uninet-file${extension || '.bin'}`
  const encoded = encodeURIComponent(originalName).replace(/[!'()*]/gu, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
}

router.use(authenticate)

router.post('/student/cv', requireRole('STUDENT'), fileUploadLimiter, receiveSingleFile, async (req, res, next) => {
  try {
    const asset = await fileService.uploadStudentFile({ user: req.auth.user, purpose: 'STUDENT_CV', file: req.file })
    res.status(201).json({ file: serializeFileAsset(asset) })
  } catch (error) { next(error) }
})

router.post('/student/avatar', requireRole('STUDENT'), fileUploadLimiter, receiveSingleFile, async (req, res, next) => {
  try {
    const asset = await fileService.uploadStudentFile({ user: req.auth.user, purpose: 'PROFILE_AVATAR', file: req.file })
    res.status(201).json({ file: serializeFileAsset(asset) })
  } catch (error) { next(error) }
})

router.post('/university/logo', requireRole('UNIVERSITY_ADMIN'), fileUploadLimiter, receiveSingleFile, async (req, res, next) => {
  try {
    const asset = await fileService.uploadUniversityLogo({ user: req.auth.user, file: req.file })
    res.status(201).json({
      file: serializeFileAsset(asset),
      logoUrl: `/api/public/universities/${req.auth.user.universityId}/logo?v=${Date.now()}`,
    })
  } catch (error) { next(error) }
})

router.get('/mine', async (req, res, next) => {
  try {
    const purpose = purposeQuery.parse(req.query.purpose)
    const assets = await fileService.listOwned({ user: req.auth.user, purpose })
    res.json({ files: assets.map(serializeFileAsset) })
  } catch (error) { next(error) }
})

router.get('/:id/download', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const { asset, object } = await fileService.getDownload({ user: req.auth.user, id })
    res.set({
      'Content-Type': asset.detectedMime,
      'Content-Length': object.ContentLength ? String(object.ContentLength) : String(asset.sizeBytes),
      'Content-Disposition': contentDisposition(asset.originalName),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      Digest: `sha-256=${Buffer.from(asset.sha256, 'hex').toString('base64')}`,
    })
    const stream = /** @type {import('node:stream').Readable | undefined} */ (object.Body)
    if (!stream || typeof stream.pipe !== 'function') throw new AppError('Файл унших боломжгүй байна.', 503, 'FILE_STORAGE_UNAVAILABLE')
    stream.on('error', error => {
      if (!res.headersSent) return next(error)
      res.destroy(error)
    })
    stream.pipe(res)
  } catch (error) { next(error) }
})

router.delete('/:id', requireRole('STUDENT'), studentMutationLimiter, async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const asset = await fileService.deleteOwned({ user: req.auth.user, id })
    res.json({ file: serializeFileAsset(asset) })
  } catch (error) { next(error) }
})

export { router as fileRouter }
