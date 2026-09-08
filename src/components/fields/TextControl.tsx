import type { Field } from '@shared/questionnaire'

interface TextControlProps {
  field: Field
  value: string
  invalid: boolean
  describedBy?: string
  onChange: (value: string) => void
  onBlur?: () => void
}

const INPUT_TYPE: Record<string, string> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
}

const AUTOCOMPLETE: Record<string, string> = {
  contact_name: 'name',
  business_name: 'organization',
  email: 'email',
  phone: 'tel',
}

export function TextControl({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onBlur,
}: TextControlProps) {
  const shared = {
    id: field.id,
    value,
    placeholder: field.placeholder,
    maxLength: field.maxLength,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'aria-required': field.required || undefined,
    onBlur,
  }

  if (field.type === 'textarea') {
    const remaining = field.maxLength ? field.maxLength - value.length : null
    return (
      <div className="stack-sm">
        <textarea
          {...shared}
          className="textarea"
          rows={field.rows ?? 5}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.maxLength && value.length > field.maxLength * 0.8 ? (
          <p className="counter" aria-live="polite">
            {remaining} characters remaining
          </p>
        ) : null}
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <select
        {...shared}
        className="select"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Please choose…</option>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      {...shared}
      className="input"
      type={INPUT_TYPE[field.type] ?? 'text'}
      inputMode={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : undefined}
      autoComplete={AUTOCOMPLETE[field.id] ?? 'off'}
      spellCheck={field.type === 'email' || field.type === 'url' ? false : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
