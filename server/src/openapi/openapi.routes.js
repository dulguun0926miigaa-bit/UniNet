import { Router } from 'express'
import { openApiDocument } from './openapi.document.js'

const router = Router()
const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function docsHtml(document) {
  const rows = Object.entries(document.paths).flatMap(([path, pathItem]) => (
    Object.entries(pathItem)
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => `<tr><td>${escapeHtml(method.toUpperCase())}</td><td><code>${escapeHtml(path)}</code></td><td>${escapeHtml(operation.summary)}</td></tr>`)
  )).join('')

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniNet API documentation</title></head>
<body>
<main>
<h1>UniNet API ${escapeHtml(document.info.version)}</h1>
<p>${escapeHtml(document.info.summary)}</p>
<p><a href="/api/openapi.json">OpenAPI 3.1 JSON contract</a></p>
<p>This index uses no JavaScript, inline style, remote asset, or form, so it remains compatible with the API Content-Security-Policy.</p>
<table><caption>Documented operations</caption><thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Summary</th></tr></thead><tbody>${rows}</tbody></table>
</main>
</body>
</html>`
}

router.get('/openapi.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.json(openApiDocument)
})

router.get('/docs', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.type('html').send(docsHtml(openApiDocument))
})

export { docsHtml, router as openApiRouter }

