/**
 * The signed admin session cookie.
 *
 * The cookie carries the administrator's identity and an expiry, signed with
 * SESSION_SECRET. Nothing in it is secret, but nothing in it can be altered
 * either: change a byte and the HMAC stops matching. There is no session table,
 * so a stolen cookie is bounded by its own expiry rather than by a revocation
 * list — the trade for having no per-request database lookup on every route.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError, requireEnv } from './http.js'

export const SESSION_COOKIE = 'nf_admin_session'
const MAX_AGE_SECONDS = 60 * 60 * 12

export interface SessionPayload {
  email: string
  name: string
  /** Seconds since the epoch. */
  exp: number
}

function sign(value: string): string {
  return createHmac('sha256', requireEnv('SESSION_SECRET')).update(value).digest('base64url')
}

export function createSessionCookieValue(email: string, name: string): string {
  const payload: SessionPayload = {
    email,
    name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${sign(body)}`
}

export function readSessionCookieValue(raw: string | undefined): SessionPayload | null {
  if (!raw) return null

  const separator = raw.lastIndexOf('.')
  if (separator <= 0) return null

  const body = raw.slice(0, separator)
  const signature = raw.slice(separator + 1)

  const expected = Buffer.from(sign(body), 'utf8')
  const provided = Buffer.from(signature, 'utf8')
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload?.email || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

/**
 * `Secure` is omitted on plain-HTTP localhost only, because the local dev
 * server (`npm run start:local`) does not serve over TLS and the browser
 * would silently drop the cookie.
 */
function cookieAttributes(request: Request): string {
  const url = new URL(request.url)
  const insecureLocal = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    insecureLocal ? null : 'Secure',
  ]
    .filter(Boolean)
    .join('; ')
}

export function sessionSetCookie(request: Request, value: string): string {
  return `${SESSION_COOKIE}=${value}; ${cookieAttributes(request)}; Max-Age=${MAX_AGE_SECONDS}`
}

export function sessionClearCookie(request: Request): string {
  return `${SESSION_COOKIE}=; ${cookieAttributes(request)}; Max-Age=0`
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie')
  if (!header) return undefined

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

export function unauthorized(): HttpError {
  return new HttpError(401, 'unauthorized', 'Please sign in to continue.')
}
