/**
 * Server-side handling of a stored answer document.
 *
 * Everything a browser sends is rebuilt here from the field definitions rather
 * than merged in. Unknown keys are dropped, strings are trimmed and capped, and
 * every value is coerced to the shape its field declares — so a stored record
 * can only ever contain answers to questions that actually exist.
 */
import {
  ALL_FIELDS,
  DAYS,
  FIELD_BY_ID,
  MAX_FILES_PER_FIELD,
  SECTIONS,
  SOCIAL_PLATFORMS,
  STEP_BY_FIELD_ID,
  asMulti,
  validateSection,
  type AddressValue,
  type AnswerValue,
  type Answers,
  type ColourValue,
  type DayHours,
  type Field,
  type FieldError,
  type FileCounts,
  type HoursValue,
  type SocialValue,
} from '../../shared/questionnaire'
import { HttpError } from './http'

const DEFAULT_MAX_TEXT = 4000
const MAX_ROWS = 20

/**
 * Control characters that would corrupt an email body, a CSV export or a log
 * line. Tabs, newlines and carriage returns are kept — customers legitimately
 * paste multi-line testimonials.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function str(value: unknown, max = DEFAULT_MAX_TEXT): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARACTERS, '').trim().slice(0, max)
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value.slice(0, MAX_ROWS) as T[]) : []
}

const ADDRESS_KEYS: (keyof AddressValue)[] = [
  'line1',
  'line2',
  'city',
  'county',
  'postcode',
  'country',
]

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Rebuilds one answer to match exactly what its field declares. */
function normaliseValue(field: Field, value: unknown): AnswerValue {
  switch (field.type) {
    case 'agreement':
      return value === true

    case 'radio':
    case 'select': {
      const chosen = str(value, 120)
      // Only an option we actually offer may be stored.
      return field.options?.some((option) => option.value === chosen) ? chosen : ''
    }

    case 'multiselect': {
      const multi = asMulti(value as AnswerValue)
      const allowed = new Set(field.options?.map((option) => option.value) ?? [])
      return {
        selected: [...new Set(multi.selected.filter((entry) => allowed.has(entry)))].slice(0, 40),
        custom: field.allowCustom
          ? multi.custom.map((entry) => str(entry, 200)).filter(Boolean).slice(0, 12)
          : [],
      }
    }

    case 'address': {
      const source = (value ?? {}) as Record<string, unknown>
      const address: AddressValue = {}
      for (const key of ADDRESS_KEYS) {
        const part = str(source[key], 200)
        if (part) address[key] = part
      }
      return address
    }

    case 'colours':
      return rows<Record<string, unknown>>(value)
        .map((row): ColourValue => ({ value: str(row?.value, 60), note: str(row?.note, 160) }))
        .filter((row) => row.value.length > 0)
        .slice(0, 12)

    case 'social':
      return rows<Record<string, unknown>>(value)
        .map((row): SocialValue => {
          const platform = str(row?.platform, 60)
          return {
            platform: SOCIAL_PLATFORMS.includes(platform) ? platform : 'Other',
            url: str(row?.url, 400),
          }
        })
        .filter((row) => row.url.length > 0)
        .slice(0, 15)

    case 'hours': {
      const source = (value ?? {}) as Record<string, unknown>
      const hours: HoursValue = {}
      for (const day of DAYS) {
        const entry = (source[day.key] ?? {}) as Record<string, unknown>
        const closed = entry.closed === true
        const open = str(entry.open, 5)
        const close = str(entry.close, 5)
        const note = str(entry.note, 120)

        const parsed: DayHours = {}
        if (closed) parsed.closed = true
        if (!closed && TIME.test(open)) parsed.open = open
        if (!closed && TIME.test(close)) parsed.close = close
        if (note) parsed.note = note

        if (Object.keys(parsed).length > 0) hours[day.key] = parsed
      }
      return hours
    }

    case 'files':
      // Attachments live in `uploaded_files`. Nothing a browser sends for an
      // upload question is ever written into the answers document.
      return undefined

    default:
      return str(value, field.maxLength ?? DEFAULT_MAX_TEXT)
  }
}

/** Rebuilds a whole answers document from what a browser sent. */
export function normaliseAnswers(input: unknown): Answers {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'invalid_answers', 'We could not read those answers.')
  }
  const source = input as Record<string, unknown>

  const answers: Answers = {}
  for (const field of ALL_FIELDS) {
    if (field.type === 'files') continue
    if (!(field.id in source)) continue

    const value = normaliseValue(field, source[field.id])
    if (value === undefined) continue

    // Drop empties so a stored record stays readable rather than being padded
    // with a blank entry for every question the customer skipped.
    if (field.type === 'agreement') {
      if (value === true) answers[field.id] = true
      continue
    }
    if (typeof value === 'string') {
      if (value.length > 0) answers[field.id] = value
      continue
    }
    if (Array.isArray(value)) {
      if (value.length > 0) answers[field.id] = value
      continue
    }
    if (field.type === 'multiselect') {
      const multi = asMulti(value)
      if (multi.selected.length > 0 || multi.custom.length > 0) answers[field.id] = value
      continue
    }
    if (typeof value === 'object' && Object.keys(value).length > 0) {
      answers[field.id] = value
    }
  }

  return answers
}

/** The columns the dashboard searches and sorts on, lifted out of the answers. */
export function deriveContactFields(answers: Answers): {
  contactName: string | null
  businessName: string | null
  email: string | null
  phone: string | null
} {
  const read = (id: string, max: number): string | null => {
    const value = answers[id]
    const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
    return text.length > 0 ? text : null
  }

  return {
    contactName: read('contact_name', 120),
    businessName: read('business_name', 160),
    email: read('email', 254)?.toLowerCase() ?? null,
    phone: read('phone', 40),
  }
}

/**
 * Re-runs the full questionnaire validation server-side at submission.
 *
 * The browser has already checked these, which is why the customer sees
 * friendly inline errors — but the browser is not trusted, so this is the check
 * that actually decides whether a record may be created.
 */
export function validateSubmission(answers: Answers, counts: FileCounts): FieldError[] {
  return SECTIONS.flatMap((section) => validateSection(section, answers, counts)).map((error) => ({
    ...error,
    step: error.step ?? STEP_BY_FIELD_ID.get(error.fieldId),
  }))
}

/** Is this a real upload question, and is there room for another file on it? */
export function assertUploadFieldAccepts(fieldId: string, existing: number): Field {
  const field = FIELD_BY_ID.get(fieldId)
  if (!field || field.type !== 'files') {
    throw new HttpError(400, 'unknown_field', 'That is not a question you can attach a file to.')
  }
  if (existing >= MAX_FILES_PER_FIELD) {
    throw new HttpError(
      409,
      'too_many_files',
      `You can attach up to ${MAX_FILES_PER_FIELD} files to this question.`,
    )
  }
  return field
}

export function clampStep(value: unknown, fallback = 1): number {
  const step = Number(value)
  if (!Number.isFinite(step)) return fallback
  return Math.min(SECTIONS.length, Math.max(1, Math.round(step)))
}
