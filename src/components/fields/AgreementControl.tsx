import type { Field } from '@shared/questionnaire'

interface AgreementControlProps {
  field: Field
  value: boolean
  invalid: boolean
  describedBy?: string
  onChange: (value: boolean) => void
}

export function AgreementControl({
  field,
  value,
  invalid,
  describedBy,
  onChange,
}: AgreementControlProps) {
  return (
    <div className="stack-sm">
      {field.agreementText ? (
        <div className="card-quiet">
          <p className="small">{field.agreementText}</p>
        </div>
      ) : null}
      <label className={`choice${value ? ' choice-selected' : ''}`}>
        <input
          id={field.id}
          type="checkbox"
          checked={value === true}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={field.required || undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="choice-body">
          <span className="choice-label">
            Yes — the information I have provided is accurate to the best of my knowledge.
          </span>
        </span>
      </label>
    </div>
  )
}
