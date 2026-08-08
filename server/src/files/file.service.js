import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/app-error.js'
import { canDeleteFile, canDownloadFile } from './file-authorization.js'
import { createStorageKeys, inspectUpload } from './file-policy.js'
import { objectStorage } from './object-storage.js'
import { malwareScanner } from './malware-scanner.js'

const maximumBytesByPurpose = {
  STUDENT_CV: env.FILE_CV_MAX_BYTES,
  PROFILE_AVATAR: env.FILE_AVATAR_MAX_BYTES,
  UNIVERSITY_LOGO: env.FILE_UNIVERSITY_LOGO_MAX_BYTES,
}

export function serializeFileAsset(asset) {
  return {
    id: asset.id,
    purpose: asset.purpose,
    status: asset.status,
    originalName: asset.originalName,
    detectedMime: asset.detectedMime,
    sizeBytes: Number(asset.sizeBytes),
    sha256: asset.sha256,
    scanStatus: asset.scanStatus,
    createdAt: asset.createdAt.toISOString(),
    downloadUrl: asset.status === 'AVAILABLE' ? `/api/files/${asset.id}/download` : null,
  }
}

async function recordAudit(transaction, { user, action, asset, previousData = undefined, nextData = undefined, severity = 'INFO' }) {
  await transaction.auditLog.create({
    data: {
      actorId: user.id,
      universityId: user.universityId,
      action,
      resourceType: 'FileAsset',
      resourceId: asset.id,
      resourceName: asset.originalName,
      previousData,
      nextData,
      severity,
    },
  })
}

