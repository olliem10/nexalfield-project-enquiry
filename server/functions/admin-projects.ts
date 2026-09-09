/**
 * The dashboard project list.
 *
 * Searching, status filtering, sorting and paging all happen in Postgres, so
 * the function returns one page regardless of whether there are ten records or
 * ten thousand. Drafts are never listed — only questionnaires a customer
 * actually sent.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types'
import { and, asc, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm'
import { checklistItems, submissions } from '../../db/schema'
import { CHECKLIST_ITEMS, STATUS_VALUES } from '../../shared/questionnaire'
import { requireAdmin } from '../lib/auth'
import { getDb } from '../lib/db'
import { HttpError, handle, json } from '../lib/http'

const PAGE_SIZE = 25

/**
 * Builds a full-text prefix query from what was typed.
 *
 * Terms are tokenised here rather than interpolated, so nothing the user types
 * can reach tsquery's own syntax — a search for `NEX-4821` becomes
 * `nex:* & 4821:*` and matches the reference, and `jane` prefix-matches the
 * email lexeme `jane@example.com`.
 */
function searchCondition(query: string): SQL | undefined {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9@.]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, 8)

  if (terms.length === 0) return undefined

  const tsquery = terms.map((term) => `${term}:*`).join(' & ')

  // Must stay identical to `submissions_search_idx` in db/schema.ts, hyphen
  // replacement included, or Postgres cannot use the index for this query.
  return sql`to_tsvector('simple', replace(
    coalesce(${submissions.businessName}, '') || ' ' ||
    coalesce(${submissions.contactName}, '') || ' ' ||
    coalesce(${submissions.email}, '') || ' ' ||
    coalesce(${submissions.reference}, ''), '-', ' '
  )) @@ to_tsquery('simple', ${tsquery})`
}

export default handle(async (request: Request, _context: HandlerContext) => {
  // Authorisation before anything touches the database.
  requireAdmin(request)

  if (request.method !== 'GET') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').slice(0, 120).trim()
  const status = url.searchParams.get('status') ?? ''
  const sort = url.searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get('page')) || 1))

  const db = getDb()

  // Only submitted questionnaires are records; drafts belong to the customer.
  const filters: SQL[] = [isNotNull(submissions.submittedAt)]

  const search = searchCondition(query)
  if (search) filters.push(search)

  if (status && STATUS_VALUES.includes(status)) {
    filters.push(eq(submissions.status, status))
  }

  const where = and(...filters)

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(submissions)
    .where(where)

  const rows = await db
    .select({
      id: submissions.id,
      reference: submissions.reference,
      businessName: submissions.businessName,
      contactName: submissions.contactName,
      email: submissions.email,
      status: submissions.status,
      submittedAt: submissions.submittedAt,
      summaryStatus: submissions.summaryStatus,
      emailStatus: submissions.emailStatus,
      // Counted in the database so the list never loads every checklist row.
      checklistDone: sql<number>`(
        select count(*)::int from ${checklistItems}
        where ${checklistItems.submissionId} = ${submissions.id}
          and ${checklistItems.completed} = true
      )`,
      checklistTotal: sql<number>`(
        select count(*)::int from ${checklistItems}
        where ${checklistItems.submissionId} = ${submissions.id}
      )`,
    })
    .from(submissions)
    .where(where)
    .orderBy(sort === 'oldest' ? asc(submissions.submittedAt) : desc(submissions.submittedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  // Counts for the filter chips, honouring the current search but not the
  // current status — otherwise every chip but the active one would read zero.
  const countFilters: SQL[] = [isNotNull(submissions.submittedAt)]
  if (search) countFilters.push(search)

  const grouped = await db
    .select({ status: submissions.status, count: sql<number>`count(*)::int` })
    .from(submissions)
    .where(and(...countFilters))
    .groupBy(submissions.status)

  const counts: Record<string, number> = { all: 0 }
  for (const value of STATUS_VALUES) counts[value] = 0
  for (const row of grouped) {
    counts[row.status] = row.count
    counts.all += row.count
  }

  return json({
    projects: rows.map((row) => ({
      ...row,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      checklistTotal: row.checklistTotal || CHECKLIST_ITEMS.length,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts,
  })
})

export const config: FunctionConfig = {
  path: '/api/admin/projects',
}
