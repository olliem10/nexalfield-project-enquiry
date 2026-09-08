import type { AddressValue, Field } from '@shared/questionnaire'

interface AddressControlProps {
  field: Field
  value: AddressValue
  describedBy?: string
  onChange: (value: AddressValue) => void
}

const PARTS: { key: keyof AddressValue; label: string; autoComplete: string; wide?: boolean }[] = [
  { key: 'line1', label: 'Address line 1', autoComplete: 'address-line1', wide: true },
  { key: 'line2', label: 'Address line 2 (optional)', autoComplete: 'address-line2', wide: true },
  { key: 'city', label: 'Town or city', autoComplete: 'address-level2' },
  { key: 'county', label: 'County', autoComplete: 'address-level1' },
  { key: 'postcode', label: 'Postcode', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', autoComplete: 'country-name' },
]

export function AddressControl({ field, value, describedBy, onChange }: AddressControlProps) {
  return (
    <div
      className="field-grid field-grid-2"
      role="group"
      aria-labelledby={`${field.id}-label`}
      aria-describedby={describedBy}
    >
      {PARTS.map((part) => (
        <div
          key={part.key}
          className="stack-sm"
          style={part.wide ? { gridColumn: '1 / -1' } : undefined}
        >
          <label className="help" htmlFor={`${field.id}-${part.key}`}>
            {part.label}
          </label>
          <input
            id={`${field.id}-${part.key}`}
            className="input"
            value={value?.[part.key] ?? ''}
            maxLength={200}
            autoComplete={part.autoComplete}
            onChange={(event) => onChange({ ...value, [part.key]: event.target.value })}
          />
        </div>
      ))}
    </div>
  )
}
