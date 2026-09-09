/**
 * The seven Website Project Enquiry sections, in one place.
 *
 * The wizard, the review page, and the server-side validation in the API
 * routes all read these definitions. Add a question here and it appears
 * everywhere; there is no second copy to keep in step.
 *
 * File uploads (logo / photos) are deliberately not part of Phase 1 — the
 * "do you have a logo / photos" questions are kept, since they are useful
 * content on their own, but the upload controls themselves come later.
 */

export interface AddressValue {
  line1?: string
  line2?: string
  city?: string
  county?: string
  postcode?: string
  country?: string
}

export interface ColourValue {
  value: string
  note?: string
}

export interface SocialValue {
  platform: string
  url: string
}

export interface DayHours {
  open?: string
  close?: string
  closed?: boolean
  note?: string
}

export type HoursValue = Record<string, DayHours>

export interface MultiValue {
  selected: string[]
  custom: string[]
}

export type AnswerValue =
  | string
  | boolean
  | AddressValue
  | ColourValue[]
  | SocialValue[]
  | HoursValue
  | MultiValue
  | undefined

export type Answers = Record<string, AnswerValue>

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'multiselect'
  | 'address'
  | 'colours'
  | 'hours'
  | 'social'
  | 'agreement'

export interface Option {
  value: string
  label: string
}

export interface Field {
  id: string
  type: FieldType
  label: string
  help?: string
  placeholder?: string
  required?: boolean
  maxLength?: number
  rows?: number
  options?: Option[]
  /** Multi-selects may accept free-text entries alongside the options. */
  allowCustom?: boolean
  customLabel?: string
  agreementText?: string
  /** Only show this question when another answer calls for it. */
  showIf?: { fieldId: string; equals: string[] }
}

export interface Section {
  id: string
  step: number
  title: string
  intro: string
  fields: Field[]
}

