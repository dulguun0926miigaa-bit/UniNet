import { describe, expect, it } from 'vitest'
import { decodeBase32, encodeBase32, findTotpStep, generateTotp } from '../src/auth/mfa-totp.js'

describe('TOTP primitives', () => {
  it('round-trips binary secrets through unpadded Base32', () => {
    const secret = Buffer.from('UniNet MFA deterministic test secret', 'utf8')
    expect(decodeBase32(encodeBase32(secret))).toEqual(secret)
  })

  it('matches deterministic HOTP counters used by the six-digit TOTP implementation', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    expect(generateTotp(secret, 0)).toBe('282760')
    expect(generateTotp(secret, 1)).toBe('996554')
    expect(generateTotp(secret, 2)).toBe('602287')
  })

  it('accepts the configured clock window and rejects unrelated codes', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const step = 5000
    const now = step * 30_000
    expect(findTotpStep(secret, generateTotp(secret, step), now)).toBe(step)
    expect(findTotpStep(secret, generateTotp(secret, step - 1), now)).toBe(step - 1)
    expect(findTotpStep(secret, '000000', now)).toBeNull()
  })
})
