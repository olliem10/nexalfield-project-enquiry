import { FIELD_BY_ID, SECTIONS, formatAnswer, visibleFields } from '@shared/questionnaire'
import { formatBytes } from '../lib/format'
import type { Answers } from '@shared/questionnaire'
import type { FileMeta } from './types'

interface AnswersViewProps {
  answers: Answers
  files: FileMeta[]
}

/**
 * The questionnaire exactly as the customer saw it, in the original seven
 * sections, rendered from the same field definitions.
 */
export function AnswersView({ answers, files }: AnswersViewProps) {
  return (
    <div className="stack">
      {SECTIONS.map((section) => {
        const fields = visibleFields(section, answers)
        return (
          <section key={section.id} className="review-section">
            <div className="review-head">
              <h3>
                <span className="muted small">{section.step}. </span>
                {section.title}
              </h3>
            </div>
            <dl className="answer-list">
              {fields.map((field) => {
                if (field.type === 'files') {
                  const attached = files.filter((file) => file.fieldId === field.id)
                  return (
                    <div key={field.id} className="answer-row">
                      <dt className="answer-label">{field.label}</dt>
                      <dd className="answer-value">
                        {attached.length === 0 ? (
                          <span className="answer-empty">Nothing attached</span>
                        ) : (
                          <ul style={{ listStyle: 'none', display: 'grid', gap: 6 }}>
                            {attached.map((file) => (
                              <li key={file.id}>
                                <a href={`/api/admin/files/${file.id}`}>{file.fileName}</a>{' '}
                                <span className="muted small">
                                  ({formatBytes(file.sizeBytes)})
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  )
                }

                const text = formatAnswer(field, answers[field.id])
                return (
                  <div key={field.id} className="answer-row">
                    <dt className="answer-label">{field.label}</dt>
                    <dd className="answer-value">
                      {text || <span className="answer-empty">Not answered</span>}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
        )
      })}

      {/* Anything answered before a question was reworded still gets shown. */}
      <UnmappedAnswers answers={answers} />
    </div>
  )
}

function UnmappedAnswers({ answers }: { answers: Answers }) {
  const known = new Set(SECTIONS.flatMap((section) => section.fields.map((field) => field.id)))
  const extras = Object.keys(answers).filter((key) => !known.has(key))
  if (extras.length === 0) return null

  return (
    <section className="review-section">
      <div className="review-head">
        <h3>Other stored answers</h3>
      </div>
      <dl className="answer-list">
        {extras.map((key) => {
          const field = FIELD_BY_ID.get(key)
          return (
            <div key={key} className="answer-row">
              <dt className="answer-label">{field?.label ?? key}</dt>
              <dd className="answer-value">{JSON.stringify(answers[key])}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
