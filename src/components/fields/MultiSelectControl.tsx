import { useState } from 'react'
import { asMulti, type Field, type MultiValue } from '@shared/questionnaire'

interface MultiSelectControlProps {
  field: Field
  value: MultiValue
  invalid: boolean
  describedBy?: string
  onChange: (value: MultiValue) => void
}

/**
 * Multi-select with an optional free-text "Other" list, so a customer is never
 * forced to squeeze an answer into one of our options.
 */
export function MultiSelectControl({
  field,
  value,
  invalid,
  describedBy,
  onChange,
}: MultiSelectControlProps) {
  const current = asMulti(value)
  const selected = current.selected ?? []
  const custom = current.custom ?? []
  const [draft, setDraft] = useState('')

  function toggle(option: string) {
    const next = selected.includes(option)
      ? selected.filter((entry) => entry !== option)
      : [...selected, option]
    onChange({ selected: next, custom })
  }

  function addCustom() {
    const entry = draft.trim()
    if (!entry || custom.length >= 12) return
    onChange({ selected, custom: [...custom, entry.slice(0, 200)] })
    setDraft('')
  }

  return (
    <div className="stack">
      <div
        role="group"
        aria-labelledby={`${field.id}-label`}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="choice-list choice-grid"
      >
        {(field.options ?? []).map((option) => {
          const active = selected.includes(option.value)
          return (
            <label key={option.value} className={`choice${active ? ' choice-selected' : ''}`}>
              <input type="checkbox" checked={active} onChange={() => toggle(option.value)} />
              <span className="choice-body">
                <span className="choice-label">{option.label}</span>
                {option.hint ? <span className="choice-hint">{option.hint}</span> : null}
              </span>
            </label>
          )
        })}
      </div>

      {field.allowCustom ? (
        <div className="stack-sm">
          <label className="help" htmlFor={`${field.id}-custom`}>
            {field.customLabel ?? 'Anything else? Add your own'}
          </label>
          {custom.length > 0 ? (
            <ul className="row" style={{ listStyle: 'none' }}>
              {custom.map((entry, index) => (
                <li key={`${entry}-${index}`} className="tag">
                  {entry}
                  <button
                    type="button"
                    className="btn-link"
                    style={{ marginLeft: 8, borderBottom: 0 }}
                    onClick={() =>
                      onChange({ selected, custom: custom.filter((_, i) => i !== index) })
                    }
                  >
                    <span aria-hidden="true">×</span>
                    <span className="visually-hidden">Remove {entry}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="row">
            <input
              id={`${field.id}-custom`}
              className="input"
              style={{ flex: '1 1 220px' }}
              value={draft}
              maxLength={200}
              placeholder="Type and press add"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustom()
                }
              }}
            />
            <button type="button" className="btn btn-sm" onClick={addCustom} disabled={!draft.trim()}>
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
