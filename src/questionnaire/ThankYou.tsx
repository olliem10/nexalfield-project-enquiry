import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../lib/api'
import { Notice } from '../components/Notice'
import { Skeleton } from '../components/Skeleton'
import { ProjectSummaryView, type ProjectSummary } from '../components/ProjectSummaryView'

interface ThankYouProps {
  reference: string | null
  token: string | null
  onStartAnother: () => void
}

interface SummaryResponse {
  reference: string | null
  status: 'pending' | 'generating' | 'ready' | 'failed'
  summary: ProjectSummary | null
  error: string | null
  attempts: number
}

const POLL_MS = 4000
const MAX_POLLS = 12

/**
 * Success page. The AI project brief is requested here rather than during
 * submission, so a slow or unavailable model can never affect whether the
 * questionnaire was received.
 */
export function ThankYou({ reference, token, onStartAnother }: ThankYouProps) {
  const [state, setState] = useState<SummaryResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const polls = useRef(0)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let timer: number | undefined

    async function tick(generate: boolean) {
      try {
        const result = await api<SummaryResponse>('/api/questionnaire/summary', {
          method: generate ? 'POST' : 'GET',
          token,
        })
        if (cancelled) return
        setState(result)
        polls.current += 1
        if (
          (result.status === 'pending' || result.status === 'generating') &&
          polls.current < MAX_POLLS
        ) {
          timer = window.setTimeout(() => void tick(false), POLL_MS)
        }
      } catch (error) {
        if (cancelled) return
        // The summary is a convenience; never let it look like a failed submission.
        setFailed(true)
        if (error instanceof ApiError && error.status === 429 && polls.current < MAX_POLLS) {
          timer = window.setTimeout(() => void tick(false), POLL_MS * 2)
        }
      }
    }

    void tick(true)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [token])

  const generating = state?.status === 'pending' || state?.status === 'generating'

  return (
    <div className="stack-lg" style={{ paddingBottom: 48 }}>
      <div className="card stack">
        <p className="eyebrow">Project Enquiry received</p>
        <h1>Thank You</h1>
        <p className="lede">
          Your website project enquiry has been received. We&rsquo;ll review your
          requirements and contact you if we need any additional information.
        </p>
        <p className="lede">
          Expected review time: <strong>1–2 business days.</strong>
        </p>

        {reference ? (
          <div className="reference-plate reference-plate-arrive">
            <span className="small muted">Your reference number</span>
            <strong className="mono">{reference}</strong>
            <span className="small muted">Quote this in any emails about your project</span>
          </div>
        ) : null}

        <p className="help">
          A confirmation email is on its way. If it has not arrived within a few minutes, check your
          spam folder or reply to any previous email from NexalField.
        </p>
      </div>

      <div className="card stack">
        <div className="spread">
          <div>
            <p className="eyebrow">Prepared for your project</p>
            <h2>Your project summary</h2>
          </div>
        </div>

        {generating || (!state && !failed) ? (
          <div className="stack-sm" aria-live="polite">
            <p className="help">We are putting together a summary of your project…</p>
            <Skeleton width="90%" />
            <Skeleton width="76%" />
            <Skeleton width="58%" />
          </div>
        ) : null}

        {state?.status === 'ready' && state.summary ? (
          <ProjectSummaryView summary={state.summary} />
        ) : null}

        {(failed || state?.status === 'failed' || (generating && polls.current >= MAX_POLLS)) &&
        state?.status !== 'ready' ? (
          <Notice tone="info" title="Summary still being prepared">
            Your enquiry has been received in full — this summary is just a convenience and is
            still being generated. Ollie will see the complete version, so there is nothing more for
            you to do.
          </Notice>
        ) : null}
      </div>

      <div className="row">
        <a className="btn" href="https://www.nexalfield.com" rel="noreferrer">
          Back to nexalfield.com
        </a>
        <button type="button" className="btn" onClick={onStartAnother}>
          Start another enquiry
        </button>
      </div>
    </div>
  )
}
