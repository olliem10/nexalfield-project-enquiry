import {
  FIELD_BY_ID,
  SECTIONS,
  formatAnswer,
  visibleFields,
  type Field,
} from '@shared/questionnaire'
import { AgreementControl } from '../components/fields/AgreementControl'
import { Notice } from '../components/Notice'
import { formatBytes } from '../lib/format'
import type { Questionnaire } from './useQuestionnaire'

interface ReviewStepProps {
  questionnaire: Questionnaire
}

const AGREEMENT_ID = 'agreement'

export function ReviewStep({ questionnaire }: ReviewStepProps) {
  const { answers, uploads, goToStep, sectionErrors, errors, setAnswer, submit, submitting, submitError } =
    questionnaire

  const agreement = FIELD_BY_ID.get(AGREEMENT_ID) as Field | undefined
  const outstanding = [...sectionErrors.keys()].sort((a, b) => a - b)
  const blocked = outstanding.length > 0 || uploads.uploading

  function renderValue(field: Field) {
    if (field.type === 'files') {
      const attached = uploads.files.filter((file) => file.fieldId === field.id)
      if (attached.length === 0) return <span className="answer-empty">Nothing attached</span>
      return (
        <ul style={{ listStyle: 'none', display: 'grid', gap: 4 }}>
          {attached.map((file) => (
            <li key={file.id}>
              {file.fileName} <span className="muted small">({formatBytes(file.sizeBytes)})</span>
            </li>
          ))}
        </ul>
      )
    }
    const text = formatAnswer(field, answers[field.id])
    if (!text) return <span className="answer-empty">Not answered</span>
    return text
  }

  return (
    <div className="stack-lg" style={{ paddingBottom: 24 }}>
      <div className="section-intro">
        <p className="eyebrow">Final check</p>
        <h2>Review your answers</h2>
        <p className="lede">
          Have a read through before you send it to us. You can edit any section — nothing you have
          entered will be lost.
        </p>
      </div>

      {outstanding.length > 0 ? (
        <Notice tone="warning" title="A few required answers still need attention">
          <span>
            Please revisit{' '}
            {outstanding.map((step, index) => (
              <span key={step}>
                {index > 0 ? ', ' : ''}
                <button type="button" className="btn-link" onClick={() => goToStep(step)}>
                  {SECTIONS.find((section) => section.step === step)?.title}
                </button>
              </span>
            ))}
            .
          </span>
        </Notice>
      ) : null}

      {uploads.uploading ? (
        <Notice tone="info" live>
          Files are still uploading. The submit button will unlock as soon as they have finished.
        </Notice>
      ) : null}

      <div className="stack">
        {SECTIONS.map((section) => {
          const fields = visibleFields(section, answers).filter(
            (field) => field.id !== AGREEMENT_ID,
          )
          if (fields.length === 0) return null
          return (
            <section key={section.id} className="review-section">
              <div className="review-head">
                <h3>
                  <span className="muted small">{section.step}. </span>
                  {section.title}
                </h3>
                <button type="button" className="btn btn-sm" onClick={() => goToStep(section.step)}>
                  Edit
                  <span className="visually-hidden"> {section.title}</span>
                </button>
              </div>
              <dl className="answer-list">
                {fields.map((field) => (
                  <div key={field.id} className="answer-row">
                    <dt className="answer-label">{field.label}</dt>
                    <dd className="answer-value">{renderValue(field)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>

      {agreement ? (
        <div className="card stack">
          <h3>{agreement.label}</h3>
          <AgreementControl
            field={agreement}
            value={answers[AGREEMENT_ID] === true}
            invalid={Boolean(errors[AGREEMENT_ID])}
            onChange={(value) => setAnswer(AGREEMENT_ID, value)}
          />
          {errors[AGREEMENT_ID] ? <p className="field-error">{errors[AGREEMENT_ID]}</p> : null}
        </div>
      ) : null}

      {submitError ? (
        <Notice tone="error" title="We could not send your enquiry">
          {submitError}
        </Notice>
      ) : null}

      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void submit()}
          disabled={submitting || blocked}
        >
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Sending…
            </>
          ) : (
            'Submit Project Enquiry'
          )}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => goToStep(SECTIONS.length)}
          disabled={submitting}
        >
          Back
        </button>
      </div>
    </div>
  )
}
