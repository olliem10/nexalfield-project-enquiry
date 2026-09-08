import { useRef, useState } from 'react'
import { ACCEPTED_UPLOAD_ATTR, MAX_FILES_PER_FIELD, type Field } from '@shared/questionnaire'
import { formatBytes } from '../../lib/format'
import type { UploadManager } from '../../questionnaire/uploads'

interface FileUploadControlProps {
  field: Field
  uploads: UploadManager
  describedBy?: string
}

/**
 * Drag-and-drop uploader with a plain file picker for touch devices, per-file
 * progress, retry and removal. Files are never held in the answers payload —
 * they are streamed to private storage and referenced by id.
 */
export function FileUploadControl({ field, uploads, describedBy }: FileUploadControlProps) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const stored = uploads.files.filter((file) => file.fieldId === field.id)
  const pending = uploads.pending.filter((row) => row.fieldId === field.id)
  const full = stored.length + pending.length >= MAX_FILES_PER_FIELD

  function accept(list: FileList | null) {
    if (!list || list.length === 0) return
    uploads.addFiles(field.id, Array.from(list))
  }

  async function removeFile(id: string) {
    setRemoveError(null)
    try {
      await uploads.remove(id)
    } catch {
      setRemoveError('That file could not be removed just now. Please try again.')
    }
  }

  return (
    <div className="stack-sm">
      <div
        className={`dropzone${dragging ? ' dropzone-active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          accept(event.dataTransfer.files)
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={() => input.current?.click()}
          disabled={full}
          aria-describedby={describedBy}
        >
          Choose {field.multiple === false ? 'a file' : 'files'}
        </button>
        <p className="dropzone-hint">
          or drag and drop here · PNG, JPG, SVG or PDF · up to 20MB each
        </p>
        <input
          ref={input}
          id={field.id}
          type="file"
          className="visually-hidden"
          accept={ACCEPTED_UPLOAD_ATTR}
          multiple={field.multiple !== false}
          onChange={(event) => {
            accept(event.target.files)
            event.target.value = ''
          }}
        />
      </div>

      {full ? (
        <p className="help">
          You have reached the limit of {MAX_FILES_PER_FIELD} files here. Remove one to add another.
        </p>
      ) : null}

      {removeError ? <p className="field-error">{removeError}</p> : null}

      {stored.length > 0 || pending.length > 0 ? (
        <ul className="file-list">
          {stored.map((file) => (
            <li key={file.id} className="file-row">
              <div className="file-main">
                <div>
                  <p className="file-name">{file.fileName}</p>
                  <p className="file-meta">
                    {formatBytes(file.sizeBytes)} · Uploaded
                  </p>
                </div>
                <div className="file-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => void removeFile(file.id)}
                  >
                    Remove
                    <span className="visually-hidden"> {file.fileName}</span>
                  </button>
                </div>
              </div>
            </li>
          ))}

          {pending.map((row) => (
            <li
              key={row.key}
              className={`file-row${row.status === 'error' ? ' file-row-error' : ''}`}
            >
              <div className="file-main">
                <div>
                  <p className="file-name">{row.fileName}</p>
                  <p className="file-meta" role="status">
                    {row.status === 'error'
                      ? row.error
                      : `${formatBytes(row.sizeBytes)} · Uploading ${row.progress}%`}
                  </p>
                </div>
                <div className="file-actions">
                  {row.status === 'error' ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => uploads.retry(row.key)}
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => uploads.dismiss(row.key)}
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <span className="spinner" aria-hidden="true" />
                  )}
                </div>
              </div>
              {row.status === 'uploading' ? (
                <div className="upload-bar" aria-hidden="true">
                  <span style={{ width: `${row.progress}%` }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="help">Nothing attached yet.</p>
      )}
    </div>
  )
}
