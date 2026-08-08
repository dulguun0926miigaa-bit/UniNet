import { describe, expect, it } from 'vitest'
import {
  assertSurveyTransition,
  buildQuestionAggregates,
  escapeCsvCell,
  manageSurveyListQueryInput,
  parseInput,
  publishedSurveyListQueryInput,
  surveyCreateInput,
  surveyIdParamsInput,
  validateSurveyAnswers,
} from '../src/surveys/survey.validation.js'

const questions = [
  { id: 'short', title: 'Нэр', type: 'SHORT_TEXT', required: true, options: [] },
  { id: 'single', title: 'Сонголт', type: 'MULTIPLE_CHOICE', required: true, options: ['A', 'B'] },
  { id: 'many', title: 'Олон сонголт', type: 'CHECKBOXES', required: false, options: ['X', 'Y'] },
  { id: 'rating', title: 'Үнэлгээ', type: 'RATING', required: true, options: [] },
]

describe('survey input validation', () => {
  it('rejects unknown fields and option questions with fewer than two options', () => {
    expect(() => parseInput(surveyCreateInput, {
      title: 'Судалгаа',
      description: 'Тайлбар',
      questions: [{ id: 'q1', title: 'Асуулт', type: 'DROPDOWN', options: ['A'], required: true }],
      unexpected: 'mass assignment',
    })).toThrowError(/Оруулсан мэдээллээ шалгана уу/)
  })


  it('enforces strict UUID params, bounded pagination, and sort/filter allowlists', () => {
    expect(parseInput(surveyIdParamsInput, { id: '00000000-0000-4000-8000-000000000001' })).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
    })
    expect(() => parseInput(surveyIdParamsInput, { id: 'not-a-uuid' })).toThrowError(/Оруулсан мэдээллээ/)
    expect(() => parseInput(publishedSurveyListQueryInput, { pageSize: '51' })).toThrowError(/Оруулсан мэдээллээ/)
    expect(() => parseInput(publishedSurveyListQueryInput, { sortBy: 'createdById' })).toThrowError(/Оруулсан мэдээллээ/)
    expect(() => parseInput(manageSurveyListQueryInput, { visibility: 'SECRET' })).toThrowError(/Оруулсан мэдээллээ/)
    expect(() => parseInput(manageSurveyListQueryInput, { unknown: 'field' })).toThrowError(/Оруулсан мэдээллээ/)
  })

  it('defaults new surveys to private visibility and accepts explicit sharing levels', () => {
    const base = {
      title: 'Судалгаа',
      description: 'Тайлбар',
      questions: ['Нээлттэй асуулт'],
      status: 'DRAFT',
    }
    expect(parseInput(surveyCreateInput, base).visibility).toBe('PRIVATE')
    expect(parseInput(surveyCreateInput, { ...base, visibility: 'PARTNERS' }).visibility).toBe('PARTNERS')
  })
  it('normalizes legacy string questions without trusting arbitrary fields', () => {
    const result = parseInput(surveyCreateInput, {
      title: 'Судалгаа',
      description: 'Тайлбар',
      questions: ['Нээлттэй асуулт'],
      status: 'DRAFT',
    })
    expect(result.questions[0]).toMatchObject({ title: 'Нээлттэй асуулт', type: 'PARAGRAPH', required: false })
  })
})

describe('survey answer validation', () => {
  it('normalizes valid typed answers', () => {
    expect(validateSurveyAnswers(questions, ['  Дөлгөөн  ', 'A', 'X|||Y', '5'])).toEqual(['Дөлгөөн', 'A', 'X|||Y', '5'])
  })

  it('rejects missing required, invalid options, duplicate checkbox values, and invalid ratings', () => {
    expect(() => validateSurveyAnswers(questions, ['', 'A', '', '5'])).toThrowError(/заавал бөглөнө/)
    expect(() => validateSurveyAnswers(questions, ['Дөлгөөн', 'C', '', '5'])).toThrowError(/Зөвшөөрөгдсөн/)
    expect(() => validateSurveyAnswers(questions, ['Дөлгөөн', 'A', 'X|||X', '5'])).toThrowError(/давхардалгүй/)
    expect(() => validateSurveyAnswers(questions, ['Дөлгөөн', 'A', '', '6'])).toThrowError(/1-5/)
  })

  it('requires an answer for every current schema question', () => {
    expect(() => validateSurveyAnswers(questions, ['Дөлгөөн'])).toThrowError(/Бүх асуултын/)
  })
})

describe('survey lifecycle and reporting', () => {
  it('allows defined transitions and prevents unsafe unpublish after responses', () => {
    expect(() => assertSurveyTransition('DRAFT', 'PUBLISHED')).not.toThrow()
    expect(() => assertSurveyTransition('PUBLISHED', 'CLOSED')).not.toThrow()
    expect(() => assertSurveyTransition('PUBLISHED', 'DRAFT', 1)).toThrowError(/Хариулт авсан/)
    expect(() => assertSurveyTransition('ARCHIVED', 'PUBLISHED')).toThrowError(/шилжих боломжгүй/)
  })

  it('builds per-question aggregates', () => {
    const report = buildQuestionAggregates(questions, [
      { answers: ['Нэг', 'A', 'X|||Y', '5'] },
      { answers: ['Хоёр', 'B', 'Y', '4'] },
    ])
    expect(report[1].optionCounts).toEqual({ A: 1, B: 1 })
    expect(report[2].optionCounts).toEqual({ X: 1, Y: 2 })
    expect(report[3].optionCounts).toEqual({ 4: 1, 5: 1 })
  })

  it('neutralizes spreadsheet formulas in CSV cells', () => {
    expect(escapeCsvCell('=HYPERLINK("https://bad")')).toBe('"\'=HYPERLINK(""https://bad"")"')
    expect(escapeCsvCell('normal')).toBe('"normal"')
  })
})
