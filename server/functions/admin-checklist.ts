/**
 * The build checklist.
 *
 * PATCH /api/admin/projects/:id/checklist   { itemKey, completed }
 *
 * Stored in its own table, keyed by item, so ticking a box never rewrites the
 * project status and changing the status never disturbs the checklist.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.js'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import { checklistItems, submissions } from '../../db/schema.js'
import { CHECKLIST_ITEMS } from '../../shared/questionnaire.js'
import { requireAdmin } from '../lib/auth.js'
import { getDb } from '../lib/db.js'
import { HttpError, handle, json, readJson } from '../lib/http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default handle(async (request: Request, context: HandlerContext) => {
  const admin = requireAdmin(request)

  if (request.method !== 'PATCH') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const projectId = context.params.id ?? ''
  if (!UUID.test(projectId)) {
    throw new HttpError(404, 'not_found', 'We could not find that project.')
  }

  const body = await readJson<{ itemKey?: unknown; completed?: unknown }>(request)
  const itemKey = typeof body.itemKey === 'string' ? body.itemKey : ''
  const completed = body.completed === true

  const definition = CHECKLIST_ITEMS.find((item) => item.key === itemKey)
  if (!definition) {
    throw new HttpError(400, 'unknown_item', 'That is not a checklist item.')
  }

  const db = getDb()
  const [project] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.id, projectId), isNotNull(submissions.submittedAt)))
    .limit(1)
  if (!project) throw new HttpError(404, 'not_found', 'We could not find that project.')

  const now = new Date()
  const position = CHECKLIST_ITEMS.findIndex((item) => item.key === itemKey)

  // Upsert, so a record submitted before this item existed still gets a row.
  await db
    .insert(checklistItems)
    .values({
      submissionId: projectId,
      itemKey,
      label: definition.label,
      position,
      completed,
      completedAt: completed ? now : null,
      completedBy: completed ? admin.name || admin.email : null,
    })
    .onConflictDoUpdate({
      target: [checklistItems.submissionId, checklistItems.itemKey],
      set: {
        completed,
        completedAt: completed ? now : null,
        completedBy: completed ? admin.name || admin.email : null,
        label: definition.label,
        position,
      },
    })

  const stored = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.submissionId, projectId))
    .orderBy(asc(checklistItems.position))

  const byKey = new Map(stored.map((item) => [item.itemKey, item]))

  return json({
    checklist: CHECKLIST_ITEMS.map((item, index) => {
      const row = byKey.get(item.key)
      return {
        itemKey: item.key,
        label: item.label,
        position: row?.position ?? index,
        completed: row?.completed ?? false,
        completedAt: row?.completedAt?.toISOString() ?? null,
        completedBy: row?.completedBy ?? null,
      }
    }),
  })
})

export const config: FunctionConfig = {
  path: '/api/admin/projects/:id/checklist',
}
