import request from 'supertest'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { endpointDefinitions, openApiDocument } from '../src/openapi/openapi.document.js'

const operationMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'])

function resolveLocalReference(document, reference) {
  expect(reference).toMatch(/^#\//)
  return reference.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document)
}

function visit(value, callback) {
  if (!value || typeof value !== 'object') return
  callback(value)
  for (const child of Object.values(value)) visit(child, callback)
}

function requestRequiredFields(document, operation) {
  const requestSchema = operation.requestBody?.content?.['application/json']?.schema
  if (!requestSchema) return []
  const resolved = requestSchema.$ref ? resolveLocalReference(document, requestSchema.$ref) : requestSchema
  return [...(resolved.required || [])].sort()
}

function securitySignature(operation) {
  if (!operation.security.length) return 'public'
  return Object.keys(operation.security[0]).sort().join(',')
}

function operationAt(document, signature) {
  const space = signature.indexOf(' ')
  const method = signature.slice(0, space).toLowerCase()
  const path = signature.slice(space + 1)
  return document.paths[path]?.[method]
}

describe('OpenAPI contract', () => {
  it('is JSON serializable and documents every declared operation exactly once', () => {
    const parsed = JSON.parse(JSON.stringify(openApiDocument))
    expect(parsed.openapi).toBe('3.1.0')
    expect(parsed.info.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(endpointDefinitions).toHaveLength(138)

    const expected = new Set(endpointDefinitions.map(([method, path]) => `${method.toUpperCase()} ${path}`))
    const documented = new Set()
    const operationIds = new Set()

    for (const [path, pathItem] of Object.entries(parsed.paths)) {
      expect(path.startsWith('/')).toBe(true)
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operationMethods.has(method)) continue
        const key = `${method.toUpperCase()} ${path}`
        expect(expected.has(key), `Unexpected operation ${key}`).toBe(true)
        expect(documented.has(key), `Duplicate operation ${key}`).toBe(false)
        documented.add(key)
        expect(operation.operationId).toBeTruthy()
        expect(operationIds.has(operation.operationId), `Duplicate operationId ${operation.operationId}`).toBe(false)
        operationIds.add(operation.operationId)
        expect(Object.keys(operation.responses).some(status => /^2\d\d$/.test(status))).toBe(true)
        expect(Array.isArray(operation.security)).toBe(true)

        const pathVariables = [...path.matchAll(/{([^}]+)}/g)].map(match => match[1])
        for (const variable of pathVariables) {
          const parameters = (operation.parameters || []).map(item => item.$ref ? resolveLocalReference(parsed, item.$ref) : item)
          expect(parameters.some(item => item?.in === 'path' && item.name === variable && item.required === true), `Missing path parameter ${variable} for ${key}`).toBe(true)
        }
      }
    }

    expect(documented).toEqual(expected)
  })

  it('resolves every local reference and uses only declared security schemes', () => {
    visit(openApiDocument, value => {
      if ('$ref' in value) expect(resolveLocalReference(openApiDocument, value.$ref), `Unresolved ${value.$ref}`).toBeTruthy()
    })

    for (const pathItem of Object.values(openApiDocument.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operationMethods.has(method)) continue
        for (const requirement of operation.security) {
          for (const scheme of Object.keys(requirement)) {
            expect(openApiDocument.components.securitySchemes[scheme], `Unknown security scheme ${scheme}`).toBeTruthy()
          }
        }
      }
    }

    expect(openApiDocument.paths['/api/public/bootstrap'].get.security).toEqual([])
    expect(openApiDocument.paths['/api/auth/refresh'].post.security).toEqual([{ refreshCookie: [] }])
    expect(openApiDocument.paths['/api/student/bootstrap'].get.security).toEqual([{ bearerAuth: [] }])
    expect(openApiDocument.paths['/api/memberships/invitations/accept'].post.security).toEqual([])
  })

  it('preserves the checked-in v1 backward-compatibility baseline', () => {
    const baseline = readFileSync(new URL('./fixtures/openapi-v1-baseline.txt', import.meta.url), 'utf8')
      .trim()
      .split(/\r?\n/)
      .map(line => line.split('|'))

    for (const [signature, operationId, security, statuses, requiredFields] of baseline) {
      const operation = operationAt(openApiDocument, signature)
      expect(operation, `Removed v1 operation ${signature}`).toBeTruthy()
      expect(operation.operationId, `Changed operationId for ${signature}`).toBe(operationId)
      expect(securitySignature(operation), `Changed security contract for ${signature}`).toBe(security)
      for (const status of statuses.split(',').filter(Boolean)) {
        expect(operation.responses[status], `Removed successful status ${status} from ${signature}`).toBeTruthy()
      }
      const previousRequired = new Set(requiredFields.split(',').filter(Boolean))
      const newlyRequired = requestRequiredFields(openApiDocument, operation).filter(field => !previousRequired.has(field))
      expect(newlyRequired, `Added required request fields to ${signature}`).toEqual([])
    }
  })

  it('serves JSON and a script-free index under the active CSP', async () => {
    const contract = await request(app).get('/api/openapi.json').expect(200).expect('Content-Type', /json/)
    expect(contract.body.openapi).toBe('3.1.0')
    expect(contract.headers['cache-control']).toContain('max-age=300')

    const docs = await request(app).get('/api/docs').expect(200).expect('Content-Type', /html/)
    expect(docs.headers['content-security-policy']).toContain("default-src 'none'")
    expect(docs.text).toContain('/api/openapi.json')
    expect(docs.text).not.toMatch(/<script|<style|\sstyle=|<form/i)
  })
})
