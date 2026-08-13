import { describe, expect, it } from 'vitest'
import {
  resolveGoogleAccountPrelink,
  resolveGoogleAccountPrelinkConfig,
  resolveLegacyGoogleAccountPrelink,
} from '../src/auth/google-account-prelinks.js'

describe('Google account prelinks', () => {
  it('maps the verified Batzogsool Gmail identity to the requested Staff account', () => {
    expect(resolveGoogleAccountPrelink('BatzogsoolB@GMAIL.COM')).toBe('staff@num.edu.com')
    expect(resolveLegacyGoogleAccountPrelink('BatzogsoolB@GMAIL.COM')).toBe('staff@num.edu.mn')
    expect(resolveGoogleAccountPrelinkConfig('BatzogsoolB@GMAIL.COM')).toMatchObject({
      universitySlug: 'muis',
      firstName: 'Batzogsool',
      lastName: 'Batjargal',
    })
  })

  it('does not map an unconfigured Google identity', () => {
    expect(resolveGoogleAccountPrelink('another@gmail.com')).toBeNull()
    expect(resolveLegacyGoogleAccountPrelink('another@gmail.com')).toBeNull()
    expect(resolveGoogleAccountPrelinkConfig('another@gmail.com')).toBeNull()
  })
})
