/**
 * A stand-in for `netlify dev` when the Netlify CLI is not available.
 *
 * It serves the built site from `dist/` and dispatches `/api/*` to the very
 * same function modules Netlify deploys, matching each function's declared
 * `config.path` including `:params`. It exists so the application can be driven
 * in a real browser here; `netlify dev` remains the supported way to run it.
 */
import { BlobsServer } from '@netlify/blobs/server'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const PORT = Number(process.env.PORT ?? 8888)
const DIST = new URL('../dist/', import.meta.url).pathname

/* Local blob store, exactly as `netlify dev` provides one. */
const blobServer = new BlobsServer({
  directory: mkdtempSync(join(tmpdir(), 'nf-blobs-')),
  token: 'local-blobs-token',
  port: 0,
})
const { port: blobPort } = await blobServer.start()
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(
  JSON.stringify({
    edgeURL: `http://127.0.0.1:${blobPort}`,
    uncachedEdgeURL: `http://127.0.0.1:${blobPort}`,
    token: 'local-blobs-token',
    siteID: 'nexalfield-local',
    primaryRegion: 'us-east-1',
  }),
).toString('base64')

/* ---------------------------------------------------------------- *
 * Routing table, read from each function's own config
 * ---------------------------------------------------------------- */

const FUNCTIONS = [
  'questionnaire-session',
  'questionnaire-submit',
  'questionnaire-summary',
  'uploads-init',
  'uploads-chunk',
  'uploads-complete',
  'uploads-delete',
  'admin-auth',
  'admin-projects',
  'admin-project',
  'admin-notes',
  'admin-checklist',
  'admin-file',
  'admin-actions',
]

const routes = []
for (const name of FUNCTIONS) {
  const mod = await import(`../netlify/functions/${name}.mts`)
  const paths = [mod.config?.path].flat().filter(Boolean)
  const excluded = [mod.config?.excludedPath].flat().filter(Boolean)
  for (const path of paths) {
    const names = []
    const pattern = new RegExp(
      `^${path.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
        names.push(key)
        return '([^/]+)'
      })}$`,
    )
    routes.push({ pattern, names, excluded, handler: mod.default, source: name, path })
  }
}

/*
 * Fewer parameters first, then the longer path — so `/api/uploads/init` beats
 * `/api/uploads/:fileId`, and `/api/admin/projects/:id/notes` beats
 * `/api/admin/projects/:id`. Netlify resolves these the same way; the
 * `excludedPath` declarations mean neither of us has to rely on it.
 */
routes.sort((a, b) => a.names.length - b.names.length || b.path.length - a.path.length)

/* ---------------------------------------------------------------- *
 * Static files
 * ---------------------------------------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

async function serveStatic(pathname, res) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const file = join(DIST, safe)
  if (safe !== '/' && existsSync(file) && !file.endsWith('/')) {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
    return
  }
  // Single-page app fallback.
  const html = await readFile(join(DIST, 'index.html'))
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
}

/* ---------------------------------------------------------------- *
 * Server
 * ---------------------------------------------------------------- */

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (!url.pathname.startsWith('/api/')) {
    await serveStatic(url.pathname, res)
    return
  }

  const match = routes
    .filter((route) => !route.excluded.includes(url.pathname))
    .map((route) => ({ route, result: route.pattern.exec(url.pathname) }))
    .find((entry) => entry.result)

  if (!match) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'not_found', message: 'No such endpoint.' } }))
    return
  }

  const params = {}
  match.route.names.forEach((name, index) => {
    params[name] = decodeURIComponent(match.result[index + 1])
  })

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)

  const request = new Request(url.toString(), {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  })

  const waiting = []
  const context = {
    params,
    ip: '127.0.0.1',
    waitUntil: (promise) => waiting.push(promise),
  }

  try {
    const response = await match.route.handler(request, context)
    const headers = {}
    // `set-cookie` must survive as its own header rather than being folded.
    const cookies = []
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') cookies.push(value)
      else headers[key] = value
    })
    res.writeHead(response.status, cookies.length ? { ...headers, 'set-cookie': cookies } : headers)
    const body = response.body ? Buffer.from(await response.arrayBuffer()) : null
    res.end(body)
    await Promise.allSettled(waiting)
  } catch (error) {
    console.error('Function threw:', error)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'server_error', message: 'Internal error.' } }))
  }
}).listen(PORT, () => {
  console.log(`NexalField running at http://localhost:${PORT}`)
  console.log(`  ${routes.length} API routes from ${FUNCTIONS.length} functions`)
})