export const DAYS: { key: string; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

export const SOCIAL_PLATFORMS = [
  'Facebook',
  'Instagram',
  'LinkedIn',
  'X (Twitter)',
  'TikTok',
  'YouTube',
  'Pinterest',
  'WhatsApp',
  'Google Business Profile',
  'Other',
]

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

export const SECTIONS: Section[] = [
  {
    id: 'business',
    step: 1,
    title: 'About Your Business',
    intro:
      'Let’s start with the essentials — who you are, how to reach you, and what your business does.',
    fields: [
      {
        id: 'contact_name',
        type: 'text',
        label: 'Your name',
        required: true,
        maxLength: 120,
        placeholder: 'Jane Smith',
      },
      {
        id: 'business_name',
        type: 'text',
        label: 'Business name',
        required: true,
        maxLength: 160,
        help: 'Exactly as you would like it to appear on the website.',
      },
      {
        id: 'email',
        type: 'email',
        label: 'Your email address',
        required: true,
        maxLength: 254,
        help: 'We send your confirmation and reference number here.',
      },
      {
        id: 'phone',
        type: 'tel',
        label: 'Phone number',
        required: true,
        maxLength: 40,
        placeholder: '07700 900123',
      },
      {
        id: 'business_address',
        type: 'address',
        label: 'Business address',
        help: 'Leave blank if you would rather this did not appear on the website.',
      },
      {
        id: 'business_description',
        type: 'textarea',
        label: 'What does your business do?',
        required: true,
        maxLength: 2000,
        rows: 5,
        help: 'A few sentences in your own words — the products or services you offer.',
      },
      {
        id: 'trading_since',
        type: 'select',
        label: 'How long has the business been operating?',
        options: [
          { value: 'not_yet', label: 'Not trading yet — this is a new venture' },
          { value: 'under_1', label: 'Less than a year' },
          { value: '1_3', label: '1–3 years' },
          { value: '3_10', label: '3–10 years' },
          { value: 'over_10', label: 'More than 10 years' },
        ],
      },
      {
        id: 'differentiator',
        type: 'textarea',
        label: 'What makes your business different?',
        maxLength: 2000,
        rows: 4,
        help: 'Why do customers choose you over someone else? This shapes the words we write.',
      },
    ],
  },
  {
    id: 'customers',
    step: 2,
    title: 'Your Customers',
    intro: 'Who the website is really for, and what you want them to do once they arrive.',
    fields: [
      {
        id: 'customer_profile',
        type: 'textarea',
        label:
          'Who are your main customers, and what are they usually looking for when they contact you?',
        required: true,
        maxLength: 2000,
        rows: 5,
        help: 'Homeowners, other businesses, a particular trade — and the problem they need solved.',
      },
      {
        id: 'customer_locations',
        type: 'textarea',
        label: 'Where are your customers located?',
        maxLength: 1000,
        rows: 3,
        help: 'Towns, counties, a radius from your base, nationwide, or international.',
      },
      {
        id: 'visitor_actions',
        type: 'multiselect',
        label: 'What do you want visitors to do when they visit your website?',
        required: true,
        allowCustom: true,
        customLabel: 'Something else you want visitors to do',
        help: 'Choose everything that applies.',
        options: [
          { value: 'call', label: 'Call you' },
          { value: 'enquiry_form', label: 'Send an enquiry form' },
          { value: 'email', label: 'Email you' },
          { value: 'quote', label: 'Request a quote' },
          { value: 'book', label: 'Book an appointment' },
          { value: 'visit', label: 'Visit your premises' },
          { value: 'buy', label: 'Buy something online' },
          { value: 'browse', label: 'Browse your work or portfolio' },
          { value: 'download', label: 'Download a brochure or price list' },
          { value: 'social', label: 'Follow you on social media' },
        ],
      },
    ],
  },
  {
    id: 'website',
    step: 3,
    title: 'Your Website',
    intro: 'What the new site needs to achieve, and the pages you have in mind.',
    fields: [
      {
        id: 'website_purpose',
        type: 'textarea',
        label: 'What is the main purpose of the new website?',
        required: true,
        maxLength: 2000,
        rows: 4,
        help: 'For example: win more enquiries, look credible to new clients, or sell online.',
      },
      {
        id: 'pages_wanted',
        type: 'multiselect',
        label: 'What pages would you like?',
        required: true,
        allowCustom: true,
        customLabel: 'Add another page',
        help: 'A starting point — we will advise if we think something is missing.',
        options: [
          { value: 'home', label: 'Home' },
          { value: 'about', label: 'About' },
          { value: 'services', label: 'Services' },
          { value: 'gallery', label: 'Gallery or portfolio' },
          { value: 'testimonials', label: 'Testimonials' },
          { value: 'pricing', label: 'Pricing' },
          { value: 'faq', label: 'FAQ' },
          { value: 'blog', label: 'Blog or news' },
          { value: 'shop', label: 'Shop' },
          { value: 'contact', label: 'Contact' },
        ],
      },
      {
        id: 'has_website',
        type: 'radio',
        label: 'Do you currently have a website?',
        required: true,
        options: YES_NO,
      },
      {
        id: 'current_website_url',
        type: 'url',
        label: 'If yes, what is the website address?',
        maxLength: 400,
        placeholder: 'https://…',
        showIf: { fieldId: 'has_website', equals: ['yes'] },
      },
      {
        id: 'current_website_feedback',
        type: 'textarea',
        label: 'What do you like or dislike about your current website?',
        maxLength: 2000,
        rows: 4,
        help: 'Being blunt here is genuinely useful.',
        showIf: { fieldId: 'has_website', equals: ['yes'] },
      },
    ],
  },
  {
    id: 'branding',
    step: 4,
    title: 'Branding & Design',
    intro: 'Your existing identity, and the look and feel you are hoping for.',
    fields: [
      {
        id: 'has_logo',
        type: 'radio',
        label: 'Do you already have a logo?',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'needs_work', label: 'Yes, but it needs updating' },
        ],
      },
      {
        id: 'has_brand_colours',
        type: 'radio',
        label: 'Do you have existing brand colours?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure — please suggest some' },
        ],
      },
      {
        id: 'brand_colours',
        type: 'colours',
        label: 'If yes, what are your brand colours?',
        help: 'A hex code such as #245945 is ideal, but a description works just as well.',
        showIf: { fieldId: 'has_brand_colours', equals: ['yes'] },
      },
      {
        id: 'design_style',
        type: 'multiselect',
        label: 'What style would you like for your website?',
        allowCustom: true,
        customLabel: 'Describe it in your own words',
        options: [
          { value: 'clean', label: 'Clean and minimal' },
          { value: 'modern', label: 'Modern' },
          { value: 'traditional', label: 'Traditional' },
          { value: 'premium', label: 'Premium and refined' },
          { value: 'friendly', label: 'Warm and friendly' },
          { value: 'bold', label: 'Bold and colourful' },
          { value: 'corporate', label: 'Corporate' },
          { value: 'natural', label: 'Natural and earthy' },
        ],
      },
      {
        id: 'reference_websites',
        type: 'textarea',
        label: 'Are there any websites whose design you like?',
        maxLength: 1500,
        rows: 4,
        help: 'Addresses and a line on what appeals to you. Competitors are fine too.',
      },
    ],
  },
  {
    id: 'content',
    step: 5,
    title: 'Content & Photography',
    intro: 'What you already have, and what we may need to create together.',
    fields: [
      {
        id: 'has_photos',
        type: 'radio',
        label: 'Do you already have photographs you’d like to use?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'some', label: 'Some, but not enough' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'has_content',
        type: 'radio',
        label: 'Do you already have written content for your website?',
        options: [
          { value: 'yes', label: 'Yes, it is ready' },
          { value: 'some', label: 'Some of it' },
          { value: 'no', label: 'No — please write it' },
        ],
      },
      {
        id: 'key_information',
        type: 'textarea',
        label: 'What information should customers know about your business?',
        maxLength: 3000,
        rows: 6,
        help: 'Accreditations, guarantees, service areas, years of experience, anything you are proud of.',
      },
      {
        id: 'has_testimonials',
        type: 'radio',
        label: 'Do you have testimonials you’d like included?',
        options: YES_NO,
      },
      {
        id: 'testimonials',
        type: 'textarea',
        label: 'If yes, please provide them here',
        maxLength: 4000,
        rows: 6,
        help: 'Paste them in, with the customer name or initials if you have permission.',
        showIf: { fieldId: 'has_testimonials', equals: ['yes'] },
      },
    ],
  },
  {
    id: 'contact',
    step: 6,
    title: 'Contact & Features',
    intro: 'How customers should reach you, and anything the site needs to do.',
    fields: [
      {
        id: 'contact_details',
        type: 'multiselect',
        label: 'What contact details should appear on the website?',
        required: true,
        allowCustom: true,
        customLabel: 'Another detail to show',
        options: [
          { value: 'phone', label: 'Phone number' },
          { value: 'email', label: 'Email address' },
          { value: 'address', label: 'Business address' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'opening_hours', label: 'Opening hours' },
          { value: 'company_number', label: 'Company registration number' },
          { value: 'vat', label: 'VAT number' },
        ],
      },
      {
        id: 'opening_hours',
        type: 'hours',
        label: 'What are your opening hours?',
        help: 'Leave blank if you would rather not publish them.',
      },
      {
        id: 'social_links',
        type: 'social',
        label: 'Which social media accounts should we link to?',
      },
      {
        id: 'contact_form',
        type: 'radio',
        label: 'Do you want customers to be able to contact you through the website?',
        required: true,
        help: 'An enquiry form that emails you directly.',
        options: [
          { value: 'yes', label: 'Yes, add an enquiry form' },
          { value: 'no', label: 'No, phone and email are enough' },
          { value: 'unsure', label: 'Not sure — please advise' },
        ],
      },
      {
        id: 'desired_features',
        type: 'multiselect',
        label: 'Is there anything specific you’d like the website to include?',
        allowCustom: true,
        customLabel: 'Something else the site should include',
        options: [
          { value: 'gallery', label: 'Photo gallery' },
          { value: 'booking', label: 'Online booking' },
          { value: 'payments', label: 'Online payments' },
          { value: 'map', label: 'Map of your location' },
          { value: 'reviews', label: 'Google reviews' },
          { value: 'newsletter', label: 'Newsletter sign-up' },
          { value: 'blog', label: 'Blog or news area' },
          { value: 'quote_calc', label: 'Quote calculator' },
          { value: 'live_chat', label: 'Live chat' },
          { value: 'multilingual', label: 'More than one language' },
        ],
      },
    ],
  },
  {
    id: 'final',
    step: 7,
    title: 'Final Details',
    intro: 'Last few things, then you are done.',
    fields: [
      {
        id: 'exclusions',
        type: 'textarea',
        label: 'Is there anything you definitely don’t want on the website?',
        maxLength: 1500,
        rows: 4,
        help: 'Pop-ups, stock photography, certain colours — anything at all.',
      },
      {
        id: 'competitors',
        type: 'textarea',
        label: 'Are there any competitors you’d like us to look at?',
        maxLength: 1500,
        rows: 4,
      },
      {
        id: 'anything_else',
        type: 'textarea',
        label: 'Is there anything else you’d like us to know?',
        maxLength: 3000,
        rows: 5,
      },
      {
        id: 'agreement',
        type: 'agreement',
        label: 'Agreement',
        required: true,
        agreementText:
          'The details above will be used by NexalField to plan, quote for and build your website. We will contact you using the details you have given if anything needs clarifying. Your answers are kept private and are never shared with anyone outside NexalField.',
      },
    ],
  },
]

