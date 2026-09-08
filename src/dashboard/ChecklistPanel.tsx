import { useState } from 'react'
import { Notice } from '../components/Notice'
import { ProgressBar } from '../components/ProgressBar'
import { ApiError, api } from '../lib/api'
import { formatDate } from '../lib/format'
import type { ChecklistEntry } from './types'

interface ChecklistPanelProps {
  projectId: string
  checklist: ChecklistEntry[]
  onChanged: (checklist: ChecklistEntry[]) => void
}

/**
 * Build checklist. Stored separately from the project status, so changing one
 * never affects the other.
 */
export function ChecklistPanel({ projectId, checklist, onChanged }: ChecklistPanelProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const done = checklist.filter((item) => item.completed).length
  const percent = checklist.length ? Math.round((done / checklist.length) * 100) : 0

  async function toggle(item: ChecklistEntry) {
    setBusyKey(item.itemKey)
    setError(null)
    try {
      const result = await api<{ checklist: ChecklistEntry[] }>(
        `/api/admin/projects/${projectId}/checklist`,
        { method: 'PATCH', body: { itemKey: item.itemKey, completed: !item.completed } },
      )
      onChanged(result.checklist)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That change could not be saved.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="card stack">
      <div className="stack-sm">
        <p className="eyebrow">Build progress</p>
        <h2 style={{ fontSize: '1.3rem' }}>Project checklist</h2>
        <div className="row" style={{ gap: 10 }}>
          <span style={{ flex: '1 1 120px' }}>
            <ProgressBar percent={percent} label={`Checklist ${done} of ${checklist.length}`} />
          </span>
          <span className="small muted">
            {done}/{checklist.length}
          </span>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <ul className="checklist">
        {checklist.map((item) => (
          <li key={item.itemKey}>
            <label className={`checklist-item${item.completed ? ' checklist-done' : ''}`}>
              <input
                type="checkbox"
                checked={item.completed}
                disabled={busyKey === item.itemKey}
                onChange={() => void toggle(item)}
              />
              <span className="checklist-label">
                {item.label}
                {item.completed && item.completedAt ? (
                  <span className="checklist-by">
                    {formatDate(item.completedAt)}
                    {item.completedBy ? ` · ${item.completedBy}` : ''}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
