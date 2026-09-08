import { DAYS, type DayHours, type Field, type HoursValue } from '@shared/questionnaire'

interface HoursControlProps {
  field: Field
  value: HoursValue
  describedBy?: string
  onChange: (value: HoursValue) => void
}

const WEEKDAYS = DAYS.slice(0, 5).map((day) => day.key)

/**
 * Structured opening hours: one row per day with a closed toggle and real time
 * inputs, rather than asking the customer to type everything into one textbox.
 */
export function HoursControl({ field, value, describedBy, onChange }: HoursControlProps) {
  const hours = value ?? {}

  function update(day: string, patch: Partial<DayHours>) {
    onChange({ ...hours, [day]: { ...hours[day], ...patch } })
  }

  function copyMondayToWeekdays() {
    const monday = hours.monday
    if (!monday) return
    const next = { ...hours }
    for (const day of WEEKDAYS) next[day] = { ...monday }
    onChange(next)
  }

  return (
    <div
      className="stack"
      role="group"
      aria-labelledby={`${field.id}-label`}
      aria-describedby={describedBy}
    >
      <div className="hours">
        {DAYS.map((day) => {
          const entry = hours[day.key] ?? {}
          const closed = entry.closed === true
          return (
            <div key={day.key} className="hours-row">
              <div className="hours-day">
                <span>{day.label}</span>
                <label className="hours-toggle">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(event) =>
                      update(day.key, {
                        closed: event.target.checked,
                        ...(event.target.checked ? { open: '', close: '' } : {}),
                      })
                    }
                  />
                  Closed
                </label>
              </div>

              {closed ? (
                <p className="hours-closed">Closed all day</p>
              ) : (
                <div className="hours-times">
                  <div>
                    <label className="visually-hidden" htmlFor={`${field.id}-${day.key}-open`}>
                      {day.label} opening time
                    </label>
                    <input
                      id={`${field.id}-${day.key}-open`}
                      className="input time-input"
                      type="time"
                      value={entry.open ?? ''}
                      onChange={(event) => update(day.key, { open: event.target.value })}
                    />
                  </div>
                  <span className="hours-dash" aria-hidden="true">
                    to
                  </span>
                  <div>
                    <label className="visually-hidden" htmlFor={`${field.id}-${day.key}-close`}>
                      {day.label} closing time
                    </label>
                    <input
                      id={`${field.id}-${day.key}-close`}
                      className="input time-input"
                      type="time"
                      value={entry.close ?? ''}
                      onChange={(event) => update(day.key, { close: event.target.value })}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="visually-hidden" htmlFor={`${field.id}-${day.key}-note`}>
                  {day.label} note
                </label>
                <input
                  id={`${field.id}-${day.key}-note`}
                  className="input"
                  value={entry.note ?? ''}
                  maxLength={120}
                  placeholder="Note (optional)"
                  onChange={(event) => update(day.key, { note: event.target.value })}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={copyMondayToWeekdays}
          disabled={!hours.monday || (!hours.monday.open && !hours.monday.closed)}
        >
          Apply Monday to Friday
        </button>
      </div>
    </div>
  )
}
