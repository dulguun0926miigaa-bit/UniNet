import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { authenticate, requirePermission, requireRole } from '../middleware/authenticate.js'
import { AppError } from '../utils/app-error.js'
import {
  operationsMutationLimiter,
  searchReadLimiter,
  sensitiveReadLimiter,
  surveySubmissionLimiter,
} from '../middleware/rate-limits.js'
import { requireIdempotency } from '../middleware/idempotency.js'
import {
  hasPermission,
  publishedSurveyAudienceScope,
  surveyManagementScope,
  surveyReportScope,
} from '../authorization/policy.js'
import {
  assertSurveyTransition,
  buildQuestionAggregates,
  escapeCsvCell,
  manageSurveyListQueryInput,
  parseInput,
  publishedSurveyListQueryInput,
  responseInput,
  statusInput,
  surveyCreateInput,
  surveyIdParamsInput,
  surveyReportQueryInput,
  surveyUpdateInput,
  validateSurveyAnswers,
} from './survey.validation.js'

const router = Router()
const managerRoles = ['STAFF', 'UNIVERSITY_ADMIN', 'PLATFORM_SUPER_ADMIN']

function surveyId(params) {
  return parseInput(surveyIdParamsInput, params, 'Судалгааны id буруу байна.').id
}

function managementWhere(user, id) {
  return surveyManagementScope(user, id)
}

function reportWhere(user, id) {
  return surveyReportScope(user, id)
}

/** @returns {import('@prisma/client').Prisma.SurveyWhereInput} */
function searchWhere(search) {
  if (!search) return {}
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ],
  }
}

/** @returns {import('@prisma/client').Prisma.SurveyOrderByWithRelationInput[]} */
function orderBy(sortBy, sortOrder) {
  return /** @type {import('@prisma/client').Prisma.SurveyOrderByWithRelationInput[]} */ ([{ [sortBy]: sortOrder }, { id: 'asc' }])
}

async function audienceWhere(user) {
  return publishedSurveyAudienceScope(prisma, user)
}

async function findManagedSurvey(user, id) {
  const survey = await prisma.survey.findFirst({
    where: managementWhere(user, id),
    include: { _count: { select: { responses: true } } },
  })
  if (!survey) throw new AppError('Судалгаа олдсонгүй.', 404, 'SURVEY_NOT_FOUND')
  return survey
}

async function findReportableSurvey(user, id) {
  const survey = await prisma.survey.findFirst({
    where: reportWhere(user, id),
    include: { _count: { select: { responses: true } } },
  })
  if (!survey) throw new AppError('Судалгаа олдсонгүй.', 404, 'SURVEY_NOT_FOUND')
  return survey
}

/** @param {import('@prisma/client').Prisma.TransactionClient | typeof prisma} database */
async function assertPartnerVisibilityAvailable(database, universityId, visibility, status) {
  if (visibility !== 'PARTNERS' || status !== 'PUBLISHED') return
  if (!universityId) {
    throw new AppError('PARTNERS судалгаа сургуультай холбоотой байх ёстой.', 409, 'SURVEY_PARTNER_TENANT_REQUIRED')
  }
  const partnershipCount = await database.partnership.count({
    where: {
      status: 'ACTIVE',
      OR: [
        { requesterUniversityId: universityId },
        { partnerUniversityId: universityId },
      ],
    },
  })
  if (partnershipCount === 0) {
    throw new AppError('Идэвхтэй хамтын ажиллагаагүй үед PARTNERS судалгаа нийтлэх боломжгүй.', 409, 'SURVEY_ACTIVE_PARTNERSHIP_REQUIRED')
  }
}

function auditData(req, action, survey, extra = {}) {
  return {
    actorId: req.auth.user.id,
    universityId: survey.universityId,
    action,
    resourceType: 'SURVEY',
    resourceId: survey.id,
    resourceName: survey.title,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 500),
    ...extra,
  }
}

router.use(authenticate)
router.use(operationsMutationLimiter)

router.get('/', searchReadLimiter, async (req, res, next) => {
  try {
    const query = parseInput(publishedSurveyListQueryInput, req.query, 'Судалгааны жагсаалтын шүүлтүүрээ шалгана уу.')
    const audience = await audienceWhere(req.auth.user)
    const where = /** @type {import('@prisma/client').Prisma.SurveyWhereInput} */ ({
      status: 'PUBLISHED',
      AND: [audience, searchWhere(query.search)],
    })
    const [surveys, total] = await prisma.$transaction([
      prisma.survey.findMany({
        where,
        include: {
          university: { select: { shortName: true } },
          _count: { select: { responses: true } },
        },
        orderBy: orderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.survey.count({ where }),
    ])
    res.json({
      surveys,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize),
      },
    })
  } catch (error) { next(error) }
})

