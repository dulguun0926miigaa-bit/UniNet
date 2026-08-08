import { afterEach, describe, expect, it, vi } from 'vitest'
import { authRepository } from '../src/auth/auth.repository.js'
import { prisma } from '../src/lib/prisma.js'

const user = {
  id: 'user-id',
  universityId: 'a7ef7cda-8324-48a6-b08c-588d380f9158',
  normalizedEmail: 'student@test.example',
  email: 'student@test.example',
  role: 'STUDENT',
  status: 'PENDING_VERIFICATION',
  emailVerifiedAt: null,
  university: { id: 'a7ef7cda-8324-48a6-b08c-588d380f9158', status: 'ACTIVE' },
  studentProfile: { id: 'profile-id', firstName: 'Test', lastName: 'Student' },
  staffProfile: null,
}

afterEach(() => vi.restoreAllMocks())

describe('email verification repository transaction', () => {
  it('atomically consumes the code, matches an active student roster row and activates the user', async () => {
    const now = new Date()
    const updatedUser = { ...user, status: 'ACTIVE', emailVerifiedAt: now }
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(updatedUser),
      },
      emailVerificationToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-id', tokenHash: 'expected-hash', attemptCount: 0,
          expiresAt: new Date(Date.now() + 60_000), usedAt: null,
        }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
      universityMember: {
        findUnique: vi.fn().mockResolvedValue({
          memberType: 'STUDENT', enrollmentStatus: 'ACTIVE', studentId: 'S-100',
          firstName: 'Roster', lastName: 'Student', department: 'IT', major: 'Software Engineering',
          validFrom: null, validUntil: null,
        }),
      },
      studentProfile: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(callback => callback(tx))

    const result = await authRepository.finalizeEmailVerification({
      userId: user.id,
      tokenHash: 'expected-hash',
      maxAttempts: 5,
    })

    expect(result).toEqual({ status: 'verified', user: updatedUser, rosterMatched: true })
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: user.id },
      data: expect.objectContaining({
        status: 'ACTIVE',
        emailVerifiedAt: expect.any(Date),
        studentProfile: {
          update: expect.objectContaining({
            universityId: user.universityId,
            studentId: 'S-100',
            firstName: 'Roster',
          }),
        },
      }),
    }))
  })

  it('increments attempts and invalidates the code when the maximum is reached', async () => {
    const update = vi.fn().mockResolvedValue({})
    const tx = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      emailVerificationToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-id', tokenHash: 'expected-hash', attemptCount: 4,
          expiresAt: new Date(Date.now() + 60_000), usedAt: null,
        }),
        update,
      },
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(callback => callback(tx))

    const result = await authRepository.finalizeEmailVerification({
      userId: user.id,
      tokenHash: 'wrong-hash',
      maxAttempts: 5,
    })

    expect(result.status).toBe('attemptsExceeded')
    expect(update).toHaveBeenCalledWith({
      where: { id: 'token-id' },
      data: { attemptCount: { increment: 1 }, usedAt: expect.any(Date) },
    })
  })

  it('activates a verified email even when the roster row is missing or inactive', async () => {
    const activeUser = { ...user, status: 'ACTIVE', emailVerifiedAt: new Date() }
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(activeUser),
      },
      emailVerificationToken: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'token-id', tokenHash: 'expected-hash', attemptCount: 0,
          expiresAt: new Date(Date.now() + 60_000), usedAt: null,
        }),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
      universityMember: { findUnique: vi.fn().mockResolvedValue(null) },
      studentProfile: { findFirst: vi.fn() },
    }
    vi.spyOn(prisma, '$transaction').mockImplementation(callback => callback(tx))

    const result = await authRepository.finalizeEmailVerification({
      userId: user.id,
      tokenHash: 'expected-hash',
      maxAttempts: 5,
    })

    expect(result).toEqual({ status: 'verified', user: activeUser, rosterMatched: false })
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }))
  })
})
