import { z } from 'zod'

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const domain = z.string().trim().toLowerCase().min(3).max(253).regex(domainPattern)

export const universityIdSchema = z.object({ id: z.string().uuid() }).strict()
export const domainParamsSchema = z.object({ id: z.string().uuid(), domainId: z.string().uuid() }).strict()

export const universityListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE']).optional(),
  sortBy: z.enum(['createdAt', 'name', 'shortName', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict()

export const universityCreateSchema = z.object({
  name: z.string().trim().min(3).max(200),
  shortName: z.string().trim().min(2).max(40),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).optional(),
  logoUrl: z.string().url().max(2000).optional(),
  domain,
  status: z.literal('PENDING').default('PENDING'),
}).strict()

const optionalUrl = z.union([z.string().trim().url().max(2000), z.literal('')]).transform(value => value || null).nullable().optional()
const optionalEmail = z.union([z.string().trim().email().max(320), z.literal('')]).transform(value => value || null).nullable().optional()
const optionalText = maximum => z.union([z.string().trim().max(maximum), z.literal('')]).transform(value => value || null).nullable().optional()
const color = z.union([z.string().trim().regex(/^#[0-9a-fA-F]{6}$/), z.literal('')]).transform(value => value || null).nullable().optional()

export const universityUpdateSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  shortName: z.string().trim().min(2).max(40).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  description: optionalText(2000),
  logoUrl: optionalUrl,
  websiteUrl: optionalUrl,
  address: optionalText(500),
  contactEmail: optionalEmail,
  contactPhone: optionalText(40),
  primaryColor: color,
  secondaryColor: color,
  rectorName: optionalText(160),
  establishedYear: z.union([z.coerce.number().int().min(1800).max(new Date().getFullYear()), z.literal('')]).transform(value => value === '' ? null : value).nullable().optional(),
  profileSettings: z.record(z.string(), z.unknown()).optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'At least one field is required.' })

export const universityStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict()

export const domainCreateSchema = z.object({
  domain,
  isPrimary: z.boolean().default(false),
}).strict()

export const domainVerificationRequestSchema = z.object({
  method: z.enum(['ADMIN_APPROVAL', 'DNS_TXT']),
  evidence: z.string().trim().max(2000).optional(),
}).strict()

export const domainVerificationSchema = z.object({
  evidence: z.string().trim().max(2000).optional(),
}).strict()
