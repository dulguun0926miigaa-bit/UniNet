import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const topLevelDocuments = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md']
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', 'playwright-report', 'test-results'])

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : markdownFiles(join(directory, entry.name))
    }
    return extname(entry.name).toLowerCase() === '.md' ? [join(directory, entry.name)] : []
  })
}

const files = [
  ...topLevelDocuments.map(name => join(root, name)).filter(existsSync),
  ...markdownFiles(join(root, 'docs')),
]
const failures = []
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  for (const match of content.matchAll(linkPattern)) {
    let target = match[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    if (!target || target.startsWith('#') || /^(?:https?:|mailto:|tel:)/i.test(target)) continue

    target = target.split('#', 1)[0]
    try { target = decodeURIComponent(target) } catch { /* Report the unresolved raw target below. */ }
    const absoluteTarget = resolve(dirname(file), target)
    if (!existsSync(absoluteTarget)) {
      failures.push(`${file.slice(root.length + 1)} -> ${match[1]}`)
      continue
    }
    // Trigger filesystem errors now rather than accepting an inaccessible target.
    statSync(absoluteTarget)
  }
}

if (failures.length) {
  process.stderr.write(`Broken local documentation links:\n${failures.map(item => `- ${item}`).join('\n')}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`Checked ${files.length} Markdown files; local link targets exist.\n`)
}
