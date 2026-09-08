import { TOTAL_STEPS, type Section } from '@shared/questionnaire'
import { ProgressBar } from '../components/ProgressBar'

interface WizardProgressProps {
  step: number
  percent: number
  section: Section | undefined
  reviewing?: boolean
}

export function WizardProgress({ step, percent, section, reviewing }: WizardProgressProps) {
  return (
    <div className="progress-panel">
      <div className="progress-labels">
        <span className="progress-step">
          {reviewing ? 'Review' : `Step ${step} of ${TOTAL_STEPS}`}
          {section && !reviewing ? <span className="progress-section"> · {section.title}</span> : null}
          {reviewing ? <span className="progress-section"> · Check your answers</span> : null}
        </span>
        <span className="progress-percent">{percent}% complete</span>
      </div>
      <ProgressBar percent={percent} label={`Project Enquiry progress: ${percent}% complete`} />
      <ol className="step-dots" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <li
            key={index}
            className={`step-dot${
              index + 1 === step && !reviewing
                ? ' step-dot-current'
                : index + 1 < step || reviewing
                  ? ' step-dot-done'
                  : ''
            }`}
          />
        ))}
      </ol>
    </div>
  )
}
