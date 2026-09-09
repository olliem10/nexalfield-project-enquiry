/**
 * Dashboard sign-in, sign-out and session check.
 *
 * Sign-in is rate limited per address and per account so a password cannot be
 * ground down, and a wrong email and a wrong password produce exactly the same
 * response — there is no way to discover which addresses exist.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.js'
import { adminsAreConfigured, notConfigured, requireAdmin, verifyCredentials } from '../lib/auth.js'
import { HttpError, clientIp, handle, json, rateLimit, readJson } from '../lib/http.js'
import {
  createSessionCookieValue,
  sessionClearCookie,
  sessionSetCookie,
} from '../lib/session.js'

async function login(request: Request, context: HandlerContext): Promise<Response> {
  if (!adminsAreConfigured()) throw notConfigured()

  const ip = clientIp(request, context)
  await rateLimit(
    `login:${ip}`,
    10,
    15 * 60,
    'Too many sign-in attempts. Please wait a few minutes and try again.',
  )

  const body = await readJson<{ email?: unknown; password?: unknown }>(request)
  const email = typeof body.email === 'string' ? body.email.slice(0, 254) : ''
  const password = typeof body.password === 'string' ? body.password.slice(0, 512) : ''

  if (!email || !password) {
    throw new HttpError(400, 'invalid_credentials', 'Please enter your email address and password.')
  }

  // A second limit keyed on the account, so attempts spread across many
  // addresses still cannot brute-force one password.
  await rateLimit(
    `login-account:${email.toLowerCase()}`,
    12,
    15 * 60,
    'Too many sign-in attempts for that account. Please wait a few minutes.',
  )

  const admin = await verifyCredentials(email, password)
  if (!admin) {
    throw new HttpError(
      401,
      'invalid_credentials',
      'That email address and password do not match. Please try again.',
    )
  }

  return json({ admin }, 200, {
    'set-cookie': sessionSetCookie(request, createSessionCookieValue(admin.email, admin.name)),
  })
}

export default handle(async (request: Request, context: HandlerContext) => {
  const { pathname } = new URL(request.url)

  if (pathname.endsWith('/login')) {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
    }
    return login(request, context)
  }

  if (pathname.endsWith('/logout')) {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
    }
    // Always succeeds: signing out must work even from an expired session.
    return json({ ok: true }, 200, { 'set-cookie': sessionClearCookie(request) })
  }

  // GET /api/admin/session — who, if anyone, is signed in.
  if (request.method !== 'GET') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }
  if (!adminsAreConfigured()) throw notConfigured()

  return json({ admin: requireAdmin(request) })
})

export const config: FunctionConfig = {
  path: ['/api/admin/login', '/api/admin/logout', '/api/admin/session'],
}
