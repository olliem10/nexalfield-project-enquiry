/**
 * Assembles and verifies a finished upload.
 *
 * The parts are joined, the total size is checked once more, and the file's
 * leading bytes are read to confirm it really is the type its name claims. Only
 * then is it written to the private store and recorded against the record.
 */
import type { Config, Context } from '@netlify/functions'
import { and, eq, sql } from 'drizzle-orm'
import { uploadSessions, uploadedFiles } from '../../db/schema.ts'
import { MAX_UPLOAD_BYTES } from '../../shared/questionnaire.ts'
import { assertUploadFieldAccepts } from '../lib/answers.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, handle, json, readJson } from '../lib/http.ts'
import { blobKey, chunkKey, verifyUpload } from '../lib/uploads.ts'
import { chunksStore, deleteQuietly, filesStore } from '../lib/storage.ts'
import { loadSubmissionByToken } from '../lib/tokens.ts'

export default handle(async (request: Request, _context: Context) => {
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

  const body = await readJson<{ uploadId?: unknown }>(request)
  const uploadId = typeof body.uploadId === 'string' ? body.uploadId : ''
  if (!uploadId) {
    throw new HttpError(400, 'invalid_upload', 'That upload could not be completed.')
  }

  const db = getDb()
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(
      and(eq(uploadSessions.id, uploadId), eq(uploadSessions.submissionId, submission.id)),
    )
    .limit(1)

  if (!session) {
    throw new HttpError(404, 'upload_not_found', 'That upload has expired. Please try again.')
  }

  const chunks = chunksStore()
  const keys = Array.from({ length: session.totalChunks }, (_, index) =>
    chunkKey(uploadId, index),
  )

  async function cleanUp(): Promise<void> {
    await Promise.all(keys.map((key) => deleteQuietly(chunks, key)))
    await db.delete(uploadSessions).where(eq(uploadSessions.id, uploadId))
  }

  const parts: Uint8Array[] = []
  let total = 0

  for (const key of keys) {
    const part = await chunks.get(key)
    if (!part) {
      await cleanUp()
      throw new HttpError(
        409,
        'incomplete_upload',
        'Part of that file did not arrive. Please upload it again.',
      )
    }
    const bytes = part
    total += bytes.byteLength
    if (total > MAX_UPLOAD_BYTES) {
      await cleanUp()
      throw new HttpError(413, 'file_too_large', 'Files need to be 20MB or smaller.')
    }
    parts.push(bytes)
  }

  const assembled = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    assembled.set(part, offset)
    offset += part.byteLength
  }

  // Throws if the name and the contents disagree, or if it is not a type we
  // accept — the browser's claims have no authority here.
  let verified
  try {
    verified = verifyUpload(session.fileName, assembled)
  } catch (error) {
    await cleanUp()
    throw error
  }

  // Re-check the per-question limit: files may have been added since init.
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploadedFiles)
    .where(
      and(
        eq(uploadedFiles.submissionId, submission.id),
        eq(uploadedFiles.fieldId, session.fieldId),
      ),
    )

  try {
    assertUploadFieldAccepts(session.fieldId, count)
  } catch (error) {
    await cleanUp()
    throw error
  }

  const [record] = await db
    .insert(uploadedFiles)
    .values({
      submissionId: submission.id,
      fieldId: session.fieldId,
      fileName: session.fileName,
      contentType: verified.contentType,
      sizeBytes: total,
      blobKey: 'pending',
    })
    .returning({ id: uploadedFiles.id, createdAt: uploadedFiles.createdAt })

  // The key includes the submission id, so a file can never be addressed
  // without knowing which record it belongs to.
  const key = blobKey(submission.id, record.id)

  try {
    await filesStore().put(key, assembled)
  } catch (error) {
    // Do not leave a database row pointing at bytes that were never written.
    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, record.id))
    await cleanUp()
    throw error
  }

  await db.update(uploadedFiles).set({ blobKey: key }).where(eq(uploadedFiles.id, record.id))
  await cleanUp()

  return json({
    file: {
      id: record.id,
      fieldId: session.fieldId,
      fileName: session.fileName,
      contentType: verified.contentType,
      sizeBytes: total,
      createdAt: record.createdAt.toISOString(),
    },
  })
})

export const config: Config = {
  path: '/api/uploads/complete',
}
