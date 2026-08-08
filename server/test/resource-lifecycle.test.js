import { describe, expect, it } from 'vitest'
import { assertApplicationTransition, assertContentTransition } from '../src/operations/operations.routes.js'

describe('content lifecycle policy', () => {
  it('accepts review/publish/archive path', () => {
    expect(() => assertContentTransition('DRAFT', 'PENDING_APPROVAL')).not.toThrow()
    expect(() => assertContentTransition('PENDING_APPROVAL', 'APPROVED')).not.toThrow()
    expect(() => assertContentTransition('APPROVED', 'PUBLISHED')).not.toThrow()
    expect(() => assertContentTransition('PUBLISHED', 'ARCHIVED')).not.toThrow()
  })

  it('rejects skipping approval states and reopening an archive', () => {
    expect(() => assertContentTransition('PENDING_APPROVAL', 'PUBLISHED')).toThrowError(/шилжих боломжгүй/)
    expect(() => assertContentTransition('ARCHIVED', 'PUBLISHED')).toThrowError(/шилжих боломжгүй/)
  })
})

describe('application lifecycle policy', () => {
  it('supports review through a final decision', () => {
    expect(() => assertApplicationTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow()
    expect(() => assertApplicationTransition('UNDER_REVIEW', 'SHORTLISTED')).not.toThrow()
    expect(() => assertApplicationTransition('SHORTLISTED', 'ACCEPTED')).not.toThrow()
  })

  it('keeps final decisions immutable', () => {
    expect(() => assertApplicationTransition('ACCEPTED', 'REJECTED')).toThrowError(/шилжих боломжгүй/)
    expect(() => assertApplicationTransition('REJECTED', 'UNDER_REVIEW')).toThrowError(/шилжих боломжгүй/)
  })
})
