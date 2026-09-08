/**
 * Runs the built site and the real API locally.
 *
 * `/api/*` goes through `api/[...path].ts` — the same entry point Vercel calls,
 * so what is tested here is the deployed code path rather than a stand-in.
 * Everything else is served from `dist/`, with the single-page-app fallback
 * that vercel.json and netlify.toml both declare.
 *
 * Netlify Blobs is unavailable outside Netlify, so uploads use the Postgres
 * backend here, exactly as they will on Vercel.
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const PORT = Number(process.env.PORT ?? 8888)
const DIST = new URL('../dist/', import.meta.url).pathname

const { default: api } = await import('../api/[...path].ts')
const { ROUTES } = await import('../netlify/lib/router.ts')

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

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)

  const request = new Request(url.toString(), {
    method: req.method,
    // The entry point reads the caller's address from this, as it does on
    // Vercel.
    headers: { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress ?? '127.0.0.1' },
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  })

  try {
    const response = await api(request)

    const headers = {}
    // `set-cookie` has to stay its own header rather than being folded in.
    const cookies = []
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') cookies.push(value)
      else headers[key] = value
    })

    res.writeHead(response.status, cookies.length ? { ...headers, 'set-cookie': cookies } : headers)
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : null)
  } catch (error) {
    console.error('API threw:', error)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'server_error', message: 'Internal error.' } }))
  }
}).listen(PORT, () => {
  console.log(`NexalField running at http://localhost:${PORT}`)
  console.log(`  ${ROUTES.length} API routes, served through the Vercel entry point`)
})
