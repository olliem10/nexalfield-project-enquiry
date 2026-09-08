import { useState } from 'react'
import { CopyButton } from '../components/CopyButton'
import { Notice } from '../components/Notice'
import { resumeLink } from './storage'

interface SaveLaterProps {
  token: string
  onSave: () => Promise<boolean>
}

/**
 * Save Progress / Continue Later. Progress already lives on the server, so this
 * flushes the current answers and hands over a single-purpose continuation link
 * for continuing on another device.
 */
export function SaveLater({ token, onSave }: SaveLaterProps) {
  const [state, setState] = useState<'idle' | 'saving' | 'ready' | 'error'>('idle')
  const link = resumeLink(token)

  async function saveNow() {
    setState('saving')
    const ok = await onSave()
    setState(ok ? 'ready' : 'error')
  }

  return (
    <div className="stack-sm">
      {state === 'idle' || state === 'saving' ? (
        <button type="button" className="btn btn-sm" onClick={() => void saveNow()} disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save & continue later'}
        </button>
      ) : null}

      {state === 'error' ? (
        <Notice
          tone="error"
          title="We could not save just now"
          action={
            <button type="button" className="btn btn-sm" onClick={() => void saveNow()}>
              Try again
            </button>
          }
        >
          Your answers are still here on screen — nothing has been lost.
        </Notice>
      ) : null}

      {state === 'ready' ? (
        <div className="resume-box">
          <p className="small">
            <strong>Saved.</strong> Keep this link to continue on another device. It is the only way
            back into your questionnaire, so treat it like a password.
          </p>
          <div className="resume-link">
            <input
              className="input"
              readOnly
              value={link}
              aria-label="Your continuation link"
              onFocus={(event) => event.currentTarget.select()}
            />
            <CopyButton value={link} label="Copy link" />
          </div>
          <p className="small muted">
            On this device you can simply return to the questionnaire — we will remember where you
            were.
          </p>
        </div>
      ) : null}
    </div>
  )
}