export function createFileService({
  database = prisma,
  storage = objectStorage,
  scanner = malwareScanner,
} = {}) {
  async function uploadAndScan({ user, purpose, file, onAvailable }) {
    if (!file?.buffer || !file.originalname) throw new AppError('Оруулах файл сонгоно уу.', 422, 'FILE_REQUIRED')
    const maximumBytes = maximumBytesByPurpose[purpose]
    if (!maximumBytes) throw new AppError('Файлын зориулалт зөвшөөрөгдөөгүй.', 422, 'FILE_PURPOSE_INVALID')
    const inspected = await inspectUpload({ purpose, originalName: file.originalname, buffer: file.buffer, maximumBytes })
    const keys = createStorageKeys(purpose)
    const asset = await database.fileAsset.create({
      data: {
        ownerId: user.id,
        universityId: user.universityId,
        purpose,
        storageKey: keys.quarantineKey,
        sha256: inspected.sha256,
        detectedMime: inspected.detectedMime,
        originalName: inspected.originalName,
        sizeBytes: BigInt(inspected.sizeBytes),
      },
    })

    try {
      await storage.put(keys.quarantineKey, file.buffer, { sha256: inspected.sha256 })
    } catch {
      await database.fileAsset.update({
        where: { id: asset.id },
        data: { scanStatus: 'ERROR', scanProvider: 'storage', scanResult: 'Private object upload failed', scannedAt: new Date() },
      })
      throw new AppError('Файл хадгалах үйлчилгээ түр ажиллахгүй байна.', 503, 'FILE_STORAGE_UNAVAILABLE')
    }

    let scan
    try {
      scan = await scanner.scan(file.buffer)
    } catch {
      await database.$transaction(async transaction => {
        const failed = await transaction.fileAsset.update({
          where: { id: asset.id },
          data: { scanStatus: 'ERROR', scanProvider: 'clamd', scanResult: 'Malware scan failed', scannedAt: new Date() },
        })
        await recordAudit(transaction, {
          user,
          action: 'FILE_SCAN_FAILED',
          asset: failed,
          nextData: { scanStatus: 'ERROR' },
          severity: 'HIGH',
        })
      })
      throw new AppError('Файлын аюулгүй байдлыг шалгаж чадсангүй. Файл тусгаарлагдсан.', 503, 'FILE_SCAN_UNAVAILABLE')
    }

    if (scan.status === 'INFECTED') {
      await database.$transaction(async transaction => {
        const infected = await transaction.fileAsset.update({
          where: { id: asset.id },
          data: { scanStatus: 'INFECTED', scanProvider: scan.provider, scanResult: scan.result, scannedAt: new Date() },
        })
        await recordAudit(transaction, {
          user,
          action: 'FILE_MALWARE_DETECTED',
          asset: infected,
          nextData: { scanStatus: 'INFECTED' },
          severity: 'CRITICAL',
        })
      })
      throw new AppError('Файл аюултай гэж илэрсэн тул ашиглах боломжгүй.', 422, 'FILE_INFECTED')
    }
    if (scan.status !== 'CLEAN') {
      throw new AppError('Файлын scan үр дүн тодорхойгүй байна.', 503, 'FILE_SCAN_UNAVAILABLE')
    }

    try {
      await storage.promote(keys.quarantineKey, keys.availableKey, { sha256: inspected.sha256 })
    } catch {
      await database.fileAsset.update({
        where: { id: asset.id },
        data: { scanStatus: 'ERROR', scanProvider: 'storage', scanResult: 'Quarantine promotion failed', scannedAt: new Date() },
      })
      throw new AppError('Шалгасан файлыг идэвхжүүлж чадсангүй.', 503, 'FILE_STORAGE_UNAVAILABLE')
    }

    return database.$transaction(async transaction => {
      const available = await transaction.fileAsset.update({
        where: { id: asset.id },
        data: {
          storageKey: keys.availableKey,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          scanProvider: scan.provider,
          scanResult: scan.result,
          scannedAt: new Date(),
        },
      })
      await onAvailable(transaction, available)
      await recordAudit(transaction, {
        user,
        action: 'FILE_UPLOAD_COMPLETED',
        asset: available,
        nextData: {
          purpose,
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
          sha256: available.sha256,
          sizeBytes: Number(available.sizeBytes),
        },
      })
      return available
    })
  }

  return {
    async uploadStudentFile({ user, purpose, file }) {
      if (user.role !== 'STUDENT') throw new AppError('Зөвхөн оюутан энэ файл оруулах боломжтой.', 403, 'FILE_UPLOAD_FORBIDDEN')
      return uploadAndScan({
        user,
        purpose,
        file,
        onAvailable: async (transaction, available) => {
          const profileData = purpose === 'STUDENT_CV'
            ? { cvAssetId: available.id }
            : { avatarAssetId: available.id }
          await transaction.studentProfile.update({ where: { userId: user.id }, data: profileData })
        },
      })
    },

    async uploadUniversityLogo({ user, file }) {
      if (user.role !== 'UNIVERSITY_ADMIN' || !user.universityId) {
        throw new AppError('Зөвхөн University Admin сургуулийн лого оруулах боломжтой.', 403, 'FILE_UPLOAD_FORBIDDEN')
      }
      return uploadAndScan({
        user,
        purpose: 'UNIVERSITY_LOGO',
        file,
        onAvailable: async (transaction, available) => {
          const university = await transaction.university.findUnique({
            where: { id: user.universityId },
            select: { id: true, name: true, profileSettings: true },
          })
          if (!university) throw new AppError('Их сургууль олдсонгүй.', 404, 'UNIVERSITY_NOT_FOUND')
          const currentSettings = university.profileSettings && typeof university.profileSettings === 'object' && !Array.isArray(university.profileSettings)
            ? university.profileSettings
            : {}
          const previousLogoAssetId = typeof currentSettings.logoAssetId === 'string' ? currentSettings.logoAssetId : null
          const logoUrl = `/api/public/universities/${university.id}/logo?v=${Date.now()}`
          await transaction.university.update({
            where: { id: university.id },
            data: {
              logoUrl,
              profileSettings: { ...currentSettings, logoAssetId: available.id },
            },
          })
          if (previousLogoAssetId && previousLogoAssetId !== available.id) {
            await transaction.fileAsset.updateMany({
              where: {
                id: previousLogoAssetId,
                universityId: university.id,
                purpose: 'UNIVERSITY_LOGO',
                status: { not: 'DELETED' },
              },
              data: { status: 'DELETED', deletedAt: new Date() },
            })
          }
          await transaction.auditLog.create({
            data: {
              actorId: user.id,
              universityId: university.id,
              action: 'UNIVERSITY_LOGO_UPDATED',
              resourceType: 'University',
              resourceId: university.id,
              resourceName: university.name,
              previousData: previousLogoAssetId ? { logoAssetId: previousLogoAssetId } : undefined,
              nextData: { logoAssetId: available.id, logoUrl },
              severity: 'INFO',
            },
          })
        },
      })
    },

    async getPublicUniversityLogo(universityId) {
      const university = await database.university.findUnique({
        where: { id: universityId },
        select: { profileSettings: true },
      })
      const settings = university?.profileSettings
      const logoAssetId = settings && typeof settings === 'object' && !Array.isArray(settings) && typeof settings.logoAssetId === 'string'
        ? settings.logoAssetId
        : null
      if (!logoAssetId) throw new AppError('Сургуулийн лого олдсонгүй.', 404, 'UNIVERSITY_LOGO_NOT_FOUND')
      const asset = await database.fileAsset.findFirst({
        where: {
          id: logoAssetId,
          universityId,
          purpose: 'UNIVERSITY_LOGO',
          status: 'AVAILABLE',
          scanStatus: 'CLEAN',
        },
      })
      if (!asset) throw new AppError('Сургуулийн лого олдсонгүй.', 404, 'UNIVERSITY_LOGO_NOT_FOUND')
      const object = await storage.get(asset.storageKey)
      if (object.Metadata?.sha256 !== asset.sha256) {
        throw new AppError('Лого файлын бүрэн бүтэн байдлыг баталгаажуулж чадсангүй.', 503, 'FILE_INTEGRITY_CHECK_FAILED')
      }
      return { asset, object }
    },

    async listOwned({ user, purpose }) {
      return database.fileAsset.findMany({
        where: { ownerId: user.id, status: { not: 'DELETED' }, ...(purpose ? { purpose } : {}) },
        orderBy: { createdAt: 'desc' },
      })
    },

    async getDownload({ user, id }) {
      const asset = await database.fileAsset.findUnique({
        where: { id },
        include: {
          applications: {
            select: {
              consentGranted: true,
              status: true,
              content: { select: { universityId: true, createdById: true } },
            },
          },
        },
      })
      if (!asset || !canDownloadFile(user, asset)) throw new AppError('Файл олдсонгүй.', 404, 'FILE_NOT_FOUND')
      if (asset.status !== 'AVAILABLE' || asset.scanStatus !== 'CLEAN') {
        throw new AppError('Файл татахад бэлэн биш байна.', 409, 'FILE_NOT_AVAILABLE')
      }
      const object = await storage.get(asset.storageKey)
      if (object.Metadata?.sha256 !== asset.sha256) {
        throw new AppError('Файлын бүрэн бүтэн байдлыг баталгаажуулж чадсангүй.', 503, 'FILE_INTEGRITY_CHECK_FAILED')
      }
      return { asset, object }
    },

    async deleteOwned({ user, id }) {
      const asset = await database.fileAsset.findUnique({
        where: { id },
        include: { _count: { select: { applications: true } } },
      })
      if (!asset || !canDeleteFile(user, asset)) throw new AppError('Файл олдсонгүй.', 404, 'FILE_NOT_FOUND')
      if (asset.status === 'DELETED') return asset
      if (asset._count.applications > 0) {
        throw new AppError('Өргөдөлд ашигласан CV-г устгах боломжгүй.', 409, 'FILE_IN_USE')
      }
      const deleted = await database.$transaction(async transaction => {
        await transaction.studentProfile.updateMany({
          where: { userId: user.id, OR: [{ avatarAssetId: asset.id }, { cvAssetId: asset.id }] },
          data: {
            ...(asset.purpose === 'PROFILE_AVATAR' ? { avatarAssetId: null } : {}),
            ...(asset.purpose === 'STUDENT_CV' ? { cvAssetId: null } : {}),
          },
        })
        const updated = await transaction.fileAsset.update({
          where: { id: asset.id },
          data: { status: 'DELETED', deletedAt: new Date() },
        })
        await recordAudit(transaction, {
          user,
          action: 'FILE_DELETED',
          asset: updated,
          previousData: { status: asset.status },
          nextData: { status: 'DELETED' },
          severity: 'MEDIUM',
        })
        return updated
      })
      try { await storage.delete(asset.storageKey) } catch { /* Soft-deleted files are never downloadable; lifecycle cleanup retries orphan removal. */ }
      return deleted
    },
  }
}

export const fileService = createFileService()
