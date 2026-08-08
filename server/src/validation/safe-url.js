import { z } from 'zod'

/** @param {{ hosts?: string[] }} [options] */
export function createHttpUrlSchema({ hosts } = {}) {
  return z.string().trim().max(2000).superRefine((value, context) => {
    let parsed
    try { parsed = new URL(value) } catch {
      context.addIssue({ code: 'custom', message: 'URL формат буруу байна.' })
      return
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      context.addIssue({ code: 'custom', message: 'Зөвхөн HTTP/HTTPS холбоос зөвшөөрнө.' })
    }
    if (parsed.username || parsed.password) {
      context.addIssue({ code: 'custom', message: 'URL дотор credential оруулж болохгүй.' })
    }
    if (hosts?.length && !hosts.some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
      context.addIssue({ code: 'custom', message: `Зөвшөөрөгдсөн domain: ${hosts.join(', ')}` })
    }
  })
}

export const httpUrl = createHttpUrlSchema()
export const optionalHttpUrl = httpUrl.or(z.literal(''))
