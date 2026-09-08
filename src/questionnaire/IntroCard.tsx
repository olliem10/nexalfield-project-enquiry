import { Notice } from '../components/Notice'
import { TOTAL_STEPS } from '@shared/questionnaire'
import { WhatHappensNext } from './WhatHappensNext'

interface IntroCardProps {
  notice: string | null
  error: string | null
  onStart: () => void
}

export function IntroCard({ notice, error, onStart }: IntroCardProps) {
  return (
    <div className="stack-lg" style={{ paddingBottom: 40 }}>
      {notice ? (
        <Notice tone="warning" title="Starting fresh">
          {notice}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" title="We could not start the enquiry">
          {error}
        </Notice>
      ) : null}

      <div className="card stack">
        <p className="eyebrow">Before you begin</p>
        <h2>How long will this take?</h2>
        <p className="lede">
          Most people finish in approximately <strong>10–15 minutes</strong>. There are{' '}
          {TOTAL_STEPS} short sections, and only a handful of questions are required — the more
          detail you give, the more accurately we can represent your business.
        </p>

        <hr className="hairline" />

        <div className="field-grid field-grid-2">
          <div className="stack-sm">
            <h3>Your progress is saved</h3>
            <p className="help">
              Every answer is saved as you go, so you can stop at any point and continue later from
              where you left off — even on a different device.
            </p>
          </div>
          <div className="stack-sm">
            <h3>What is useful to have ready</h3>
            <p className="help">
              Your logo, brand colours, any photos you would like used, and a rough idea of the
              pages you want. None of it is essential today; we can help with anything missing.
            </p>
          </div>
        </div>

        <div className="row" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={onStart}>
            Start Project Enquiry
          </button>
          <span className="small muted">No account needed</span>
        </div>
      </div>

      <WhatHappensNext />
    </div>
  )
}
