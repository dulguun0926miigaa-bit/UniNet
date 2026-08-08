import crypto from 'node:crypto'

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function encodeBase32(buffer) {
  let bits = ''
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0')
  let result = ''
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0')
    result += base32Alphabet[Number.parseInt(chunk, 2)]
  }
  return result
}

export function decodeBase32(value) {
  const normalized = String(value).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char)
    if (index < 0) throw new Error('Invalid base32 value')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

export function generateTotp(secret, counter = Math.floor(Date.now() / 30_000)) {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, '0')
}

export function findTotpStep(secret, code, now = Date.now(), window = 1) {
  const normalized = String(code || '').replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return null
  const currentStep = Math.floor(now / 30_000)
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset
    const expected = generateTotp(secret, step)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return step
  }
  return null
}
