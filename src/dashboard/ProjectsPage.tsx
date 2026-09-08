import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHECKLIST_ITEMS, STATUSES } from '@shared/questionnaire'
import { EmptyState } from '../components/EmptyState'
import { Notice } from '../components/Notice'
import { ProgressBar } from '../components/ProgressBar'
import { SkeletonRows } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api } from '../lib/api'
import { formatDate } from '../lib/format'

interface ProjectRow {
  id: string
  reference: string
  businessName: string | null
  contactName: string | null
  email: string | null
  status: string
  submittedAt: string | null
  summaryStatus: string
  emailStatus: string
  checklistDone: number
  checklistTotal: number
}

interface ProjectsResponse {
  projects: ProjectRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  counts: Record<string, number>
}

export function ProjectsPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<ProjectsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const query = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [search, setSearch] = useState(query)
  useEffect(() => setSearch(query), [query])

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      if (!('page' in changes)) next.delete('page')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  // Searching, filtering, sorting and paging all happen in the database.
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    const search = new URLSearchParams({ sort, page: String(page) })
    if (query) search.set('q', query)
    if (status !== 'all') search.set('status', status)

    api<ProjectsResponse>(`/api/admin/projects?${search.toString()}`, { signal: controller.signal })
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
      })
      .catch((caught) => {
        if (cancelled || caught?.name === 'AbortError') return
        setError(
          caught instanceof ApiError ? caught.message : 'We could not load the project list.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, query, sort, status])

  const filters = useMemo(
    () => [{ value: 'all', label: 'All' }, ...STATUSES.map((entry) => ({ ...entry }))],
    [],
  )

  return (
    <div className="stack-lg">
      <div className="spread">
        <div className="stack-sm">
          <p className="eyebrow">Internal</p>
          <h1 style={{ fontSize: '1.9rem' }}>Website projects</h1>
        </div>
        <p className="small muted">
          {data ? `${data.total} ${data.total === 1 ? 'project' : 'projects'}` : ''}
        </p>
      </div>

      <div className="stack">
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <div className="stack-sm">
            <label className="label" htmlFor="project-search">
              Search
            </label>
            <div className="search-field">
              <input
                id="project-search"
                className="input"
                type="search"
                value={search}
                /* Short enough to display in full on a 360px phone; the
                    reference format is a more useful hint than the word
                    "reference" was. */
                placeholder="Name, email or NEX-0000"
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" className="btn">
                Search
              </button>
            </div>
          </div>

          <div className="stack-sm">
            <label className="label" htmlFor="project-sort">
              Sort
            </label>
            <select
              id="project-sort"
              className="select"
              value={sort}
              onChange={(event) => update({ sort: event.target.value })}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div className="stack-sm">
            <span className="label" aria-hidden="true">
              &nbsp;
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSearch('')
                setParams(new URLSearchParams(), { replace: true })
              }}
              disabled={!query && status === 'all' && sort === 'newest' && page === 1}
            >
              Clear filters
            </button>
          </div>
        </form>

        <div className="status-filters" role="group" aria-label="Filter by status">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`filter-chip${status === filter.value ? ' filter-chip-active' : ''}`}
              aria-pressed={status === filter.value}
              onClick={() => update({ status: filter.value === 'all' ? null : filter.value })}
            >
              {filter.label}
              {data ? <span className="filter-count">{data.counts[filter.value] ?? 0}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Notice tone="error" title="Could not load projects">
          {error}
        </Notice>
      ) : null}

      {loading && !data ? <SkeletonRows count={6} /> : null}

      {data && data.projects.length === 0 && !loading ? (
        <div className="table-wrap">
          <EmptyState
            title={query || status !== 'all' ? 'No projects match those filters' : 'No projects yet'}
            action={
              query || status !== 'all' ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          >
            {query || status !== 'all'
              ? 'Try a different search term or status.'
              : 'Completed customer enquiries will appear here as soon as they are submitted.'}
          </EmptyState>
        </div>
      ) : null}

      {data && data.projects.length > 0 ? (
        <div className="table-wrap" aria-busy={loading}>
          <div className="project-head-row" aria-hidden="true">
            <span>Business</span>
            <span>Contact</span>
            <span>Submitted</span>
            <span>Progress</span>
            <span>Status</span>
          </div>

          {data.projects.map((project) => {
            const percent = project.checklistTotal
              ? Math.round((project.checklistDone / project.checklistTotal) * 100)
              : 0
            return (
              <Link
                key={project.id}
                className="project-row"
                to={`/dashboard/projects/${project.id}`}
              >
                <div className="project-row-head">
                  <span className="project-business">
                    {project.businessName || 'Business name not given'}
                  </span>
                  <span className="small muted mono">{project.reference}</span>
                </div>
                <div className="project-meta">
                  <span>{project.contactName || '—'}</span>
                  <span>{project.email || '—'}</span>
                </div>
                <div className="project-foot">
                  <span className="small muted">{formatDate(project.submittedAt)}</span>
                  <span className="mini-progress">
                    <ProgressBar
                      percent={percent}
                      label={`Build checklist ${project.checklistDone} of ${project.checklistTotal}`}
                    />
                    {project.checklistDone}/{project.checklistTotal}
                  </span>
                  <StatusBadge status={project.status} />
                </div>
              </Link>
            )
          })}

          <div className="pagination">
            <span>
              Page {data.page} of {data.pageCount}
            </span>
            <span className="row">
              <button
                type="button"
                className="btn btn-sm"
                disabled={data.page <= 1}
                onClick={() => update({ page: String(data.page - 1) })}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={data.page >= data.pageCount}
                onClick={() => update({ page: String(data.page + 1) })}
              >
                Next
              </button>
            </span>
          </div>
        </div>
      ) : null}

      <p className="small muted">
        Checklist progress counts completed build steps out of {CHECKLIST_ITEMS.length}.
      </p>
    </div>
  )
}
