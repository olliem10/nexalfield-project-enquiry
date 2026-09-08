import { formatSavedAt } from '../lib/format'
import type { SaveState } from '../questionnaire/useQuestionnaire'

interface AutosaveIndicatorProps {
  state: SaveState
  savedAt: string | null
  onRetry: () => void
}

/** Quiet by design: it reports state without competing with the questions. */
export function AutosaveIndicator({ state, savedAt, onRetry }: AutosaveIndicatorProps) {
  if (state === 'error') {
    return (
      <span className="autosave autosave-error">
        <span className="autosave-dot" aria-hidden="true" />
        <span role="status">Not saved</span>
        <button type="button" className="btn-link" onClick={onRetry}>
          Retry
        </button>
      </span>
    )
  }

  if (state === 'saving') {
    return (
      <span className="autosave">
        <span className="autosave-dot" aria-hidden="true" />
        <span role="status">Saving…</span>
      </span>
    )
  }

  if (state === 'saved' || savedAt) {
    return (
      <span className="autosave autosave-saved">
        <span className="autosave-dot" aria-hidden="true" />
        <span role="status">Saved {formatSavedAt(savedAt)}</span>
      </span>
    )
  }

  return (
    <span className="autosave">
      <span className="autosave-dot" aria-hidden="true" />
      <span>Answers save automatically</span>
    </span>
  )
}
