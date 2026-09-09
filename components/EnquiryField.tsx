'use client'

import { useState } from 'react'
import {
  DAYS,
  SOCIAL_PLATFORMS,
  asMulti,
  type AddressValue,
  type AnswerValue,
  type ColourValue,
  type DayHours,
  type Field,
  type HoursValue,
  type SocialValue,
} from '@/lib/enquiry-sections'

function asText(value: AnswerValue): string {
  return typeof value === 'string' ? value : ''
}

const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

export default function EnquiryField({
  field,
  value,
  error,
  onChange,
}: {
  field: Field
  value: AnswerValue
  error?: string
  onChange: (value: AnswerValue) => void
}) {
  const hasSingleControl = SINGLE_CONTROL_TYPES.has(field.type)
  const labelId = `${field.id}-label`

  return (
    <div>
      {hasSingleControl ? (
        <label htmlFor={field.id} className="block text-sm font-medium text-slate-900">
          {field.label}
          {field.required && <span className="ml-1 text-red-600">*</span>}
        </label>
      ) : (
        <p id={labelId} className="block text-sm font-medium text-slate-900">
          {field.label}
          {field.required && <span className="ml-1 text-red-600">*</span>}
        </p>
      )}
      {field.help && <p className="mt-1 text-sm text-slate-500">{field.help}</p>}

      <div className="mt-2" role={hasSingleControl ? undefined : 'group'} aria-labelledby={hasSingleControl ? undefined : labelId}>
        <FieldControl field={field} value={value} onChange={onChange} />
      </div>

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  )
}

const SINGLE_CONTROL_TYPES = new Set<Field['type']>(['text', 'email', 'tel', 'url', 'textarea', 'select'])

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
      return (
        <input
          id={field.id}
          type={field.type === 'text' ? 'text' : field.type}
          className={inputClass}
          value={asText(value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'textarea':
      return (
        <textarea
          id={field.id}
          className={inputClass}
          rows={field.rows ?? 4}
          value={asText(value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )

    case 'select':
      return (
        <select
          id={field.id}
          className={inputClass}
          value={asText(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Please choose…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )

    case 'radio':
      return (
        <div className="space-y-2">
          {field.options?.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={field.id}
                className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={asText(value) === option.value}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )

    case 'multiselect':
      return <MultiSelectControl field={field} value={value} onChange={onChange} />

    case 'address':
      return <AddressControl value={value} onChange={onChange} />

    case 'colours':
      return <ColoursControl value={value} onChange={onChange} />

    case 'hours':
      return <HoursControl value={value} onChange={onChange} />

    case 'social':
      return <SocialControl value={value} onChange={onChange} />

    case 'agreement':
      return (
        <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.agreementText}</span>
        </label>
      )

    default:
      return null
  }
}

function MultiSelectControl({
  field,
  value,
  onChange,
}: {
  field: Field
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  const multi = asMulti(value)

  function toggle(optionValue: string) {
    const selected = multi.selected.includes(optionValue)
      ? multi.selected.filter((v) => v !== optionValue)
      : [...multi.selected, optionValue]
    onChange({ selected, custom: multi.custom })
  }

  function addCustom(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    onChange({ selected: multi.selected, custom: [...multi.custom, trimmed] })
  }

  function removeCustom(index: number) {
    onChange({ selected: multi.selected, custom: multi.custom.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {field.options?.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={multi.selected.includes(option.value)}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {field.allowCustom && (
        <div>
          {multi.custom.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {multi.custom.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeCustom(index)}
                    className="text-indigo-500 hover:text-indigo-700"
                    aria-label={`Remove ${item}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <CustomTextAdd label={field.customLabel} onAdd={addCustom} />
        </div>
      )}
    </div>
  )
}

function CustomTextAdd({ label, onAdd }: { label?: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')

  function submit() {
    onAdd(text)
    setText('')
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        placeholder={label ?? 'Add your own'}
        className={inputClass}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add
      </button>
    </div>
  )
}

function AddressControl({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  const address = (value ?? {}) as AddressValue

  function update(patch: Partial<AddressValue>) {
    onChange({ ...address, ...patch })
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input
        className={`${inputClass} sm:col-span-2`}
        placeholder="Address line 1"
        value={address.line1 ?? ''}
        onChange={(e) => update({ line1: e.target.value })}
      />
      <input
        className={`${inputClass} sm:col-span-2`}
        placeholder="Address line 2"
        value={address.line2 ?? ''}
        onChange={(e) => update({ line2: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Town / city"
        value={address.city ?? ''}
        onChange={(e) => update({ city: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="County"
        value={address.county ?? ''}
        onChange={(e) => update({ county: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Postcode"
        value={address.postcode ?? ''}
        onChange={(e) => update({ postcode: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Country"
        value={address.country ?? ''}
        onChange={(e) => update({ country: e.target.value })}
      />
    </div>
  )
}

function ColoursControl({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  const rows = (Array.isArray(value) ? (value as ColourValue[]) : [])

  function update(index: number, patch: Partial<ColourValue>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  function add() {
    onChange([...rows, { value: '', note: '' }])
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input
            className={inputClass}
            placeholder="#245945 or 'forest green'"
            value={row.value}
            onChange={(e) => update(index, { value: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Note (optional)"
            value={row.note ?? ''}
            onChange={(e) => update(index, { note: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            aria-label="Remove colour"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add a colour
      </button>
    </div>
  )
}

function HoursControl({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  const hours = (value ?? {}) as HoursValue

  function update(day: string, patch: Partial<DayHours>) {
    onChange({ ...hours, [day]: { ...hours[day], ...patch } })
  }

  return (
    <div className="space-y-2">
      {DAYS.map((day) => {
        const dayHours = hours[day.key] ?? {}
        return (
          <div key={day.key} className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-sm text-slate-700">{day.label}</span>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={dayHours.closed === true}
                onChange={(e) => update(day.key, { closed: e.target.checked })}
              />
              Closed
            </label>
            {!dayHours.closed && (
              <>
                <input
                  type="time"
                  className={`${inputClass} w-32`}
                  value={dayHours.open ?? ''}
                  onChange={(e) => update(day.key, { open: e.target.value })}
                />
                <span className="text-sm text-slate-400">to</span>
                <input
                  type="time"
                  className={`${inputClass} w-32`}
                  value={dayHours.close ?? ''}
                  onChange={(e) => update(day.key, { close: e.target.value })}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SocialControl({
  value,
  onChange,
}: {
  value: AnswerValue
  onChange: (value: AnswerValue) => void
}) {
  const rows = Array.isArray(value) ? (value as SocialValue[]) : []

  function update(index: number, patch: Partial<SocialValue>) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange(next)
  }

  function add() {
    onChange([...rows, { platform: SOCIAL_PLATFORMS[0], url: '' }])
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <select
            className={`${inputClass} w-48`}
            value={row.platform}
            onChange={(e) => update(index, { platform: e.target.value })}
          >
            {SOCIAL_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="https://…"
            value={row.url}
            onChange={(e) => update(index, { url: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(index)}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
            aria-label="Remove link"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Add a social link
      </button>
    </div>
  )
}