export const TOTAL_STEPS = SECTIONS.length

export const SECTION_BY_STEP: Map<number, Section> = new Map(
  SECTIONS.map((section) => [section.step, section]),
)

export const ALL_FIELDS: Field[] = SECTIONS.flatMap((section) => section.fields)

export const FIELD_BY_ID: Map<string, Field> = new Map(
  ALL_FIELDS.map((field) => [field.id, field]),
)

/* ------------------------------------------------------------------ *
 * Reading answers
 * ------------------------------------------------------------------ */

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function text(value: AnswerValue): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function asMulti(value: AnswerValue): MultiValue {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Partial<MultiValue>
    return {
      selected: Array.isArray(candidate.selected) ? candidate.selected.filter(isNonEmpty) : [],
      custom: Array.isArray(candidate.custom) ? candidate.custom.filter(isNonEmpty) : [],
    }
  }
  return { selected: [], custom: [] }
}

/** Is a question visible, given what has been answered so far? */
export function isFieldVisible(field: Field, answers: Answers): boolean {
  if (!field.showIf) return true
  return field.showIf.equals.includes(text(answers[field.showIf.fieldId]))
}

export function visibleFields(section: Section, answers: Answers): Field[] {
  return section.fields.filter((field) => isFieldVisible(field, answers))
}

