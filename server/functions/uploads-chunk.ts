/**
 * Receives one part of a file.
 *
 * The body is raw bytes, not JSON, so this is the one route that does not go
 * through `readJson`. Every part is checked against the upload session that was
 * opened server-side: the right questionnaire, a valid index, and a size that
 * cannot push the file past 20MB however the browser slices it.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.js'
import { and, eq, sql } from 'drizzle-orm'
import { uploadSessions } from '../../db/schema.js'
import { MAX_UPLOAD_BYTES } from '../../shared/questionnaire.js'
import { getDb } from '../lib/db.js'
import { HttpError, handle, json } from '../lib/http.js'
import { chunkKey } from '../lib/uploads.js'
import { chunksStore } from '../lib/storage.js'
import { loadSubmissionByToken } from '../lib/tokens.js'

export default handle(async (request: Request, _context: HandlerContext) => {
  if (request.method !== 'PUT') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const submission = await loadSubmissionByToken(request)
  const url = new URL(request.url)
  const uploadId = url.searchParams.get('uploadId') ?? ''
  const index = Number(url.searchParams.get('index'))

  if (!uploadId || !Number.isInteger(index) || index < 0) {
    throw new HttpError(400, 'invalid_chunk', 'That part of the file could not be accepted.')
  }

  const db = getDb()
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(
      // Scoped to the caller's own questionnaire: knowing an upload id is not
      // enough to write into someone else's upload.
      and(eq(uploadSessions.id, uploadId), eq(uploadSessions.submissionId, submission.id)),
    )
    .limit(1)

  if (!session) {
    throw new HttpError(404, 'upload_not_found', 'That upload has expired. Please try again.')
  }
  if (session.expiresAt.getTime() < Date.now()) {
    throw new HttpError(410, 'upload_expired', 'That upload took too long. Please try again.')
  }
  if (index >= session.totalChunks) {
    throw new HttpError(400, 'invalid_chunk', 'That part of the file could not be accepted.')
  }

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength === 0) {
    throw new HttpError(400, 'empty_chunk', 'That part of the file arrived empty. Please retry.')
  }
  if (bytes.byteLength > session.chunkSize) {
    throw new HttpError(413, 'chunk_too_large', 'That part of the file was larger than expected.')
  }
  // Independent of the declared total: this is what actually caps the assembled
  // file, whatever the browser claimed at init.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, 'file_too_large', 'Files need to be 20MB or smaller.')
  }

  await chunksStore().put(chunkKey(uploadId, index), bytes)

  await db
    .update(uploadSessions)
    .set({ receivedChunks: sql`${uploadSessions.receivedChunks} + 1` })
    .where(eq(uploadSessions.id, uploadId))

  return json({ received: index })
})

export const config: FunctionConfig = {
  path: '/api/uploads/chunk',
}
