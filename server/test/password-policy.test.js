import { describe, expect, it } from 'vitest'
import { assertNotCommonBreachedPassword } from '../src/auth/password-policy.js'

describe('password risk policy', () => {
  it('blocks common, product-derived and sequence passwords', () => {
    for (const password of ['Password123!', 'UniNetDev!2026', 'My-qwerty-Password!']) {
      expect(() => assertNotCommonBreachedPassword(password)).toThrow()
    }
  })

  it('allows a high-entropy password that is not in the denylist', () => {
    expect(() => assertNotCommonBreachedPassword('Orbit!Cedar9-Falcon#27')).not.toThrow()
  })
})
