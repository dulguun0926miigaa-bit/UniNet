const suspiciousPatterns = [
  /\bunion\s+(?:all\s+)?select\b/i,
  /\b(?:or|and)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
  /;\s*(?:drop|alter|truncate)\s+(?:table|schema|database)\b/i,
  /\b(?:pg_sleep|benchmark|sleep)\s*\(/i,
  /\binformation_schema\b/i,
  /\bxp_cmdshell\b/i,
  /(?:--|#)\s*(?:$|\n)/,
  /\/\*[\s\S]*?\*\//,
]

export function findSuspiciousSqlInput(value, path = 'request') {
  if (typeof value === 'string') {
    const limited = value.slice(0, 20_000)
    const pattern = suspiciousPatterns.find(candidate => candidate.test(limited))
    return pattern ? { path, signature: pattern.source.slice(0, 80) } : null
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSuspiciousSqlInput(value[index], `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const found = findSuspiciousSqlInput(nested, `${path}.${key}`)
      if (found) return found
    }
  }
  return null
}
