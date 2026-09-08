import { SOCIAL_PLATFORMS, type Field, type SocialValue } from '@shared/questionnaire'

interface SocialControlProps {
  field: Field
  value: SocialValue[]
  describedBy?: string
  onChange: (value: SocialValue[]) => void
}

export function SocialControl({ field, value, describedBy, onChange }: SocialControlProps) {
  const rows = value?.length ? value : [{ platform: SOCIAL_PLATFORMS[0], url: '' }]

  function update(index: number, patch: Partial<SocialValue>) {
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
            <label className="help" htmlFor={`${field.id}-platform-${index}`}>
              Platform
            </label>
            <select
              id={`${field.id}-platform-${index}`}
              className="select"
              value={row.platform || SOCIAL_PLATFORMS[0]}
              onChange={(event) => update(index, { platform: event.target.value })}
            >
              {SOCIAL_PLATFORMS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </div>
          <div className="stack-sm">
            <label className="help" htmlFor={`${field.id}-url-${index}`}>
              Link or username
            </label>
            <input
              id={`${field.id}-url-${index}`}
              className="input"
              value={row.url ?? ''}
              maxLength={400}
              inputMode="url"
              spellCheck={false}
              placeholder="https://…"
              onChange={(event) => update(index, { url: event.target.value })}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            disabled={rows.length === 1 && !rows[0].url}
          >
            Remove
            <span className="visually-hidden"> link {index + 1}</span>
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange([...rows, { platform: SOCIAL_PLATFORMS[0], url: '' }])}
          disabled={rows.length >= 15}
        >
          Add another profile
        </button>
      </div>
    </div>
  )
}
