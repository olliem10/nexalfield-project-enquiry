/**
 * Opens a chunked upload.
 *
 * Nothing is stored yet: this records what the browser says it is about to
 * send, so each chunk can be checked against a server-side record rather than
 * against numbers the browser repeats back to us.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.ts'
import { and, eq, lt, sql } from 'drizzle-orm'
import { uploadSessions, uploadedFiles } from '../../db/schema.ts'
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CHUNK_BYTES,
  resolveUploadType,
} from '../../shared/questionnaire.ts'
import { assertUploadFieldAccepts } from '../lib/answers.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, clientIp, handle, json, rateLimit, readJson } from '../lib/http.ts'
import { safeFileName } from '../lib/uploads.ts'
import { loadSubmissionByToken } from '../lib/tokens.ts'

export default handle(async (request: Request, context: HandlerContext) => {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const submission = await loadSubmissionByToken(request)
  if (submission.submittedAt) {
    throw new HttpError(
      409,
      'already_submitted',
      'This enquiry has already been sent, so files can no longer be added.',
    )
  }

  await rateLimit(`upload:${clientIp(request, context)}`, 120, 60 * 60)

  const body = await readJson<{
    fieldId?: unknown
    fileName?: unknown
    contentType?: unknown
    sizeBytes?: unknown
  }>(request)

  const fieldId = typeof body.fieldId === 'string' ? body.fieldId : ''
  const fileName = safeFileName(typeof body.fileName === 'string' ? body.fileName : '')
  const sizeBytes = Number(body.sizeBytes)

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new HttpError(400, 'invalid_size', 'That file appears to be empty.')
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'file_too_large', 'Files need to be 20MB or smaller.')
  }

  const type = resolveUploadType(
    fileName,
    typeof body.contentType === 'string' ? body.contentType : undefined,
  )
  if (!type) {
    throw new HttpError(415, 'unsupported_type', 'Only PNG, JPG, SVG and PDF files can be uploaded.')
  }

  const db = getDb()

  // Clear out abandoned uploads before counting, so a customer who closed the
  // tab mid-upload is not blocked by their own half-finished attempt.
  await db.delete(uploadSessions).where(lt(uploadSessions.expiresAt, new Date()))

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploadedFiles)
    .where(
      and(eq(uploadedFiles.submissionId, submission.id), eq(uploadedFiles.fieldId, fieldId)),
    )

  assertUploadFieldAccepts(fieldId, count)

  const totalChunks = Math.max(1, Math.ceil(sizeBytes / UPLOAD_CHUNK_BYTES))

  const [created] = await db
    .insert(uploadSessions)
    .values({
      submissionId: submission.id,
      fieldId,
      fileName,
      contentType: type.contentType,
      sizeBytes,
      chunkSize: UPLOAD_CHUNK_BYTES,
      totalChunks,
      // Long enough for a large file on a slow connection, short enough that
      // an abandoned upload does not linger.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    .returning({ id: uploadSessions.id })

  return json({
    uploadId: created.id,
    chunkSize: UPLOAD_CHUNK_BYTES,
    totalChunks,
  })
})

export const config: FunctionConfig = {
  path: '/api/uploads/init',
}
