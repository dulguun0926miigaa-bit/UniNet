import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { AppError } from '../utils/app-error.js'

const purposePolicies = Object.freeze({
  STUDENT_CV: {
    extensions: new Set(['.pdf']),
    mimeByExtension: new Map([['.pdf', 'application/pdf']]),
  },
  PROFILE_AVATAR: {
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
    mimeByExtension: new Map([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
    ]),
  },
  UNIVERSITY_LOGO: {
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
    mimeByExtension: new Map([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
    ]),
  },
})

const activePdfTokens = [
  '/JavaScript',
  '/OpenAction',
  '/Launch',
  '/EmbeddedFile',
  '/RichMedia',
]

export function validateOriginalName(originalName) {
  if (typeof originalName !== 'string' || originalName.length < 1 || originalName.length > 180) {
    throw new AppError('Файлын нэр буруу байна.', 422, 'FILE_NAME_INVALID')
  }
  const hasControlCharacter = Array.from(originalName).some(character => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
  if (hasControlCharacter || /[/\\]/u.test(originalName) || path.basename(originalName) !== originalName) {
    throw new AppError('Файлын нэр замын мэдээлэл агуулж болохгүй.', 422, 'FILE_NAME_INVALID')
  }
  return originalName.normalize('NFC')
}

export async function inspectUpload({ purpose, originalName, buffer, maximumBytes }) {
  const policy = purposePolicies[purpose]
  if (!policy) throw new AppError('Файлын зориулалт зөвшөөрөгдөөгүй.', 422, 'FILE_PURPOSE_INVALID')
  const safeName = validateOriginalName(originalName)
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError('Хоосон файл оруулах боломжгүй.', 422, 'FILE_EMPTY')
  }
  if (buffer.length > maximumBytes) {
    throw new AppError('Файлын хэмжээ зөвшөөрөгдсөн хэмжээнээс хэтэрлээ.', 413, 'FILE_TOO_LARGE')
  }

  const extension = path.extname(safeName).toLowerCase()
  if (!policy.extensions.has(extension)) {
    throw new AppError('Файлын өргөтгөл зөвшөөрөгдөөгүй.', 422, 'FILE_EXTENSION_NOT_ALLOWED')
  }
  const detected = await fileTypeFromBuffer(buffer)
  const expectedMime = policy.mimeByExtension.get(extension)
  if (!detected || detected.mime !== expectedMime) {
    throw new AppError('Файлын бодит төрөл нэр/өргөтгөлтэй тохирохгүй байна.', 422, 'FILE_SIGNATURE_MISMATCH')
  }

  const searchableText = buffer.toString('latin1')
  if (/<\s*svg\b|<\s*script\b|javascript\s*:/iu.test(searchableText)) {
    throw new AppError('SVG эсвэл идэвхтэй контент зөвшөөрөгдөөгүй.', 422, 'ACTIVE_CONTENT_REJECTED')
  }
  if (detected.mime === 'application/pdf' && activePdfTokens.some(token => searchableText.includes(token))) {
    throw new AppError('Идэвхтэй PDF контент зөвшөөрөгдөөгүй.', 422, 'ACTIVE_CONTENT_REJECTED')
  }

  return {
    originalName: safeName,
    extension,
    detectedMime: detected.mime,
    sizeBytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

export function createStorageKeys(purpose, now = new Date()) {
  const datePrefix = now.toISOString().slice(0, 7).replace('-', '/')
  const randomName = randomUUID()
  const purposePath = purpose.toLowerCase().replaceAll('_', '-')
  return {
    quarantineKey: `quarantine/${datePrefix}/${randomName}`,
    availableKey: `files/${purposePath}/${datePrefix}/${randomName}`,
  }
}

export function assertSafeStorageKey(key) {
  if (typeof key !== 'string' || key.length > 240 || key.startsWith('/') || key.includes('..') || !/^[a-z0-9/_-]+$/i.test(key)) {
    throw new AppError('Object storage key буруу байна.', 500, 'STORAGE_KEY_INVALID')
  }
  return key
}

export function filePolicyFor(purpose) {
  return purposePolicies[purpose]
}
