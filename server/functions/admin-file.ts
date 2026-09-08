/**
 * Streams an uploaded file to a signed-in administrator.
 *
 * This is the *only* way bytes leave the store. The blob store has no public
 * URL, so there is no address to guess and no signed link to leak: access is
 * decided here, per request, by the session cookie.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.ts'
import { eq } from 'drizzle-orm'
import { uploadedFiles } from '../../db/schema.ts'
import { requireAdmin } from '../lib/auth.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, handle } from '../lib/http.ts'
import { contentDispositionHeader, dispositionFor } from '../lib/uploads.ts'
import { filesStore } from '../lib/storage.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handle(async (request: Request, context: HandlerContext) => {
  // Before the database, before the store.
  requireAdmin(request)

  if (request.method !== 'GET') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const fileId = context.params.fileId ?? ''
  if (!UUID.test(fileId)) throw new HttpError(404, 'not_found', 'We could not find that file.')

  const db = getDb()
  const [file] = await db
    .select()
    .from(uploadedFiles)
    .where(eq(uploadedFiles.id, fileId))
    .limit(1)

  if (!file) throw new HttpError(404, 'not_found', 'We could not find that file.')

  const stream = await filesStore().getStream(file.blobKey)
  if (!stream) {
    throw new HttpError(
      404,
      'file_missing',
      'That file is recorded but its contents could not be read from storage.',
    )
  }

  const wantsInline = new URL(request.url).searchParams.get('disposition') === 'inline'
  const disposition = dispositionFor(file.contentType, wantsInline)

  return new Response(stream, {
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.sizeBytes),
      'content-disposition': contentDispositionHeader(disposition, file.fileName),
      // Never cached anywhere: a customer's logo must not survive in a shared
      // cache after the session that fetched it has ended.
      'cache-control': 'no-store, private',
      // The file is customer-supplied, so it is served with sniffing disabled
      // and no ability to run scripts or be framed.
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
})

export const config: FunctionConfig = {
  path: '/api/admin/files/:fileId',
}
