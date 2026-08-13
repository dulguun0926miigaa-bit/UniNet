import { describe, expect, it } from 'vitest'
import { resolveGoogleAccountPrelink } from '../src/auth/google-account-prelinks.js'

describe('Google account prelinks', () => {
  it('maps the verified Batzogsool Gmail identity to the requested Staff account', () => {
    expect(resolveGoogleAccountPrelink('BatzogsoolB@GMAIL.COM')).toBe('staff@num.edu.com')
  })

  it('does not map an unconfigured Google identity', () => {
    expect(resolveGoogleAccountPrelink('another@gmail.com')).toBeNull()
  })
})
