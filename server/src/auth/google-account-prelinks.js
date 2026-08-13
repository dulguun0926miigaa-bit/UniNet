const requiredPrelinks = new Map([
  ['batzogsoolb@gmail.com', 'staff@num.edu.com'],
])

export function resolveGoogleAccountPrelink(googleEmail) {
  return requiredPrelinks.get(String(googleEmail || '').trim().toLowerCase()) ?? null
}
