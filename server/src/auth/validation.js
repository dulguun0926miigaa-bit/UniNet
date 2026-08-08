import { z } from 'zod'
import { passwordPolicy } from '../utils/password.js'
import { AppError } from '../utils/app-error.js'

const email = z.string().trim().email().transform((value) => value.toLowerCase())
const currentYear = new Date().getUTCFullYear()
const password = z.string().min(passwordPolicy.minLength).regex(
  passwordPolicy.pattern,
  'Нууц үг том, жижиг үсэг, тоо болон тусгай тэмдэг агуулсан байна.',
)

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email,
  password,
  confirmPassword: z.string(),
  studentId: z.string().trim().min(1).max(40).optional(),
  branchSchool: z.string().trim().max(120).optional(),
  major: z.string().trim().max(120).optional(),
  enrollmentYear: z.coerce.number().int().min(1950).max(currentYear).optional(),
  graduationYear: z.coerce.number().int().min(2020).max(2100).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  acceptedTerms: z.literal(true),
}).strict().refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Нууц үг таарахгүй байна.',
})

export const loginSchema = z.object({
  email,
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
}).strict()

export const passwordResetRequestSchema = z.object({ email }).strict()

export const passwordResetOtpVerifySchema = z.object({
  challengeToken: z.string().trim().min(40).max(256),
  code: z.string().trim().regex(/^\d{6}$/, 'OTP код 6 оронтой байна.'),
}).strict()

export const emailVerificationSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'Баталгаажуулах код 6 оронтой байна.'),
}).strict()

export const emailVerificationResendSchema = z.object({ email }).strict()

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(40).max(256),
  password,
  confirmPassword: z.string(),
}).strict().refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Нууц үг таарахгүй байна.',
})

export function validate(schema, payload) {
  const result = schema.safeParse(payload)
  if (result.success) return result.data

  throw new AppError(
    'Оруулсан мэдээллээ шалгана уу.',
    422,
    'VALIDATION_ERROR',
    result.error.flatten().fieldErrors,
  )
}
