import { describe, expect, it } from 'vitest'
import { errorScreenStatus, mongolianErrorMessage } from '../../src/errors/errorMessages.js'

describe('Phase 5E frontend backend-error mapping', () => {
  it('maps authorization, tenant and validation errors to Mongolian messages', () => {
    expect(mongolianErrorMessage({ code: 'TENANT_ACCESS_DENIED' })).toMatch(/Өөр их сургуулийн/)
    expect(mongolianErrorMessage({ code: 'PERMISSION_DENIED' })).toMatch(/зөвшөөрөл/)
    expect(mongolianErrorMessage({ code: 'APPLICATION_STATUS_TRANSITION_INVALID' })).toMatch(/дарааллаар/)
  })

  it('selects dedicated 403, 404 and 500 screens', () => {
    expect(errorScreenStatus({ status: 403 })).toBe(403)
    expect(errorScreenStatus({ status: 404 })).toBe(404)
    expect(errorScreenStatus({ status: 500 })).toBe(500)
    expect(errorScreenStatus({ code: 'NETWORK_ERROR' })).toBe(500)
    expect(errorScreenStatus({ status: 422 })).toBeNull()
  })
})
