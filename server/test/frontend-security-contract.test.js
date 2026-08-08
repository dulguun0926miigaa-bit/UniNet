import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { escapeCsvCell as escapeSurveyCsvCell } from '../src/surveys/survey.validation.js'
import { escapeCsvCell as escapeSharedCsvCell } from '../src/security/csv.js'

const appRoot = resolve(import.meta.dirname, '../..')
function sourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path))
    else if (/\.(?:js|jsx|mjs)$/.test(entry)) files.push(path)
  }
  return files
}

const frontendSource = sourceFiles(resolve(appRoot, 'src'))
const serverSource = sourceFiles(resolve(appRoot, 'server/src'))

describe('Phase 5E injection and browser rendering security contract', () => {
  it('does not introduce raw HTML, eval, Function constructors or javascript URLs in application source', () => {
    for (const file of [...frontendSource, ...serverSource]) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/)
      expect(source, file).not.toMatch(/\beval\s*\(/)
      expect(source, file).not.toMatch(/new\s+Function\s*\(/)
      expect(source, file).not.toMatch(/(?:href|src)\s*=\s*["']javascript:/i)
    }
  })

  it('keeps Prisma access parameterized by rejecting raw SQL APIs in server source', () => {
    for (const file of serverSource) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/\$queryRaw(?:Unsafe)?\b/)
      expect(source, file).not.toMatch(/\$executeRaw(?:Unsafe)?\b/)
    }
  })

  it.each(['=2+2', '+SUM(A1:A2)', '-10+20', '@cmd'])('neutralizes spreadsheet formula payload %s in every CSV helper', value => {
    expect(escapeSurveyCsvCell(value)).toMatch(/^"?'/)
    expect(escapeSharedCsvCell(value)).toMatch(/^"?'/)
  })

  it('keeps strict API and file CSP boundaries', () => {
    const app = readFileSync(resolve(appRoot, 'server/src/app.js'), 'utf8')
    const fileRoutes = readFileSync(resolve(appRoot, 'server/src/files/file.routes.js'), 'utf8')
    expect(app).toContain("defaultSrc: [\"'none'\"]")
    expect(app).toContain("frameAncestors: [\"'none'\"]")
    expect(fileRoutes).toContain("default-src 'none'; sandbox")
  })
})
