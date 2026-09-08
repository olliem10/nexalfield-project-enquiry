import { useState } from 'react'
import { NOTE_CATEGORIES } from '@shared/questionnaire'
import { EmptyState } from '../components/EmptyState'
import { Notice } from '../components/Notice'
import { ApiError, api } from '../lib/api'
import { formatDateTime } from '../lib/format'
import type { Note } from './types'

interface NotesPanelProps {
  projectId: string
  notes: Note[]
  onChanged: (notes: Note[]) => void
}

function label(category: string): string {
  return NOTE_CATEGORIES.find((entry) => entry.value === category)?.label ?? 'General'
}

/** Internal notes. Never sent to the customer and never shown outside here. */
export function NotesPanel({ projectId, notes, onChanged }: NotesPanelProps) {
  const [draft, setDraft] = useState('')
  const [category, setCategory] = useState<string>(NOTE_CATEGORIES[0].value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ note: Note }>(`/api/admin/projects/${projectId}/notes`, {
        method: 'POST',
        body: { body: draft.trim(), category },
      })
      onChanged([result.note, ...notes])
      setDraft('')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The note could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(id: string) {
    if (!editBody.trim()) return
    setError(null)
    try {
      const result = await api<{ note: Note }>(`/api/admin/notes/${id}`, {
        method: 'PATCH',
        body: { body: editBody.trim() },
      })
      onChanged(notes.map((note) => (note.id === id ? result.note : note)))
      setEditing(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The note could not be updated.')
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await api(`/api/admin/notes/${id}`, { method: 'DELETE' })
      onChanged(notes.filter((note) => note.id !== id))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The note could not be removed.')
    }
  }

  return (
    <section className="card stack">
      <div className="stack-sm">
        <p className="eyebrow">Internal only</p>
        <h2>Notes</h2>
        <p className="private-banner">
          <span aria-hidden="true">🔒</span> Private to NexalField — never shown to the customer
        </p>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <form className="stack-sm" onSubmit={add}>
        <label className="label" htmlFor="note-body">
          Add a note
        </label>
        <textarea
          id="note-body"
          className="textarea"
          rows={3}
          maxLength={5000}
          value={draft}
          placeholder="Anything the team should know about this project…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="row">
          <label className="visually-hidden" htmlFor="note-category">
            Note category
          </label>
          <select
            id="note-category"
            className="select"
            style={{ maxWidth: 200 }}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {NOTE_CATEGORIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>
            {busy ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet">
          Notes are listed newest first, with the date and who wrote them.
        </EmptyState>
      ) : (
        <ul className="stack-sm" style={{ listStyle: 'none' }}>
          {notes.map((note) => (
            <li key={note.id} className="note">
              <div className="note-head">
                <span className="badge badge-plain">{label(note.category)}</span>
                <span>{formatDateTime(note.createdAt)}</span>
                {note.author ? <span>· {note.author}</span> : null}
                {note.updatedAt && note.updatedAt !== note.createdAt ? <span>· edited</span> : null}
              </div>

              {editing === note.id ? (
                <div className="stack-sm">
                  <label className="visually-hidden" htmlFor={`note-edit-${note.id}`}>
                    Edit note
                  </label>
                  <textarea
                    id={`note-edit-${note.id}`}
                    className="textarea"
                    rows={3}
                    maxLength={5000}
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                  />
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => void saveEdit(note.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="note-body">{note.body}</p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => {
                        setEditing(note.id)
                        setEditBody(note.body)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ color: 'var(--danger)', borderColor: 'transparent' }}
                      onClick={() => void remove(note.id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
