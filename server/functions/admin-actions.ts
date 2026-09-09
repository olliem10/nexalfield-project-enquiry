/**
 * Two manual recovery actions for a record.
 *
 *   POST /api/admin/projects/:id/summary   regenerate the AI brief
 *   POST /api/admin/projects/:id/email     send the confirmation again
 *
 * Both are ordinarily automatic; these exist so a failure is never a dead end.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.js'
import { and, eq, isNotNull } from 'drizzle-orm'
import { submissions } from '../../db/schema.js'
import { requireAdmin } from '../lib/auth.js'
import { getDb } from '../lib/db.js'
import { HttpError, clientIp, handle, json, rateLimit } from '../lib/http.js'
import { runEmailTask, runSummaryTask } from '../lib/tasks.js'
import { loadProject, readProjectId } from './admin-project.js'

export default handle(async (request: Request, context: HandlerContext) => {
  const admin = requireAdmin(request)

  if (request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const id = readProjectId(context)
  const db = getDb()

  const [project] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.id, id), isNotNull(submissions.submittedAt)))
    .limit(1)
  if (!project) throw new HttpError(404, 'not_found', 'We could not find that project.')

  const { pathname } = new URL(request.url)

  if (pathname.endsWith('/summary')) {
    // Regenerating costs money on every press, so it is limited even for a
    // signed-in administrator.
    await rateLimit(
      `admin-summary:${clientIp(request, context)}`,
      30,
      60 * 60,
      'That is a lot of summaries in one hour. Please wait a little while.',
    )
    await runSummaryTask(id)
    return json(await loadProject(id, admin))
  }

  if (pathname.endsWith('/email')) {
    await rateLimit(
      `admin-email:${clientIp(request, context)}`,
      30,
      60 * 60,
      'That is a lot of emails in one hour. Please wait a little while.',
    )
    await runEmailTask(id)
    return json(await loadProject(id, admin))
  }

  throw new HttpError(404, 'not_found', 'That action does not exist.')
})

export const config: FunctionConfig = {
  path: ['/api/admin/projects/:id/summary', '/api/admin/projects/:id/email'],
}
