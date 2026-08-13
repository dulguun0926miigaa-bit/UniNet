const requiredPrelinks = new Map([
  ['batzogsoolb@gmail.com', {
    accountEmail: 'staff@num.edu.com',
    legacyAccountEmail: 'staff@num.edu.mn',
    universitySlug: 'muis',
    firstName: 'Batzogsool',
    lastName: 'Batjargal',
  }],
])

export function resolveGoogleAccountPrelinkConfig(googleEmail) {
  return requiredPrelinks.get(String(googleEmail || '').trim().toLowerCase()) ?? null
}

export function resolveGoogleAccountPrelink(googleEmail) {
  return resolveGoogleAccountPrelinkConfig(googleEmail)?.accountEmail ?? null
}

export function resolveLegacyGoogleAccountPrelink(googleEmail) {
  return resolveGoogleAccountPrelinkConfig(googleEmail)?.legacyAccountEmail ?? null
}
