import { useId } from 'react'
import type { AnswerValue, Field } from '@shared/questionnaire'
import type { UploadManager } from '../questionnaire/uploads'
import { FieldControl, LABELLED_TYPES } from './fields/FieldControl'

interface QuestionCardProps {
  field: Field
  value: AnswerValue
  answered: boolean
  active: boolean
  upcoming: boolean
  error?: string
  uploads: UploadManager
  onChange: (value: AnswerValue) => void
  onActivate: () => void
}

/**
 * One question. The card the customer is working in is emphasised, answered
 * questions are marked complete, and questions further down are dimmed until
 * they are reached — restrained enough not to feel like an animation demo.
 */
export function QuestionCard({
  field,
  value,
  answered,
  active,
  upcoming,
  error,
  uploads,
  onChange,
  onActivate,
}: QuestionCardProps) {
  const helpId = useId()
  const errorId = useId()
  const usesLabel = LABELLED_TYPES.includes(field.type)

  const describedBy =
    [field.help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  const className = [
    'question',
    active ? 'question-active' : '',
    upcoming && !active ? 'question-upcoming' : '',
    error ? 'question-invalid' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const labelContent = (
    <>
      {field.label}
      {field.required ? (
        <>
          <span className="required-dot" aria-hidden="true">
            *
          </span>
          <span className="visually-hidden"> (required)</span>
        </>
      ) : (
        <span className="question-optional"> — optional</span>
      )}
    </>
  )

  return (
    <section
      className={className}
      onFocusCapture={onActivate}
      onPointerDown={onActivate}
      aria-labelledby={`${field.id}-label`}
    >
      <div className="question-head">
        <div className="question-label">
          {usesLabel ? (
            <label className="label" id={`${field.id}-label`} htmlFor={field.id}>
              {labelContent}
            </label>
          ) : (
            <p className="label" id={`${field.id}-label`}>
              {labelContent}
            </p>
          )}
          {field.help ? (
            <p className="help" id={helpId}>
              {field.help}
            </p>
          ) : null}
        </div>
        <p className={`question-state${answered ? ' question-state-done' : ''}`}>
          {answered ? (
            <>
              <span aria-hidden="true">✓ </span>Completed
            </>
          ) : null}
        </p>
      </div>

      <FieldControl
        field={field}
        value={value}
        invalid={Boolean(error)}
        describedBy={describedBy}
        uploads={uploads}
        onChange={onChange}
      />

      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </section>
  )
}
