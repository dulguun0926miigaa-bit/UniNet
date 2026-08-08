import { describe, expect, it } from 'vitest'
import {
  emailVerificationResendSchema,
  emailVerificationSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from '../src/auth/validation.js'

describe('auth validation', () => {
  it('normalizes a valid university email', () => {
    const result = registerSchema.parse({
      firstName: 'Дөлгөөн',
      lastName: 'Бат',
      email: ' Student@MUIS.EXAMPLE ',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
    })
    expect(result.email).toBe('student@muis.example')
  })


  it('accepts current/past enrollment years and rejects future years', () => {
    const currentYear = new Date().getUTCFullYear()
    const base = {
      firstName: 'Test',
      lastName: 'Student',
      email: 'student@muis.example',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
    }
    expect(registerSchema.safeParse({ ...base, enrollmentYear: currentYear }).success).toBe(true)
    expect(registerSchema.safeParse({ ...base, enrollmentYear: currentYear - 8 }).success).toBe(true)
    expect(registerSchema.safeParse({ ...base, enrollmentYear: currentYear + 1 }).success).toBe(false)
  })

  it('rejects a weak password', () => {
    const result = registerSchema.safeParse({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@muis.example',
      password: 'password',
      confirmPassword: 'password',
      acceptedTerms: true,
      role: 'PLATFORM_SUPER_ADMIN',
    })
    expect(result.success).toBe(false)
  })

  it('rejects client supplied role and universityId instead of silently accepting mass-assignment fields', () => {
    const result = registerSchema.safeParse({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@muis.example',
      password: 'Secure!Pass123',
      confirmPassword: 'Secure!Pass123',
      acceptedTerms: true,
      role: 'PLATFORM_SUPER_ADMIN',
      universityId: 'fake-university',
    })
    expect(result.success).toBe(false)
  })

  it('requires login credentials', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: '' }).success).toBe(false)
  })

  it('validates normalized email verification and six-digit codes', () => {
    expect(emailVerificationSchema.parse({ email: ' Student@Example.com ', code: '123456' })).toEqual({
      email: 'student@example.com',
      code: '123456',
    })
    expect(emailVerificationSchema.safeParse({ email: 'student@example.com', code: '12345a' }).success).toBe(false)
    expect(emailVerificationResendSchema.safeParse({ email: 'student@example.com', role: 'STUDENT' }).success).toBe(false)
  })

  it('validates password reset request and confirmation input', () => {
    expect(passwordResetRequestSchema.parse({ email: ' User@Example.com ' })).toEqual({
      email: 'user@example.com',
    })
    expect(passwordResetConfirmSchema.safeParse({
      token: 'a'.repeat(43),
      password: 'NewSecure!Pass123',
      confirmPassword: 'does-not-match',
    }).success).toBe(false)
  })
})
