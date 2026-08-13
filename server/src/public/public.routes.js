import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { env } from '../config/env.js'
import { activeContentWhere } from '../utils/event-expiry.js'
import { fileService } from '../files/file.service.js'
import { AppError } from '../utils/app-error.js'

const router = Router()
const uuid = z.string().uuid()

router.get('/universities/:id/logo', async (req, res, next) => {
  try {
    const universityId = uuid.parse(req.params.id)
    const { asset, object } = await fileService.getPublicUniversityLogo(universityId)
    res.set({
      'Content-Type': asset.detectedMime,
      'Content-Length': object.ContentLength ? String(object.ContentLength) : String(asset.sizeBytes),
      'Content-Disposition': `inline; filename="university-logo.${asset.detectedMime.split('/')[1] || 'img'}"`,
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      Digest: `sha-256=${Buffer.from(asset.sha256, 'hex').toString('base64')}`,
    })
    const stream = /** @type {import('node:stream').Readable | undefined} */ (object.Body)
    if (!stream || typeof stream.pipe !== 'function') throw new AppError('Лого файлыг унших боломжгүй байна.', 503, 'FILE_STORAGE_UNAVAILABLE')
    stream.on('error', error => {
      if (!res.headersSent) return next(error)
      res.destroy(error)
    })
    stream.pipe(res)
  } catch (error) { next(error) }
})

router.get('/events/:id', async (req, res, next) => {
  try {
    const id = uuid.parse(req.params.id)
    const now = new Date()
    const event = await prisma.content.findFirst({
      where: {
        id,
        type: 'EVENT',
        status: 'PUBLISHED',
        visibility: { in: ['PUBLIC', 'NETWORK'] },
        AND: [activeContentWhere(now)],
      },
      select: {
        id: true,
        title: true,
        shortDescription: true,
        description: true,
        visibility: true,
        category: true,
        location: true,
        mode: true,
        startsAt: true,
        endsAt: true,
        deadlineAt: true,
        capacity: true,
        university: { select: { name: true, shortName: true, logoUrl: true } },
        _count: { select: { registrations: { where: { status: { in: ['CONFIRMED', 'ATTENDED'] } } } } },
      },
    })
    if (!event) throw new AppError('Нийтийн QR бүртгэлтэй арга хэмжээ олдсонгүй.', 404, 'PUBLIC_EVENT_NOT_FOUND')
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
    res.json({
      event: {
        ...event,
        university: event.university ? { ...event.university, logoUrl: event.university.logoUrl } : null,
        confirmedCount: event._count.registrations,
        seatsRemaining: event.capacity == null ? null : Math.max(0, event.capacity - event._count.registrations),
        _count: undefined,
      },
    })
  } catch (error) { next(error) }
})

router.get('/bootstrap', async (_req, res, next) => {
  try {
    const now = new Date()
    const [universities, content] = await Promise.all([
      prisma.university.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          shortName: true,
          slug: true,
          logoUrl: true,
          description: true,
          _count: {
            select: {
              users: { where: { role: 'STUDENT', status: 'ACTIVE' } },
              contents: { where: { status: 'PUBLISHED' } },
            },
          },
          domains: {
            where: { isActive: true, isVerified: true },
            select: { domain: true, isPrimary: true },
            orderBy: { isPrimary: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.content.findMany({
        where: {
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          AND: [
            { OR: [{ deadlineAt: null }, { deadlineAt: { gte: now } }] },
            activeContentWhere(now),
          ],
        },
        select: {
          id: true,
          type: true,
          visibility: true,
          title: true,
          shortDescription: true,
          category: true,
          location: true,
          mode: true,
          startsAt: true,
          deadlineAt: true,
          publishedAt: true,
          university: { select: { shortName: true } },
        },
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 24,
      }),
    ])
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    res.json({
      oauth: { googleEnabled: Boolean(env.GOOGLE_OAUTH_ENABLED) },
      universities: universities.map(university => ({
        id: university.id,
        name: university.name,
        shortName: university.shortName,
        slug: university.slug,
        logoUrl: university.logoUrl,
        description: university.description,
        domain: university.domains[0]?.domain ?? null,
        studentCount: university._count.users,
        opportunityCount: university._count.contents,
      })),
      content: content.map(item => ({
        ...item,
        university: item.university?.shortName || 'UniNet',
      })),
    })
  } catch (error) { next(error) }
})

export { router as publicRouter }
