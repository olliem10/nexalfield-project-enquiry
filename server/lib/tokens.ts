/**
 * Continuation tokens — how a customer gets back into their own draft.
 *
 * The token is 32 bytes of randomness and is the only thing that grants access
 * to a questionnaire. It is stored as a SHA-256 hash, so the database never
 * holds anything that could be replayed, and it never appears in a URL path or
 * query string where it could end up in a server log or a referrer header.
 */
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { submissions, type Submission } from '../../db/schema.js'
import { getDb } from './db.js'
import { HttpError } from './http.js'

export const RESUME_HEADER = 'x-nexalfield-resume'
/** A draft that is never touched again stops being resumable after 60 days. */
export const DRAFT_TTL_DAYS = 60

export function createResumeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function readToken(request: Request): string {
  const token = request.headers.get(RESUME_HEADER)?.trim()
  if (!token || token.length < 20 || token.length > 200) {
    throw new HttpError(
      401,
      'missing_token',
      'We could not identify your enquiry. Please reopen your continuation link.',
    )
  }
  return token
}

/**
 * Resolves the request's token to exactly one questionnaire.
 *
 * This is the only way a customer route reaches a record: no id is ever taken
 * from the URL or the body, so there is nothing to enumerate or tamper with.
 * The lookup is by hash, so a guessed token cannot be confirmed by timing
 * either — it simply does not match a row.
 */
export async function loadSubmissionByToken(request: Request): Promise<Submission> {
  const token = readToken(request)
  const db = getDb()

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.tokenHash, hashToken(token)))
    .limit(1)

  if (!submission) {
    throw new HttpError(
      404,
      'not_found',
      'We could not find that saved enquiry. It may have already been submitted from another device.',
    )
  }

  if (
    submission.status === 'draft' &&
    submission.expiresAt &&
    submission.expiresAt.getTime() < Date.now()
  ) {
    throw new HttpError(
      410,
      'expired',
      'Your saved enquiry has expired. You can start a new one — it only takes 10–15 minutes.',
    )
  }

  return submission
}

export function draftExpiry(): Date {
  return new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
}
