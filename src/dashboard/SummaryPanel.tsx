import { useState } from 'react'
import { Notice } from '../components/Notice'
import { ProjectSummaryView } from '../components/ProjectSummaryView'
import { Skeleton } from '../components/Skeleton'
import { ApiError, api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import type { ProjectRecord } from './types'

interface SummaryPanelProps {
  project: ProjectRecord
  onUpdated: () => void
}

/**
 * The AI project brief. Generation happens off the submission path, so a
 * failure here is recoverable: it can be regenerated on demand.
 */
export function SummaryPanel({ project, onUpdated }: SummaryPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function regenerate() {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/admin/projects/${project.id}/summary`, { method: 'POST', body: {} })
      onUpdated()
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The summary could not be generated.',
      )
    } finally {
      setBusy(false)
    }
  }

  const pending = project.summaryStatus === 'pending' || project.summaryStatus === 'generating'

  return (
    <section className="card stack">
      <div className="spread">
        <div>
          <p className="eyebrow">AI project summary</p>
          <h2>Project brief</h2>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void regenerate()} disabled={busy}>
          {busy ? 'Working…' : project.summary ? 'Regenerate' : 'Generate now'}
        </button>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {project.summaryStatus === 'ready' && project.summary ? (
        <>
          <ProjectSummaryView summary={project.summary} />
          <p className="small muted">
            Generated {formatDateTime(project.summaryUpdatedAt)}
            {project.summary.model ? ` · ${project.summary.model}` : ''}
          </p>
        </>
      ) : null}

      {pending && !busy ? (
        <div className="stack-sm">
          <p className="help">
            The summary has not been generated yet. It is retried automatically every hour, or you
            can generate it now.
          </p>
          <Skeleton width="88%" />
          <Skeleton width="64%" />
        </div>
      ) : null}

      {busy ? (
        <div className="stack-sm" aria-live="polite">
          <p className="help">Generating the brief from the enquiry…</p>
          <Skeleton width="88%" />
          <Skeleton width="64%" />
        </div>
      ) : null}

      {project.summaryStatus === 'failed' ? (
        <Notice tone="warning" title="Summary could not be generated">
          {/* Each part ends in a full stop so the reason, the attempt count and
              the reassurance do not run together into one sentence. */}
          <span>
            {(project.summaryError ?? 'The model did not return a usable summary.').replace(
              /\.?$/,
              '.',
            )}{' '}
            {project.summaryAttempts > 0 ? `Attempts: ${project.summaryAttempts}. ` : ''}
            The enquiry answers below are complete and unaffected.
          </span>
        </Notice>
      ) : null}
    </section>
  )
}