/** Has this question been given a real answer? */
export function isFieldAnswered(field: Field, answers: Answers): boolean {
  const value = answers[field.id]

  switch (field.type) {
    case 'agreement':
      return value === true
    case 'multiselect': {
      const multi = asMulti(value)
      return multi.selected.length > 0 || multi.custom.length > 0
    }
    case 'address': {
      const address = (value ?? {}) as AddressValue
      return Boolean(text(address.line1) || text(address.city) || text(address.postcode))
    }
    case 'colours':
      return Array.isArray(value) && (value as ColourValue[]).some((row) => isNonEmpty(row?.value))
    case 'social':
      return Array.isArray(value) && (value as SocialValue[]).some((row) => isNonEmpty(row?.url))
    case 'hours': {
      const hours = (value ?? {}) as HoursValue
      return Object.values(hours).some(
        (day) => day?.closed === true || isNonEmpty(day?.open) || isNonEmpty(day?.note),
      )
    }
    default:
      return text(value).length > 0
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface FieldError {
  fieldId: string
  message: string
  step: number
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const PHONE = /^[+()\d][\d\s().+-]{6,}$/

function urlProblem(value: string): string | null {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(candidate)
    if (!parsed.hostname.includes('.')) return 'Please enter a complete website address.'
    return null
  } catch {
    return 'Please enter a valid website address, for example https://example.com'
  }
}

function requiredMessage(field: Field): string {
  switch (field.type) {
    case 'agreement':
      return 'Please confirm the information you have given is accurate before submitting.'
    case 'multiselect':
      return 'Please choose at least one option, or add your own.'
    case 'radio':
    case 'select':
      return 'Please choose one of the options.'
    default:
      return 'This question needs an answer.'
  }
}

/**
 * Validates one section. Required questions must be answered; optional ones
 * are still checked for obviously wrong formats.
 */
export function validateSection(section: Section, answers: Answers): FieldError[] {
  const errors: FieldError[] = []

  for (const field of visibleFields(section, answers)) {
    const value = answers[field.id]
    const answered = isFieldAnswered(field, answers)

    if (field.required && !answered) {
      errors.push({ fieldId: field.id, message: requiredMessage(field), step: section.step })
      continue
    }

    if (!answered) continue

    if (field.type === 'email' && !EMAIL.test(text(value))) {
      errors.push({
        fieldId: field.id,
        message: 'Please enter a valid email address so we can send your confirmation.',
        step: section.step,
      })
    }

    if (field.type === 'tel' && !PHONE.test(text(value))) {
      errors.push({ fieldId: field.id, message: 'Please enter a valid phone number.', step: section.step })
    }

    if (field.type === 'url') {
      const problem = urlProblem(text(value))
      if (problem) errors.push({ fieldId: field.id, message: problem, step: section.step })
    }

    if (field.maxLength && text(value).length > field.maxLength) {
      errors.push({
        fieldId: field.id,
        message: `Please keep this to ${field.maxLength} characters or fewer.`,
        step: section.step,
      })
    }

    if (field.type === 'social') {
      const rows = (value as SocialValue[]) ?? []
      const broken = rows.some((row) => isNonEmpty(row?.url) && urlProblem(row.url.trim()) !== null)
      if (broken) {
        errors.push({
          fieldId: field.id,
          message: 'One of those links does not look complete. A full https:// address is safest.',
          step: section.step,
        })
      }
    }

    if (field.type === 'hours') {
      const hours = (value ?? {}) as HoursValue
      const broken = Object.values(hours).some(
        (day) => !day?.closed && isNonEmpty(day?.open) !== isNonEmpty(day?.close),
      )
      if (broken) {
        errors.push({
          fieldId: field.id,
          message: 'Please give both an opening and a closing time, or mark the day as closed.',
          step: section.step,
        })
      }
    }
  }

  return errors
}

/** Every outstanding problem across the whole enquiry. */
export function validateAll(answers: Answers): FieldError[] {
  return SECTIONS.flatMap((section) => validateSection(section, answers))
}

/* ------------------------------------------------------------------ *
 * Rendering an answer as text (used by the review page)
 * ------------------------------------------------------------------ */

function optionLabel(field: Field, value: string): string {
  return field.options?.find((option) => option.value === value)?.label ?? value
}

export function formatAnswer(field: Field, value: AnswerValue): string {
  switch (field.type) {
    case 'agreement':
      return value === true ? 'Agreed' : ''

    case 'radio':
    case 'select': {
      const raw = text(value)
      return raw ? optionLabel(field, raw) : ''
    }

    case 'multiselect': {
      const multi = asMulti(value)
      const labels = multi.selected.map((entry) => optionLabel(field, entry))
      return [...labels, ...multi.custom].join(', ')
    }

    case 'address': {
      const address = (value ?? {}) as AddressValue
      return [address.line1, address.line2, address.city, address.county, address.postcode, address.country]
        .map((part) => text(part))
        .filter(Boolean)
        .join(', ')
    }

    case 'colours': {
      const rows = Array.isArray(value) ? (value as ColourValue[]) : []
      return rows
        .filter((row) => isNonEmpty(row?.value))
        .map((row) => (isNonEmpty(row.note) ? `${row.value.trim()} (${row.note!.trim()})` : row.value.trim()))
        .join(', ')
    }

    case 'social': {
      const rows = Array.isArray(value) ? (value as SocialValue[]) : []
      return rows
        .filter((row) => isNonEmpty(row?.url))
        .map((row) => `${row.platform || 'Link'}: ${row.url.trim()}`)
        .join('\n')
    }

    case 'hours': {
      const hours = (value ?? {}) as HoursValue
      return DAYS.map((day) => {
        const entry = hours[day.key]
        if (!entry) return null
        if (entry.closed) return `${day.label}: Closed`
        if (!isNonEmpty(entry.open) && !isNonEmpty(entry.close) && !isNonEmpty(entry.note)) return null
        const span =
          isNonEmpty(entry.open) && isNonEmpty(entry.close)
            ? `${entry.open}–${entry.close}`
            : text(entry.open) || text(entry.close)
        const note = isNonEmpty(entry.note) ? ` (${entry.note!.trim()})` : ''
        return `${day.label}: ${span || 'By arrangement'}${note}`
      })
        .filter(Boolean)
        .join('\n')
    }

    default:
      return text(value)
  }
}

/** A simple percentage across every visible, currently-answered question. */
export function completionPercent(answers: Answers): number {
  const fields = SECTIONS.flatMap((section) => visibleFields(section, answers))
  if (fields.length === 0) return 0
  const answered = fields.filter((field) => isFieldAnswered(field, answers)).length
  return Math.round((answered / fields.length) * 100)
}
