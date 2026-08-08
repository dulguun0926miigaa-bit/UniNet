import { AppError } from '../utils/app-error.js'

// High-confidence local denylist. It is intentionally small, deterministic and
// never sends the user's password to an external service.
const commonBreachedPasswords = new Set([
  'password', 'password1', 'password123', 'qwerty', 'qwerty123', '123456', '12345678',
  '123456789', '1234567890', '111111', '000000', 'abc123', 'admin', 'admin123',
  'letmein', 'welcome', 'welcome123', 'iloveyou', 'monkey', 'dragon', 'football',
  'princess', 'sunshine', 'passw0rd', 'p@ssw0rd', 'qwertyuiop', '1q2w3e4r',
  'zaq12wsx', 'password!', 'changeme', 'secret123', 'uninet123', 'uninetdev!2026',
])

export function assertNotCommonBreachedPassword(password) {
  const normalized = String(password || '').normalize('NFKC').trim().toLowerCase()
  const compact = normalized.replace(/[^a-z0-9@!$#]/g, '')
  if (commonBreachedPasswords.has(normalized) || commonBreachedPasswords.has(compact)) {
    throw new AppError('Энэ нууц үг нийтлэг эсвэл задруулсан жагсаалтад байна. Өөр хүчтэй нууц үг сонгоно уу.', 422, 'PASSWORD_BREACHED_OR_COMMON')
  }
  const obviousSequences = ['123456', 'abcdef', 'qwerty', 'asdfgh', 'password', 'admin', 'uninet']
  if (obviousSequences.some(sequence => normalized.includes(sequence))) {
    throw new AppError('Нууц үг нийтлэг үг эсвэл дараалал агуулж байна.', 422, 'PASSWORD_TOO_COMMON')
  }
}
