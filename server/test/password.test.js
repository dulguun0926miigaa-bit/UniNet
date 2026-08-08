import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/utils/password.js'

describe('password hashing', () => {
  it('uses a salted Argon2id hash and verifies it', async () => {
    const password = 'Secure!Pass123'
    const first = await hashPassword(password)
    const second = await hashPassword(password)
    expect(first).toMatch(/^\$argon2id\$/)
    expect(first).not.toBe(second)
    expect(await verifyPassword(first, password)).toBe(true)
    expect(await verifyPassword(first, 'wrong-password')).toBe(false)
  })
})
