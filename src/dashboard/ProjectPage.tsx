import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { STATUSES } from '@shared/questionnaire'
import { Notice } from '../components/Notice'
import { SkeletonCard } from '../components/Skeleton'
import { StatusBadge } from '../components/StatusBadge'
import { ApiError, api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { AnswersView } from './AnswersView'
import { ChecklistPanel } from './ChecklistPanel'
import { FilesPanel } from './FilesPanel'
import { NotesPanel } from './NotesPanel'
import { SummaryPanel } from './SummaryPanel'
import type { ProjectResponse } from './types'

interface ProjectPageProps {
  onSignedOut: () => void
}

export function ProjectPage({ onSignedOut }: ProjectPageProps) {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ProjectResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const result = await api<ProjectResponse>(`/api/admin/projects/${id}`)
      setData(result)
      setError(null)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        onSignedOut()
        return
      }
      setError(
        caught instanceof ApiError ? caught.message : 'We could not load this project record.',
      )
    }
  }, [id, onSignedOut])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = data?.project.reference
      ? `${data.project.reference} — NexalField dashboard`
      : 'Project — NexalField dashboard'
  }, [data?.project.reference])

  async function changeStatus(status: string) {
    if (!id) return
    setStatusBusy(true)
    setActionError(null)
    try {
      const result = await api<ProjectResponse>(`/api/admin/projects/${id}`, {
        method: 'PATCH',
        body: { status },
      })
      setData(result)
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.message : 'The status could not be updated.',
      )
    } finally {
      setStatusBusy(false)
    }
  }

  async function resendEmail() {
    if (!id) return
    setEmailBusy(true)
    setActionError(null)
    try {
      await api(`/api/admin/projects/${id}/email`, { method: 'POST', body: {} })
      await load()
    } catch (caught) {
      setActionError(
        caught instanceof ApiError
          ? caught.message
          : 'The confirmation email could not be sent again.',
      )
    } finally {
      setEmailBusy(false)
    }
  }

  if (error) {
    return (
      <div className="stack">
        <Notice tone="error" title="Record unavailable">
          {error}
        </Notice>
        <p>
          <Link to="/dashboard">Back to all projects</Link>
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="stack-lg">
        <span className="visually-hidden" role="status">
          Loading project record
        </span>
        <SkeletonCard rows={2} />
        <SkeletonCard rows={5} />
      </div>
    )
  }

  const { project, files, notes, checklist } = data

  return (
    <div>
      <div className="record-head">
        <p className="small">
          <Link to="/dashboard">← All projects</Link>
        </p>
        <div className="record-title">
          <h1 style={{ fontSize: '1.9rem' }}>{project.businessName || 'Business name not given'}</h1>
          <span className="mono muted">{project.reference}</span>
          <StatusBadge status={project.status} />
        </div>
        <p className="small muted">
          Submitted {formatDateTime(project.submittedAt)} · Last updated{' '}
          {formatDateTime(project.updatedAt)}
        </p>
      </div>

      {actionError ? (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="error">{actionError}</Notice>
        </div>
      ) : null}

      <div className="record-grid">
        <div className="stack-lg">
          <SummaryPanel project={project} onUpdated={load} />

          <section className="stack">
            <div>
              <p className="eyebrow">As the customer answered it</p>
              <h2>Project Enquiry</h2>
            </div>
            <AnswersView answers={project.answers} files={files} />
          </section>

          <FilesPanel files={files} />

          <NotesPanel
            projectId={project.id}
            notes={notes}
            onChanged={(next) => setData({ ...data, notes: next })}
          />
        </div>

        <aside className="record-aside">
          <section className="card stack">
            <div>
              <p className="eyebrow">Customer</p>
              <h2 style={{ fontSize: '1.3rem' }}>Contact details</h2>
            </div>
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Contact name</dt>
                <dd>{project.contactName || '—'}</dd>
              </div>
              <div className="detail-row">
                <dt>Email</dt>
                <dd>
                  {project.email ? <a href={`mailto:${project.email}`}>{project.email}</a> : '—'}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Phone</dt>
                <dd>{project.phone ? <a href={`tel:${project.phone}`}>{project.phone}</a> : '—'}</dd>
              </div>
              <div className="detail-row">
                <dt>Reference</dt>
                <dd className="mono">{project.reference}</dd>
              </div>
            </dl>
          </section>

          <section className="card stack">
            <div className="stack-sm">
              <p className="eyebrow">Workflow</p>
              <h2 style={{ fontSize: '1.3rem' }}>Status</h2>
              <p className="help">
                Status is stored separately from the checklist — changing it never affects your
                ticked items.
              </p>
            </div>
            <label className="visually-hidden" htmlFor="project-status">
              Project status
            </label>
            <select
              id="project-status"
              className="select"
              value={project.status}
              disabled={statusBusy}
              onChange={(event) => void changeStatus(event.target.value)}
            >
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            {statusBusy ? (
              <p className="small muted" role="status">
                Saving…
              </p>
            ) : null}
          </section>

          <ChecklistPanel
            projectId={project.id}
            checklist={checklist}
            onChanged={(next) => setData({ ...data, checklist: next })}
          />

          <section className="card stack-sm">
            <p className="eyebrow">Confirmation email</p>
            <p className="small">
              {project.emailStatus === 'sent'
                ? `Sent ${formatDateTime(project.emailSentAt)}${
                    project.emailProvider ? ` via ${project.emailProvider}` : ''
                  }`
                : project.emailStatus === 'skipped'
                  ? 'Not sent — no email provider is configured for this site.'
                  : project.emailStatus === 'failed'
                    ? `Failed: ${project.emailError ?? 'unknown reason'}`
                    : 'Queued — it will be retried automatically.'}
            </p>
            <div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void resendEmail()}
                disabled={emailBusy}
              >
                {emailBusy ? 'Sending…' : 'Send again'}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
