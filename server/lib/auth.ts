/**
 * Who is allowed into the dashboard, and how that is proven.
 *
 * Administrators are configured entirely through environment variables — there
 * is no sign-up route and no user table, because exactly one organisation uses
 * this dashboard and a self-service account system would only be extra attack
 * surface.
 */
import { pbkdf2, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { HttpError, optionalEnv } from './http.js'
import { readCookie, readSessionCookieValue, SESSION_COOKIE, unauthorized } from './session.js'

const pbkdf2Async = promisify(pbkdf2)

export interface AdminUser {
  email: string
  name: string
  passwordHash?: string
  password?: string
}

export interface Admin {
  email: string
  name: string
}

/**
 * Reads the administrator list. `ADMIN_USERS` (JSON) wins if present, otherwise
 * the single `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` pair is used.
 */
export function configuredAdmins(): AdminUser[] {
  const many = optionalEnv('ADMIN_USERS')
  if (many) {
    try {
      const parsed = JSON.parse(many)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry) => entry && typeof entry.email === 'string')
          .map((entry) => ({
            email: String(entry.email).toLowerCase().trim(),
            name: String(entry.name ?? entry.email),
            passwordHash: entry.passwordHash ? String(entry.passwordHash) : undefined,
            password: entry.password ? String(entry.password) : undefined,
          }))
      }
    } catch {
      console.error('ADMIN_USERS is not valid JSON — falling back to ADMIN_EMAIL.')
    }
  }

  const email = optionalEnv('ADMIN_EMAIL')
  if (!email) return []

  return [
    {
      email: email.toLowerCase().trim(),
      name: optionalEnv('ADMIN_NAME') ?? email,
      passwordHash: optionalEnv('ADMIN_PASSWORD_HASH'),
      password: optionalEnv('ADMIN_PASSWORD'),
    },
  ]
}

export function adminsAreConfigured(): boolean {
  return configuredAdmins().some((admin) => admin.passwordHash || admin.password)
}

export function notConfigured(): HttpError {
  return new HttpError(
    503,
    'not_configured',
    'No dashboard administrator has been set up yet. Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH in your Vercel environment variables.',
  )
}

/** Compares two strings without leaking their contents through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** `pbkdf2$<digest>$<iterations>$<salt>$<key>`, as produced by scripts/hash-password.mjs. */
async function verifyPbkdf2(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false

  const [, digest, iterationsRaw, saltRaw, expectedRaw] = parts
  const iterations = Number(iterationsRaw)
  if (!Number.isInteger(iterations) || iterations < 1000) return false

  try {
    const salt = Buffer.from(saltRaw, 'base64url')
    const expected = Buffer.from(expectedRaw, 'base64url')
    const derived = await pbkdf2Async(password, salt, iterations, expected.length, digest)
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/**
 * Verifies a sign-in. Every candidate is checked even after a match is found,
 * so the response time does not reveal which email addresses exist.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Admin | null> {
  const candidates = configuredAdmins()
  if (candidates.length === 0) throw notConfigured()

  const wanted = email.toLowerCase().trim()
  let matched: Admin | null = null

  for (const admin of candidates) {
    const sameEmail = constantTimeEquals(admin.email, wanted)
    const passwordOk = admin.passwordHash
      ? await verifyPbkdf2(password, admin.passwordHash)
      : admin.password
        ? constantTimeEquals(admin.password, password)
        : false

    if (sameEmail && passwordOk && !matched) {
      matched = { email: admin.email, name: admin.name }
    }
  }

  return matched
}

/**
 * The authorisation gate for every `/api/admin/*` route.
 *
 * This runs before any database read, so an unauthenticated request never
 * reaches a customer record — hiding the dashboard UI is a convenience, this is
 * the actual boundary.
 */
export function requireAdmin(request: Request): Admin {
  const session = readSessionCookieValue(readCookie(request, SESSION_COOKIE))
  if (!session) throw unauthorized()
  return { email: session.email, name: session.name }
}
