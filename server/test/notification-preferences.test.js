import { describe, expect, it } from 'vitest'
import { notificationPreferenceAllows } from '../src/notifications/notification.service.js'

describe('in-app notification preference enforcement', () => {
  it('defaults missing preferences to enabled', () => {
    expect(notificationPreferenceAllows(null, 'APPLICATION_STATUS')).toBe(true)
    expect(notificationPreferenceAllows({}, 'EVENT')).toBe(true)
  })

  it('honors the global in-app switch', () => {
    expect(notificationPreferenceAllows({ inApp: false }, 'SYSTEM')).toBe(false)
    expect(notificationPreferenceAllows({ inApp: false, waitlist: true }, 'WAITLIST_PROMOTED')).toBe(false)
  })

  it('maps event, application, waitlist, survey and announcement categories', () => {
    expect(notificationPreferenceAllows({ opportunities: false }, 'EVENT')).toBe(false)
    expect(notificationPreferenceAllows({ applicationStatus: false }, 'APPLICATION_STATUS')).toBe(false)
    expect(notificationPreferenceAllows({ waitlist: false }, 'WAITLIST_PROMOTED')).toBe(false)
    expect(notificationPreferenceAllows({ surveyDeadline: false }, 'SURVEY_DEADLINE')).toBe(false)
    expect(notificationPreferenceAllows({ announcements: false }, 'ANNOUNCEMENT')).toBe(false)
  })
})
