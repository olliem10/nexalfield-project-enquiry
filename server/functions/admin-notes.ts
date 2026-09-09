/**
 * Internal notes — private to NexalField.
 *
 *   POST   /api/admin/projects/:id/notes   add a note
 *   PATCH  /api/admin/notes/:noteId        edit it
 *   DELETE /api/admin/notes/:noteId        remove it
 *
 * There is no customer-facing route that reads this table at all, so a note can
 * never be exposed by a mistake in the questionnaire code.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types'
import { eq } from 'drizzle-orm'
import { internalNotes, submissions } from '../../db/schema'
import { NOTE_CATEGORY_VALUES } from '../../shared/questionnaire'
import { requireAdmin } from '../lib/auth'
import { getDb } from '../lib/db'
import { HttpError, handle, json, noContent, readJson } from '../lib/http'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY = 5000

function serialise(note: typeof internalNotes.$inferSelect) {
  return {
    id: note.id,
    body: note.body,
    category: note.category,
    author: note.author,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt?.toISOString() ?? null,
  }
}

function readBody(value: unknown): string {
  const body = typeof value === 'string' ? value.trim().slice(0, MAX_BODY) : ''
  if (!body) throw new HttpError(400, 'empty_note', 'A note needs some text.')
  return body
}

export default handle(async (request: Request, context: HandlerContext) => {
  const admin = requireAdmin(request)
  const db = getDb()

  const projectId = context.params.id
  const noteId = context.params.noteId

  if (projectId) {
    if (request.method !== 'POST') {
      throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
    }
    if (!UUID.test(projectId)) {
      throw new HttpError(404, 'not_found', 'We could not find that project.')
    }

    const [project] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.id, projectId))
      .limit(1)
    if (!project) throw new HttpError(404, 'not_found', 'We could not find that project.')

    const body = await readJson<{ body?: unknown; category?: unknown }>(request)
    const category =
      typeof body.category === 'string' && NOTE_CATEGORY_VALUES.includes(body.category)
        ? body.category
        : 'private'

    const [created] = await db
      .insert(internalNotes)
      .values({
        submissionId: projectId,
        body: readBody(body.body),
        category,
        // Attribution comes from the signed session, never from the request
        // body — an author cannot be spoofed.
        author: admin.name || admin.email,
      })
      .returning()

    return json({ note: serialise(created) }, 201)
  }

  if (!noteId || !UUID.test(noteId)) {
    throw new HttpError(404, 'not_found', 'We could not find that note.')
  }

  if (request.method === 'PATCH') {
    const body = await readJson<{ body?: unknown }>(request)
    const [updated] = await db
      .update(internalNotes)
      .set({ body: readBody(body.body), updatedAt: new Date() })
      .where(eq(internalNotes.id, noteId))
      .returning()

    if (!updated) throw new HttpError(404, 'not_found', 'We could not find that note.')
    return json({ note: serialise(updated) })
  }

  if (request.method === 'DELETE') {
    const [removed] = await db
      .delete(internalNotes)
      .where(eq(internalNotes.id, noteId))
      .returning({ id: internalNotes.id })

    if (!removed) throw new HttpError(404, 'not_found', 'We could not find that note.')
    return noContent()
  }

  throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
})

export const config: FunctionConfig = {
  path: ['/api/admin/projects/:id/notes', '/api/admin/notes/:noteId'],
}
