import { FIELD_BY_ID } from '@shared/questionnaire'
import { EmptyState } from '../components/EmptyState'
import { formatBytes, formatDateTime } from '../lib/format'
import type { FileMeta } from './types'

interface FilesPanelProps {
  files: FileMeta[]
}

const PREVIEWABLE = ['image/png', 'image/jpeg', 'application/pdf']

/**
 * Uploads live in a private object store with no public URL. These links go
 * through an admin-authenticated function that streams the file as a download.
 */
export function FilesPanel({ files }: FilesPanelProps) {
  return (
    <section className="card stack">
      <div>
        <p className="eyebrow">Customer uploads</p>
        <h2>Files</h2>
      </div>

      {files.length === 0 ? (
        <EmptyState title="No files uploaded">
          The customer did not attach a logo, photos or documents.
        </EmptyState>
      ) : (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id} className="file-row">
              <div className="file-main">
                <div>
                  <p className="file-name">{file.fileName}</p>
                  <p className="file-meta">
                    {FIELD_BY_ID.get(file.fieldId)?.label ?? file.fieldId} ·{' '}
                    {formatBytes(file.sizeBytes)} · {formatDateTime(file.createdAt)}
                  </p>
                </div>
                <div className="file-actions">
                  {PREVIEWABLE.includes(file.contentType) ? (
                    <a
                      className="btn btn-sm"
                      href={`/api/admin/files/${file.id}?disposition=inline`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ borderBottom: '1px solid var(--line-strong)' }}
                    >
                      View
                    </a>
                  ) : null}
                  <a
                    className="btn btn-sm"
                    href={`/api/admin/files/${file.id}`}
                    style={{ borderBottom: '1px solid var(--line-strong)' }}
                  >
                    Download
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="small muted">
        Files are stored privately and are only reachable through this dashboard while you are
        signed in. SVG files are always downloaded rather than previewed.
      </p>
    </section>
  )
}
