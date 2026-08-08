import { describe, expect, it } from 'vitest'
import { createHttpUrlSchema, optionalHttpUrl } from '../src/validation/safe-url.js'

describe('user supplied URL validation', () => {
  it('accepts HTTP/HTTPS URLs and an explicit empty optional value', () => {
    expect(optionalHttpUrl.parse('https://files.example/cv.pdf')).toBe('https://files.example/cv.pdf')
    expect(optionalHttpUrl.parse('')).toBe('')
  })

  it('rejects active schemes and embedded credentials', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,bad', 'file:///etc/passwd', 'https://user:password@example.com/file']) {
      expect(optionalHttpUrl.safeParse(value).success).toBe(false)
    }
  })

  it('enforces provider domains for social links', () => {
    const githubUrl = createHttpUrlSchema({ hosts: ['github.com'] })
    expect(githubUrl.safeParse('https://github.com/uninet').success).toBe(true)
    expect(githubUrl.safeParse('https://github.com.attacker.example/uninet').success).toBe(false)
  })
})
