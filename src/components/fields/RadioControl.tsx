import type { Field } from '@shared/questionnaire'

interface RadioControlProps {
  field: Field
  value: string
  invalid: boolean
  describedBy?: string
  onChange: (value: string) => void
}

export function RadioControl({ field, value, invalid, describedBy, onChange }: RadioControlProps) {
  const options = field.options ?? []
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${field.id}-label`}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={`choice-list${options.length > 2 ? ' choice-grid' : ''}`}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <label key={option.value} className={`choice${selected ? ' choice-selected' : ''}`}>
            <input
              type="radio"
              name={field.id}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
            />
            <span className="choice-body">
              <span className="choice-label">{option.label}</span>
              {option.hint ? <span className="choice-hint">{option.hint}</span> : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}
