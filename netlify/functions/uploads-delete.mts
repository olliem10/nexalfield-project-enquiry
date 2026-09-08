/**
 * Removes a file the customer attached.
 *
 * The delete is scoped to the questionnaire the continuation token identifies,
 * so a known file id is not on its own enough to delete someone else's upload.
 */
import type { Config, Context } from '@netlify/functions'
import { and, eq } from 'drizzle-orm'
import { uploadedFiles } from '../../db/schema.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, handle, noContent } from '../lib/http.ts'
import { deleteQuietly, filesStore } from '../lib/storage.ts'
import { loadSubmissionByToken } from '../lib/tokens.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handle(async (request: Request, context: Context) => {
  if (request.method !== 'DELETE') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const submission = await loadSubmissionByToken(request)
  if (submission.submittedAt) {
    throw new HttpError(
      409,
      'already_submitted',
      'This enquiry has already been sent, so its files can no longer be changed.',
    )
  }

  const fileId = context.params.fileId ?? ''
  if (!UUID.test(fileId)) {
    throw new HttpError(404, 'not_found', 'We could not find that file.')
  }

  const db = getDb()
  const [removed] = await db
    .delete(uploadedFiles)
    .where(and(eq(uploadedFiles.id, fileId), eq(uploadedFiles.submissionId, submission.id)))
    .returning({ blobKey: uploadedFiles.blobKey })

  if (!removed) {
    throw new HttpError(404, 'not_found', 'We could not find that file.')
  }

  // The row is gone either way; an orphaned blob is tidied up rather than
  // being allowed to fail the customer's delete.
  await deleteQuietly(filesStore(), removed.blobKey)

  return noContent()
})

export const config: Config = {
  path: '/api/uploads/:fileId',
  /**
   * `:fileId` would otherwise also match `/api/uploads/init`, `/chunk` and
   * `/complete`. Rather than depend on the router preferring a literal segment
   * over a parameter, the three are excluded here explicitly.
   */
  excludedPath: ['/api/uploads/init', '/api/uploads/chunk', '/api/uploads/complete'],
}
