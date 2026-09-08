import type { ColourValue, Field } from '@shared/questionnaire'

interface ColoursControlProps {
  field: Field
  value: ColourValue[]
  describedBy?: string
  onChange: (value: ColourValue[]) => void
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Brand colours as structured rows: a value (hex, Pantone, or a plain
 * description) plus an optional note about where it is used.
 */
export function ColoursControl({ field, value, describedBy, onChange }: ColoursControlProps) {
  const rows = value?.length ? value : [{ value: '', note: '' }]

  function update(index: number, patch: Partial<ColourValue>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div
      className="repeater"
      role="group"
      aria-labelledby={`${field.id}-label`}
      aria-describedby={describedBy}
    >
      {rows.map((row, index) => (
        <div key={index} className="repeater-row repeater-row-inline">
          <div className="stack-sm">
            <label className="help" htmlFor={`${field.id}-value-${index}`}>
              Colour {index + 1}
            </label>
            <div className="swatch">
              <span
                className="swatch-chip"
                style={HEX.test(row.value?.trim() ?? '') ? { background: row.value.trim() } : undefined}
                aria-hidden="true"
              />
              <input
                id={`${field.id}-value-${index}`}
                className="input"
                value={row.value ?? ''}
                maxLength={60}
                placeholder="#245945 or 'deep green'"
                onChange={(event) => update(index, { value: event.target.value })}
              />
            </div>
          </div>
          <div className="stack-sm">
            <label className="help" htmlFor={`${field.id}-note-${index}`}>
              Where is it used? (optional)
            </label>
            <input
              id={`${field.id}-note-${index}`}
              className="input"
              value={row.note ?? ''}
              maxLength={160}
              placeholder="Logo, buttons, headings…"
              onChange={(event) => update(index, { note: event.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            disabled={rows.length === 1 && !rows[0].value && !rows[0].note}
          >
            Remove
            <span className="visually-hidden"> colour {index + 1}</span>
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...rows, { value: '', note: '' }])}
          disabled={rows.length >= 12}
        >
          Add another colour
        </button>
      </div>
    </div>
  )
}
