import { z } from 'zod'
import { AppError } from '../utils/app-error.js'

export const SURVEY_STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']
export const SURVEY_VISIBILITIES = ['PRIVATE', 'PARTNERS', 'NETWORK', 'PUBLIC']
export const SURVEY_QUESTION_TYPES = [
  'SHORT_TEXT',
  'PARAGRAPH',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'RATING',
]

const optionQuestionTypes = new Set(['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'])

export const questionInput = z.object({
  id: z.string().trim().min(1).max(80),
  title: z.string().trim().min(2).max(500),
  type: z.enum(SURVEY_QUESTION_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
}).strict().superRefine((question, context) => {
  if (optionQuestionTypes.has(question.type) && question.options.length < 2) {
    context.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'Сонголттой асуулт хамгийн багадаа хоёр сонголттой байна.',
    })
  }
  if (new Set(question.options).size !== question.options.length) {
    context.addIssue({ code: 'custom', path: ['options'], message: 'Сонголтууд давхардаж болохгүй.' })
  }
})

const legacyQuestion = z.string().trim().min(2).max(500).transform((title) => ({
  id: `legacy-${Buffer.from(title).toString('base64url').slice(0, 48)}`,
  title,
  type: 'PARAGRAPH',
  required: false,
  options: [],
}))

const surveyFields = {
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(3).max(2000),
  questions: z.array(z.union([legacyQuestion, questionInput])).min(1).max(20),
  visibility: z.enum(SURVEY_VISIBILITIES).default('PRIVATE'),
}

function validateQuestionIds(survey, context) {
  if (!survey.questions) return
  const ids = survey.questions.map(question => question.id)
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['questions'], message: 'Асуултын id давхардаж болохгүй.' })
  }
}

export const surveyCreateInput = z.object({
  ...surveyFields,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
}).strict().superRefine(validateQuestionIds)

export const surveyUpdateInput = z.object(surveyFields)
  .partial()
  .strict()
  .superRefine(validateQuestionIds)
  .refine(input => Object.keys(input).length > 0, { message: 'Өөрчлөх талбар оруулна уу.' })

export const responseInput = z.object({
  answers: z.array(z.string().max(4000)).min(1).max(20),
}).strict()

export const statusInput = z.object({
  status: z.enum(SURVEY_STATUSES),
}).strict()

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}

const searchField = z.string().trim().min(2).max(100).optional()
const sortOrderField = z.enum(['asc', 'desc']).default('desc')

export const surveyIdParamsInput = z.object({
  id: z.string().uuid(),
}).strict()

export const publishedSurveyListQueryInput = z.object({
  ...paginationFields,
  search: searchField,
  sortBy: z.enum(['publishedAt', 'title']).default('publishedAt'),
  sortOrder: sortOrderField,
}).strict()

export const manageSurveyListQueryInput = z.object({
  ...paginationFields,
  search: searchField,
  status: z.enum(SURVEY_STATUSES).optional(),
  visibility: z.enum(SURVEY_VISIBILITIES).optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'title', 'status']).default('updatedAt'),
  sortOrder: sortOrderField,
}).strict()

export const surveyReportQueryInput = z.object(paginationFields).strict()

export function parseInput(schema, value, message = 'Оруулсан мэдээллээ шалгана уу.') {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new AppError(message, 422, 'VALIDATION_ERROR', result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    })))
  }
  return result.data
}

function asQuestion(question, index) {
  if (typeof question === 'string') {
    return { id: `legacy-${index}`, title: question, type: 'PARAGRAPH', required: false, options: [] }
  }
  return question
}

export function validateSurveyAnswers(questionsValue, answersValue) {
  const questions = Array.isArray(questionsValue) ? questionsValue.map(asQuestion) : []
  if (answersValue.length !== questions.length) {
    throw new AppError('Бүх асуултын хариултыг ижил дарааллаар илгээнэ үү.', 422, 'SURVEY_ANSWER_COUNT_MISMATCH')
  }

  return questions.map((question, index) => {
    const raw = answersValue[index]
    const answer = raw.trim()
    if (question.required && !answer) {
      throw new AppError(`“${question.title}” асуултыг заавал бөглөнө үү.`, 422, 'SURVEY_REQUIRED_ANSWER', { questionId: question.id })
    }
    if (!answer) return ''

    if (question.type === 'SHORT_TEXT' && answer.length > 500) {
      throw new AppError('Богино хариулт 500 тэмдэгтээс урт байж болохгүй.', 422, 'SURVEY_ANSWER_TOO_LONG', { questionId: question.id })
    }
    if (['MULTIPLE_CHOICE', 'DROPDOWN'].includes(question.type) && !question.options.includes(answer)) {
      throw new AppError('Зөвшөөрөгдсөн сонголтоос сонгоно уу.', 422, 'SURVEY_OPTION_INVALID', { questionId: question.id })
    }
    if (question.type === 'CHECKBOXES') {
      const selected = answer.split('|||').map(value => value.trim()).filter(Boolean)
      if (!selected.length || selected.length !== new Set(selected).size || selected.some(value => !question.options.includes(value))) {
        throw new AppError('Checkbox хариултад зөвшөөрөгдсөн давхардалгүй сонголт илгээнэ үү.', 422, 'SURVEY_OPTION_INVALID', { questionId: question.id })
      }
      return selected.join('|||')
    }
    if (question.type === 'RATING' && !['1', '2', '3', '4', '5'].includes(answer)) {
      throw new AppError('Үнэлгээ 1-5 хооронд байна.', 422, 'SURVEY_RATING_INVALID', { questionId: question.id })
    }
    return answer
  })
}

export function assertSurveyTransition(currentStatus, nextStatus, responseCount = 0) {
  if (currentStatus === nextStatus) return
  const allowed = {
    DRAFT: ['PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['DRAFT', 'CLOSED'],
    CLOSED: ['PUBLISHED', 'ARCHIVED'],
    ARCHIVED: [],
  }
  if (!allowed[currentStatus]?.includes(nextStatus)) {
    throw new AppError(`${currentStatus} төлвөөс ${nextStatus} төлөв рүү шилжих боломжгүй.`, 409, 'SURVEY_STATUS_TRANSITION_INVALID')
  }
  if (currentStatus === 'PUBLISHED' && nextStatus === 'DRAFT' && responseCount > 0) {
    throw new AppError('Хариулт авсан судалгааг ноорог болгох боломжгүй. Хаах үйлдэл ашиглана уу.', 409, 'SURVEY_HAS_RESPONSES')
  }
}

export function buildQuestionAggregates(questionsValue, responses) {
  const questions = Array.isArray(questionsValue) ? questionsValue.map(asQuestion) : []
  return questions.map((question, index) => {
    const answers = responses.map(response => response.answers?.[index]).filter(value => typeof value === 'string' && value.trim())
    const optionCounts = {}
    if (optionQuestionTypes.has(question.type) || question.type === 'RATING') {
      for (const answer of answers) {
        const values = question.type === 'CHECKBOXES' ? answer.split('|||') : [answer]
        for (const value of values) optionCounts[value] = (optionCounts[value] || 0) + 1
      }
    }
    return {
      questionId: question.id,
      title: question.title,
      type: question.type,
      answeredCount: answers.length,
      skippedCount: responses.length - answers.length,
      optionCounts,
    }
  })
}

export function escapeCsvCell(value) {
  let safeValue = String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  if (/^[=+\-@]/.test(safeValue.trimStart())) safeValue = `'${safeValue}`
  return `"${safeValue.replaceAll('"', '""')}"`
}
