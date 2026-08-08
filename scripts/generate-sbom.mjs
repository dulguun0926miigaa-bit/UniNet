import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = path.join(root, 'package-lock.json')
const packagePath = path.join(root, 'package.json')
const outputPath = path.join(root, 'artifacts', 'sbom.cyclonedx.json')
const [lockRaw, packageRaw] = await Promise.all([fs.readFile(lockPath, 'utf8'), fs.readFile(packagePath, 'utf8')])
const lock = JSON.parse(lockRaw)
const manifest = JSON.parse(packageRaw)
const components = []
for (const [packageLocation, metadata] of Object.entries(lock.packages || {})) {
  if (!packageLocation || !metadata?.version) continue
  const name = packageLocation.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/')
  components.push({
    type: 'library',
    name,
    version: metadata.version,
    purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(metadata.version)}`,
    ...(metadata.license ? { licenses: [{ license: { id: metadata.license } }] } : {}),
    properties: [
      { name: 'uninet:dev', value: String(Boolean(metadata.dev)) },
      { name: 'uninet:optional', value: String(Boolean(metadata.optional)) }
    ]
  })
}
components.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))
const document = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: manifest.name, version: manifest.version },
    properties: [{ name: 'uninet:package-lock:sha256', value: crypto.createHash('sha256').update(lockRaw).digest('hex') }]
  },
  components
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`)
console.log(`CycloneDX SBOM written: ${path.relative(root, outputPath)} (${components.length} components)`)