router.get('/manage', searchReadLimiter, requireRole(...managerRoles), requirePermission('canManageSurveys'), async (req, res, next) => {
  try {
    const query = parseInput(manageSurveyListQueryInput, req.query, 'Жагсаалтын шүүлтүүрээ шалгана уу.')
    const where = /** @type {import('@prisma/client').Prisma.SurveyWhereInput} */ ({
      ...managementWhere(req.auth.user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...searchWhere(query.search),
    })
    const [surveys, total] = await prisma.$transaction([
      prisma.survey.findMany({
        where,
        include: { university: { select: { shortName: true } }, _count: { select: { responses: true } } },
        orderBy: orderBy(query.sortBy, query.sortOrder),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.survey.count({ where }),
    ])
    res.json({
      surveys,
      pagination: { page: query.page, pageSize: query.pageSize, total, pageCount: Math.ceil(total / query.pageSize) },
    })
  } catch (error) { next(error) }
})

router.post('/', requireRole(...managerRoles), requirePermission('canManageSurveys'), requireIdempotency, async (req, res, next) => {
  try {
    const input = parseInput(surveyCreateInput, req.body, 'Судалгааны мэдээллээ шалгана уу.')
    const universityId = req.auth.user.universityId ?? null
    if (!universityId && req.auth.user.role !== 'PLATFORM_SUPER_ADMIN') {
      throw new AppError('Судалгаа үүсгэх сургууль тодорхойгүй байна.', 409, 'UNIVERSITY_REQUIRED')
    }
    if (!universityId && !['NETWORK', 'PUBLIC'].includes(input.visibility)) {
      throw new AppError('Platform survey нь NETWORK эсвэл PUBLIC visibility-тэй байна.', 422, 'SURVEY_PLATFORM_VISIBILITY_INVALID')
    }

    const survey = await prisma.$transaction(async transaction => {
      await assertPartnerVisibilityAvailable(transaction, universityId, input.visibility, input.status)
      const created = await transaction.survey.create({
        data: {
          ...input,
          publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
          universityId,
          createdById: req.auth.user.id,
        },
      })
      await transaction.auditLog.create({
        data: auditData(req, 'SURVEY_CREATED', created, {
          nextData: { status: created.status, visibility: created.visibility },
        }),
      })
      return created
    })
    res.status(201).json({ survey })
  } catch (error) { next(error) }
})

router.get('/:id/report', requireRole(...managerRoles), requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const id = surveyId(req.params)
    const query = parseInput(surveyReportQueryInput, req.query, 'Тайлангийн pagination буруу байна.')
    const survey = await findReportableSurvey(req.auth.user, id)
    const [responses, allResponses, responseCount] = await prisma.$transaction([
      prisma.surveyResponse.findMany({
        where: { surveyId: survey.id },
        select: { id: true, answers: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.surveyResponse.findMany({ where: { surveyId: survey.id }, select: { answers: true } }),
      prisma.surveyResponse.count({ where: { surveyId: survey.id } }),
    ])
    res.json({
      survey: { ...survey, responses },
      report: {
        responseCount,
        completionStatus: responseCount ? 'RESPONSES_RECEIVED' : 'WAITING',
        questions: buildQuestionAggregates(survey.questions, allResponses),
      },
      pagination: { page: query.page, pageSize: query.pageSize, total: responseCount, pageCount: Math.ceil(responseCount / query.pageSize) },
    })
  } catch (error) { next(error) }
})

router.get('/:id/responses.csv', sensitiveReadLimiter, requireRole(...managerRoles), requirePermission('canViewReports'), async (req, res, next) => {
  try {
    const survey = await findReportableSurvey(req.auth.user, surveyId(req.params))
    const responses = await prisma.surveyResponse.findMany({
      where: { surveyId: survey.id },
      select: { id: true, submittedAt: true, answers: true },
      orderBy: { submittedAt: 'asc' },
    })
    const questions = Array.isArray(survey.questions) ? survey.questions : []
    const header = ['responseId', 'submittedAt', ...questions.map((question, index) => {
      if (typeof question === 'string') return question
      if (question && typeof question === 'object' && !Array.isArray(question) && typeof question.title === 'string') return question.title
      return `Question ${index + 1}`
    })]
    const rows = responses.map(response => [
      response.id,
      response.submittedAt.toISOString(),
      ...(Array.isArray(response.answers) ? response.answers : []),
    ])
    const csv = `\uFEFF${[header, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`
    await prisma.auditLog.create({ data: auditData(req, 'SURVEY_RESPONSES_EXPORTED', survey, { nextData: { responseCount: responses.length } }) })
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-${survey.id}.csv"`,
      'Cache-Control': 'private, no-store',
    })
    res.send(csv)
  } catch (error) { next(error) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = surveyId(req.params)
    const canManage = managerRoles.includes(req.auth.user.role) && hasPermission(req.auth.user, 'canManageSurveys')
    const scope = /** @type {import('@prisma/client').Prisma.SurveyWhereInput} */ (canManage
      ? managementWhere(req.auth.user)
      : { status: 'PUBLISHED', ...(await audienceWhere(req.auth.user)) })
    const survey = await prisma.survey.findFirst({
      where: { id, ...scope },
      include: { university: { select: { shortName: true } }, _count: { select: { responses: true } } },
    })
    if (!survey) throw new AppError('Судалгаа олдсонгүй.', 404, 'SURVEY_NOT_FOUND')
    res.json({ survey })
  } catch (error) { next(error) }
})

router.patch('/:id', requireRole(...managerRoles), requirePermission('canManageSurveys'), async (req, res, next) => {
  try {
    const id = surveyId(req.params)
    const input = parseInput(surveyUpdateInput, req.body, 'Судалгааны мэдээллээ шалгана уу.')
    const existing = await findManagedSurvey(req.auth.user, id)
    if (existing.status !== 'DRAFT' || existing._count.responses > 0) {
      throw new AppError('Зөвхөн хариултгүй ноорог судалгааг засах боломжтой.', 409, 'SURVEY_NOT_EDITABLE')
    }
    if (!existing.universityId && input.visibility && !['NETWORK', 'PUBLIC'].includes(input.visibility)) {
      throw new AppError('Platform survey нь NETWORK эсвэл PUBLIC visibility-тэй байна.', 422, 'SURVEY_PLATFORM_VISIBILITY_INVALID')
    }
    const survey = await prisma.$transaction(async transaction => {
      const updated = await transaction.survey.update({
        where: { id: existing.id },
        data: { ...input, ...(input.questions ? { schemaVersion: { increment: 1 } } : {}) },
      })
      await transaction.auditLog.create({
        data: auditData(req, 'SURVEY_UPDATED', updated, {
          previousData: { updatedAt: existing.updatedAt, visibility: existing.visibility },
          nextData: { fields: Object.keys(input), visibility: updated.visibility },
        }),
      })
      return updated
    })
    res.json({ survey })
  } catch (error) { next(error) }
})

router.patch('/:id/status', requireRole(...managerRoles), requirePermission('canManageSurveys'), async (req, res, next) => {
  try {
    const id = surveyId(req.params)
    const input = parseInput(statusInput, req.body, 'Судалгааны төлвөө шалгана уу.')
    const existing = await findManagedSurvey(req.auth.user, id)
    assertSurveyTransition(existing.status, input.status, existing._count.responses)
    const survey = await prisma.$transaction(async transaction => {
      await assertPartnerVisibilityAvailable(transaction, existing.universityId, existing.visibility, input.status)
      const updated = await transaction.survey.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          ...(input.status === 'PUBLISHED' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
          ...(input.status === 'DRAFT' ? { publishedAt: null } : {}),
        },
      })
      await transaction.auditLog.create({
        data: auditData(req, 'SURVEY_STATUS_CHANGED', updated, {
          previousData: { status: existing.status },
          nextData: { status: updated.status, visibility: updated.visibility },
        }),
      })
      return updated
    })
    res.json({ survey })
  } catch (error) { next(error) }
})

