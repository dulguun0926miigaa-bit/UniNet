import { describe, expect, it } from 'vitest'
import { canDeleteFile, canDownloadFile } from '../src/files/file-authorization.js'
import { assertSafeStorageKey, createStorageKeys, inspectUpload, validateOriginalName } from '../src/files/file-policy.js'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const safePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')

describe('secure upload validation', () => {
  it.each(['../cv.pdf', '..\\cv.pdf', 'folder/cv.pdf', 'folder\\cv.pdf', `cv${String.fromCodePoint(0)}.pdf`])(
    'rejects traversal/control filename %s',
    name => expect(() => validateOriginalName(name)).toThrowError(/Файлын нэр/u),
  )

  it('uses magic bytes instead of trusting a spoofed extension or browser MIME', async () => {
    await expect(inspectUpload({
      purpose: 'STUDENT_CV',
      originalName: 'resume.pdf',
      buffer: onePixelPng,
      maximumBytes: 1024 * 1024,
    })).rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' })
  })

  it('rejects SVG and active PDF payloads', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    await expect(inspectUpload({
      purpose: 'PROFILE_AVATAR', originalName: 'avatar.png', buffer: svg, maximumBytes: 1024 * 1024,
    })).rejects.toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' })
    await expect(inspectUpload({
      purpose: 'STUDENT_CV',
      originalName: 'resume.pdf',
      buffer: Buffer.concat([safePdf, Buffer.from('\n/OpenAction 2 0 R\n/JavaScript')]),
      maximumBytes: 1024 * 1024,
    })).rejects.toMatchObject({ code: 'ACTIVE_CONTENT_REJECTED' })
  })

  it('accepts an allowlisted PDF and records server-derived integrity metadata', async () => {
    const result = await inspectUpload({
      purpose: 'STUDENT_CV', originalName: 'resume.pdf', buffer: safePdf, maximumBytes: 1024 * 1024,
    })
    expect(result).toMatchObject({ detectedMime: 'application/pdf', originalName: 'resume.pdf', sizeBytes: safePdf.length })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('generates randomized opaque keys and rejects unsafe storage keys', () => {
    const first = createStorageKeys('STUDENT_CV', new Date('2026-07-27T00:00:00Z'))
    const second = createStorageKeys('STUDENT_CV', new Date('2026-07-27T00:00:00Z'))
    expect(first.quarantineKey).not.toBe(second.quarantineKey)
    expect(first.availableKey).toMatch(/^files\/student-cv\/2026\/07\/[a-f0-9-]{36}$/u)
    expect(() => assertSafeStorageKey('../../etc/passwd')).toThrowError()
    expect(() => assertSafeStorageKey('/absolute/path')).toThrowError()
  })
})

describe('file ownership and tenant authorization', () => {
  const asset = {
    id: 'file-1',
    ownerId: 'student-1',
    universityId: 'university-a',
    purpose: 'STUDENT_CV',
    applications: [],
  }

  it('allows the owner and platform admin but not an unrelated student', () => {
    expect(canDownloadFile({ id: 'student-1', role: 'STUDENT', universityId: 'university-a' }, asset)).toBe(true)
    expect(canDownloadFile({ id: 'platform', role: 'PLATFORM_SUPER_ADMIN' }, asset)).toBe(true)
    expect(canDownloadFile({ id: 'student-2', role: 'STUDENT', universityId: 'university-a' }, asset)).toBe(false)
  })

  it('requires an active consented application owned by the reviewing Staff member', () => {
    expect(canDownloadFile({
      id: 'staff-1', role: 'STAFF', universityId: 'university-a', staffProfile: { canManageApplications: false },
    }, asset)).toBe(false)
    expect(canDownloadFile({
      id: 'staff-1', role: 'STAFF', universityId: 'university-a', staffProfile: { canManageApplications: true },
    }, asset)).toBe(false)
  })

  it('allows a cross-university reviewer only through an active consented application', () => {
    const shared = {
      ...asset,
      applications: [{ consentGranted: true, status: 'UNDER_REVIEW', content: { universityId: 'university-b', createdById: 'staff-2' } }],
    }
    const reviewer = {
      id: 'staff-2', role: 'STAFF', universityId: 'university-b', staffProfile: { canManageApplications: true },
    }
    expect(canDownloadFile(reviewer, shared)).toBe(true)
    expect(canDownloadFile({ ...reviewer, id: 'staff-other' }, shared)).toBe(false)
    expect(canDownloadFile(reviewer, { ...shared, applications: [{ ...shared.applications[0], consentGranted: false }] })).toBe(false)
    expect(canDownloadFile(reviewer, { ...shared, applications: [{ ...shared.applications[0], status: 'WITHDRAWN' }] })).toBe(false)
  })

  it('allows destructive actions only for the student owner', () => {
    expect(canDeleteFile({ id: 'student-1', role: 'STUDENT' }, asset)).toBe(true)
    expect(canDeleteFile({ id: 'admin', role: 'UNIVERSITY_ADMIN' }, asset)).toBe(false)
    expect(canDeleteFile({ id: 'student-2', role: 'STUDENT' }, asset)).toBe(false)
  })
})
