/**
 * The API's routing table, built from the functions themselves.
 *
 * Each function already declares where it lives in its own `export const
 * config`, which is what Netlify reads. This turns those same declarations into
 * a table any host can match against — so Vercel, and the local test server,
 * route exactly what Netlify routes, from one source of truth. Add a function
 * here and it is reachable everywhere.
 */
import adminActions, { config as adminActionsConfig } from '../functions/admin-actions.mts'
import adminAuth, { config as adminAuthConfig } from '../functions/admin-auth.mts'
import adminChecklist, { config as adminChecklistConfig } from '../functions/admin-checklist.mts'
import adminFile, { config as adminFileConfig } from '../functions/admin-file.mts'
import adminNotes, { config as adminNotesConfig } from '../functions/admin-notes.mts'
import adminProject, { config as adminProjectConfig } from '../functions/admin-project.mts'
import adminProjects, { config as adminProjectsConfig } from '../functions/admin-projects.mts'
import questionnaireSession, {
  config as questionnaireSessionConfig,
} from '../functions/questionnaire-session.mts'
import questionnaireSubmit, {
  config as questionnaireSubmitConfig,
} from '../functions/questionnaire-submit.mts'
import questionnaireSummary, {
  config as questionnaireSummaryConfig,
} from '../functions/questionnaire-summary.mts'
import uploadsChunk, { config as uploadsChunkConfig } from '../functions/uploads-chunk.mts'
import uploadsComplete, {
  config as uploadsCompleteConfig,
} from '../functions/uploads-complete.mts'
import uploadsDelete, { config as uploadsDeleteConfig } from '../functions/uploads-delete.mts'
import uploadsInit, { config as uploadsInitConfig } from '../functions/uploads-init.mts'

/** The context shape the functions actually use — nothing platform-specific. */
export interface RouteContext {
  params: Record<string, string>
  ip?: string
  waitUntil?: (promise: Promise<unknown>) => void
}

export type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>

interface FunctionEntry {
  handler: RouteHandler
  config: { path?: string | string[]; excludedPath?: string | string[] }
}

const FUNCTIONS: FunctionEntry[] = [
  { handler: questionnaireSession as RouteHandler, config: questionnaireSessionConfig },
  { handler: questionnaireSubmit as RouteHandler, config: questionnaireSubmitConfig },
  { handler: questionnaireSummary as RouteHandler, config: questionnaireSummaryConfig },
  { handler: uploadsInit as RouteHandler, config: uploadsInitConfig },
  { handler: uploadsChunk as RouteHandler, config: uploadsChunkConfig },
  { handler: uploadsComplete as RouteHandler, config: uploadsCompleteConfig },
  { handler: uploadsDelete as RouteHandler, config: uploadsDeleteConfig },
  { handler: adminAuth as RouteHandler, config: adminAuthConfig },
  { handler: adminProjects as RouteHandler, config: adminProjectsConfig },
  { handler: adminProject as RouteHandler, config: adminProjectConfig },
  { handler: adminNotes as RouteHandler, config: adminNotesConfig },
  { handler: adminChecklist as RouteHandler, config: adminChecklistConfig },
  { handler: adminFile as RouteHandler, config: adminFileConfig },
  { handler: adminActions as RouteHandler, config: adminActionsConfig },
]

export interface Route {
  path: string
  pattern: RegExp
  paramNames: string[]
  excluded: string[]
  handler: RouteHandler
}

function toRoute(path: string, excluded: string[], handler: RouteHandler): Route {
  const paramNames: string[] = []
  const pattern = new RegExp(
    `^${path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => {
      paramNames.push(name)
      return '([^/]+)'
    })}$`,
  )
  return { path, pattern, paramNames, excluded, handler }
}

export const ROUTES: Route[] = FUNCTIONS.flatMap((entry) => {
  const paths = [entry.config.path ?? []].flat()
  const excluded = [entry.config.excludedPath ?? []].flat()
  return paths.map((path) => toRoute(path, excluded, entry.handler))
}).sort(
  /*
   * Fewer parameters first, then the longer path — so `/api/uploads/init` is
   * matched before `/api/uploads/:fileId`, and `/api/admin/projects/:id/notes`
   * before `/api/admin/projects/:id`. The `excludedPath` declarations make the
   * first of those explicit rather than a matter of ordering luck.
   */
  (a, b) => a.paramNames.length - b.paramNames.length || b.path.length - a.path.length,
)

export interface Matched {
  handler: RouteHandler
  params: Record<string, string>
}

/** Finds the function that owns a pathname, or null if nothing does. */
export function matchRoute(pathname: string): Matched | null {
  for (const route of ROUTES) {
    if (route.excluded.includes(pathname)) continue
    const result = route.pattern.exec(pathname)
    if (!result) continue

    const params: Record<string, string> = {}
    route.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(result[index + 1])
    })
    return { handler: route.handler, params }
  }
  return null
}

export function notFound(): Response {
  return new Response(
    JSON.stringify({ error: { code: 'not_found', message: 'No such endpoint.' } }),
    { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } },
  )
}