router.delete('/:id', requireRole(...managerRoles), requirePermission('canManageSurveys'), async (req, res, next) => {
  try {
    const survey = await findManagedSurvey(req.auth.user, surveyId(req.params))
    if (survey.status !== 'DRAFT' || survey._count.responses > 0) {
      throw new AppError('Зөвхөн хариултгүй ноорог судалгааг устгах боломжтой.', 409, 'SURVEY_NOT_DELETABLE')
    }
    await prisma.$transaction(async transaction => {
      await transaction.survey.delete({ where: { id: survey.id } })
      await transaction.auditLog.create({ data: auditData(req, 'SURVEY_DELETED', survey, { previousData: { status: survey.status } }) })
    })
    res.status(204).end()
  } catch (error) { next(error) }
})

router.post('/:id/responses', surveySubmissionLimiter, requireRole('STUDENT'), requireIdempotency, async (req, res, next) => {
  try {
    const id = surveyId(req.params)
    const input = parseInput(responseInput, req.body, 'Хариултаа шалгана уу.')
    const survey = await prisma.survey.findFirst({
      where: {
        id,
        status: 'PUBLISHED',
        ...(await audienceWhere(req.auth.user)),
      },
    })
    if (!survey) throw new AppError('Судалгаа олдсонгүй эсвэл хаагдсан байна.', 404, 'SURVEY_NOT_FOUND')
    const answers = validateSurveyAnswers(survey.questions, input.answers)
    const response = await prisma.$transaction(async transaction => {
      const created = await transaction.surveyResponse.create({
        data: {
          surveyId: survey.id,
          userId: req.auth.user.id,
          answers,
          surveySchemaVersion: survey.schemaVersion,
        },
      })
      await transaction.auditLog.create({ data: auditData(req, 'SURVEY_RESPONSE_SUBMITTED', survey) })
      return created
    })
    res.status(201).json({ response })
  } catch (error) {
    if (error.code === 'P2002') return next(new AppError('Та энэ судалгааг бөглөсөн байна.', 409, 'SURVEY_ALREADY_SUBMITTED'))
    next(error)
  }
})

export { router as surveyRouter }
