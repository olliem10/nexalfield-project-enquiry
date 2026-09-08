/**
 * One customer record: the full questionnaire, its files, internal notes and
 * build checklist — plus the status update.
 *
 *   GET   /api/admin/projects/:id
 *   PATCH /api/admin/projects/:id   { status }
 */
import type { Config, Context } from '@netlify/functions'
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm'
import {
  checklistItems,
  internalNotes,
  submissions,
  uploadedFiles,
} from '../../db/schema.ts'
import { CHECKLIST_ITEMS, STATUS_VALUES } from '../../shared/questionnaire.ts'
import { requireAdmin, type Admin } from '../lib/auth.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, handle, json, readJson } from '../lib/http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readProjectId(context: Context): string {
  const id = context.params.id ?? ''
  // A malformed id is a 404, not a database error.
  if (!UUID.test(id)) throw new HttpError(404, 'not_found', 'We could not find that project.')
  return id
}

/**
 * Assembles the whole record. Everything here is internal-only by definition:
 * the route has already required an authenticated administrator.
 */
export async function loadProject(id: string, viewer: Admin) {
  const db = getDb()

  const [project] = await db
    .select()
    .from(submissions)
    // Drafts are not records: a half-finished questionnaire belongs to the
    // customer until they send it.
    .where(and(eq(submissions.id, id), isNotNull(submissions.submittedAt)))
    .limit(1)

  if (!project) throw new HttpError(404, 'not_found', 'We could not find that project.')

  const [files, notes, checklist] = await Promise.all([
    db
      .select({
        id: uploadedFiles.id,
        fieldId: uploadedFiles.fieldId,
        fileName: uploadedFiles.fileName,
        contentType: uploadedFiles.contentType,
        sizeBytes: uploadedFiles.sizeBytes,
        createdAt: uploadedFiles.createdAt,
      })
      .from(uploadedFiles)
      .where(eq(uploadedFiles.submissionId, id))
      .orderBy(asc(uploadedFiles.createdAt)),
    db
      .select()
      .from(internalNotes)
      .where(eq(internalNotes.submissionId, id))
      .orderBy(desc(internalNotes.createdAt)),
    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.submissionId, id))
      .orderBy(asc(checklistItems.position)),
  ])

  // A record created before an item was added to the checklist still shows the
  // full list, unticked, rather than a short one.
  const byKey = new Map(checklist.map((item) => [item.itemKey, item]))
  const fullChecklist = CHECKLIST_ITEMS.map((item, index) => {
    const stored = byKey.get(item.key)
    return {
      itemKey: item.key,
      label: item.label,
      position: stored?.position ?? index,
      completed: stored?.completed ?? false,
      completedAt: stored?.completedAt?.toISOString() ?? null,
      completedBy: stored?.completedBy ?? null,
    }
  })

  return {
    project: {
      id: project.id,
      reference: project.reference ?? '',
      status: project.status,
      contactName: project.contactName,
      businessName: project.businessName,
      email: project.email,
      phone: project.phone,
      answers: project.answers ?? {},
      submittedAt: project.submittedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      summary: project.summary ?? null,
      summaryStatus: project.summaryStatus,
      summaryError: project.summaryError,
      summaryAttempts: project.summaryAttempts,
      summaryUpdatedAt: project.summaryUpdatedAt?.toISOString() ?? null,
      emailStatus: project.emailStatus,
      emailError: project.emailError,
      emailAttempts: project.emailAttempts,
      emailSentAt: project.emailSentAt?.toISOString() ?? null,
      emailProvider: project.emailProvider,
    },
    files: files.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      category: note.category,
      author: note.author,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt?.toISOString() ?? null,
    })),
    checklist: fullChecklist,
    viewer: viewer.name || viewer.email,
  }
}

export default handle(async (request: Request, context: Context) => {
  const admin = requireAdmin(request)
  const id = readProjectId(context)

  if (request.method === 'GET') {
    return json(await loadProject(id, admin))
  }

  if (request.method !== 'PATCH') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const body = await readJson<{ status?: unknown }>(request)
  const status = typeof body.status === 'string' ? body.status : ''
  if (!STATUS_VALUES.includes(status)) {
    throw new HttpError(400, 'invalid_status', 'That is not a status a project can be set to.')
  }

  const db = getDb()
  const [updated] = await db
    .update(submissions)
    // Only the status column. Checklist progress lives in its own table and is
    // untouched by a workflow change.
    .set({ status, updatedAt: new Date() })
    .where(and(eq(submissions.id, id), isNotNull(submissions.submittedAt)))
    .returning({ id: submissions.id })

  if (!updated) throw new HttpError(404, 'not_found', 'We could not find that project.')

  return json(await loadProject(id, admin))
})

export const config: Config = {
  path: '/api/admin/projects/:id',
}
