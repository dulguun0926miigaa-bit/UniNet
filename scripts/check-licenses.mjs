import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [lock, policy] = await Promise.all([
  fs.readFile(path.join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
  fs.readFile(path.join(root, 'config', 'license-policy.json'), 'utf8').then(JSON.parse),
])
const allowed = new Set(policy.allowed)
const violations = []
const reviewed = []
for (const [packageLocation, metadata] of Object.entries(lock.packages || {})) {
  if (!packageLocation || !metadata?.version) continue
  const name = packageLocation.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/')
  const identity = `${name}@${metadata.version}`
  const license = metadata.license || policy.overrides[identity]
  if (!license) violations.push(`${identity}: license metadata missing and no reviewed override`)
  else if (policy.deniedPatterns.some(pattern => license.toUpperCase().includes(pattern.toUpperCase()))) violations.push(`${identity}: denied license ${license}`)
  else if (!allowed.has(license)) violations.push(`${identity}: license ${license} is not in allowlist`)
  else reviewed.push({ identity, license })
}
if (violations.length) {
  console.error(`License policy failed (${violations.length}):\n${violations.join('\n')}`)
  process.exit(1)
}
console.log(`License policy passed: ${reviewed.length} locked packages reviewed.`)
