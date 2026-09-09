/**
 * Request and response helpers shared by every function.
 *
 * Errors always leave as `{ error: { code, message } }` with a message written
 * for the customer, never a stack trace or a database detail.
 */
import { sql } from 'drizzle-orm'
import { rateLimits } from '../../db/schema'
import { getDb } from './db'
import type { HandlerContext } from './types'

export interface FieldIssue {
  fieldId: string
  message: string
  step?: number
}

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: FieldIssue[]
  readonly headers?: Record<string, string>

  // Written out longhand rather than as constructor parameter properties, so
  // this file also runs under Node's built-in type stripping.
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: FieldIssue[],
    headers?: Record<string, string>,
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.fields = fields
    this.headers = headers
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'cache-control': 'no-store, private',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  })
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers: { ...SECURITY_HEADERS, ...headers } })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields?.length ? { fields: error.fields } : {}),
        },
      },
      error.status,
      error.headers,
    )
  }

  // Anything unexpected is logged in full for us and described vaguely to the
  // caller — an internal message could leak schema or configuration detail.
  console.error('Unhandled function error:', error)
  return json(
    {
      error: {
        code: 'server_error',
        message: 'Something went wrong at our end. Please try again in a moment.',
      },
    },
    500,
  )
}

/**
 * Wraps a handler so no route can ever return an unshaped error.
 *
 * Generic in the context type so each function can accept its full
 * `HandlerContext` while the helpers here only ask for the parts they use.
 */
export function handle<C>(
  fn: (request: Request, context: C) => Promise<Response>,
): (request: Request, context: C) => Promise<Response> {
  return async (request, context) => {
    try {
      return await fn(request, context)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function methodNotAllowed(allowed: string[]): HttpError {
  return new HttpError(405, 'method_not_allowed', 'That method is not supported here.', undefined, {
    allow: allowed.join(', '),
  })
}

const MAX_JSON_BYTES = 512 * 1024

/** Parses a JSON body, refusing anything oversized or malformed. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'That request was too large to process.')
  }

  const raw = await request.text()
  if (raw.length > MAX_JSON_BYTES) {
    throw new HttpError(413, 'payload_too_large', 'That request was too large to process.')
  }
  if (!raw.trim()) return {} as T

  try {
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object')
    }
    return parsed as T
  } catch {
    throw new HttpError(400, 'invalid_json', 'We could not read that request.')
  }
}

/**
 * Best-effort caller identity for rate limiting. `api/[...path].ts` populates
 * `context.ip` from Vercel's forwarded headers; the header is read directly
 * here as a fallback for local development.
 */
export function clientIp(request: Request, context: HandlerContext): string {
  if (context.ip) return context.ip
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

/**
 * A fixed-window counter in Postgres. Shared across every function instance,
 * which an in-memory counter on a serverless platform would never be.
 *
 * Rate limiting is a safety net, not a correctness guarantee: if the limiter
 * itself fails we let the request through rather than taking the site down.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = 'That is a few too many attempts. Please wait a moment and try again.',
): Promise<void> {
  const db = getDb()
  const windowStart = new Date(Date.now() - windowSeconds * 1000)

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart: new Date() })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          // Still inside the window: increment. Past it: start a fresh window.
          count: sql`case when ${rateLimits.windowStart} > ${windowStart} then ${rateLimits.count} + 1 else 1 end`,
          windowStart: sql`case when ${rateLimits.windowStart} > ${windowStart} then ${rateLimits.windowStart} else now() end`,
        },
      })
      .returning({ count: rateLimits.count })

    if (row && row.count > limit) {
      throw new HttpError(429, 'rate_limited', message, undefined, {
        'retry-after': String(windowSeconds),
      })
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('Rate limiter unavailable, allowing request:', error)
  }
}

/** Removes counters whose window closed long ago. Called from the housekeeping job. */
export async function pruneRateLimits(): Promise<void> {
  const db = getDb()
  await db.delete(rateLimits).where(sql`${rateLimits.windowStart} < now() - interval '1 day'`)
}

export function requireMethod(request: Request, ...allowed: string[]): void {
  if (!allowed.includes(request.method)) throw methodNotAllowed(allowed)
}

/** Reads a required environment variable, or explains precisely what is missing. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new HttpError(
      503,
      'not_configured',
      `This site is missing the ${name} environment variable. Set it in the Vercel project's Environment Variables.`,
    )
  }
  return value
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}
