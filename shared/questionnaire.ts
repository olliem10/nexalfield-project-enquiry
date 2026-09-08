/**
 * The NexalField website project questionnaire, in one place.
 *
 * The customer wizard, the client-side validation, the review stage, the
 * server-side normalisation, the dashboard record view and the AI prompt all
 * read these definitions. Add a question here and it appears everywhere; there
 * is no second copy to keep in step.
 */

/* ------------------------------------------------------------------ *
 * Value shapes
 * ------------------------------------------------------------------ */

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

/** How many files are attached to each upload field, keyed by field id. */
export type FileCounts = Record<string, number>

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
  | 'files'
  | 'agreement'

export interface Option {
  value: string
  label: string
  hint?: string
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
  /** Upload fields only. */
  multiple?: boolean
  /**
   * Only show this question when another answer calls for it — the "what is
   * your website address" follow-up, and so on.
   */
  showIf?: { fieldId: string; equals: string[] }
  /** Counted towards the progress percentage even when optional. */
  weight?: number
}

export interface Section {
  id: string
  step: number
  eyebrow: string
  title: string
  intro: string
  fields: Field[]
}

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_FILES_PER_FIELD = 10
/** A function request body is capped at 6MB, so files travel in 4MB parts. */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024

export interface UploadType {
  contentType: string
  extensions: string[]
  label: string
}

export const UPLOAD_TYPES: UploadType[] = [
  { contentType: 'image/png', extensions: ['.png'], label: 'PNG image' },
  { contentType: 'image/jpeg', extensions: ['.jpg', '.jpeg'], label: 'JPEG image' },
  { contentType: 'image/svg+xml', extensions: ['.svg'], label: 'SVG image' },
  { contentType: 'application/pdf', extensions: ['.pdf'], label: 'PDF document' },
]

export const ACCEPTED_UPLOAD_ATTR = '.png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf'

/**
 * Decides what an upload actually is. The browser's reported MIME type is only
 * a hint — it is missing on some mobile browsers and trivially forged — so the
 * extension is authoritative here, and the server confirms with magic bytes.
 */
export function resolveUploadType(fileName: string, mimeType?: string): UploadType | null {
  const lower = (fileName ?? '').toLowerCase()
  const dot = lower.lastIndexOf('.')
  const extension = dot >= 0 ? lower.slice(dot) : ''

  const byExtension = UPLOAD_TYPES.find((type) => type.extensions.includes(extension))
  if (byExtension) return byExtension

  // No usable extension: fall back to a MIME type we recognise.
  const normalised = (mimeType ?? '').split(';')[0].trim().toLowerCase()
  return UPLOAD_TYPES.find((type) => type.contentType === normalised) ?? null
}

/* ------------------------------------------------------------------ *
 * Small shared vocabularies
 * ------------------------------------------------------------------ */

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

export const STATUSES: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer' },
  { value: 'ready_to_build', label: 'Ready To Build' },
  { value: 'complete', label: 'Complete' },
]

export const STATUS_VALUES = STATUSES.map((status) => status.value)

export function statusLabel(status: string): string {
  return STATUSES.find((entry) => entry.value === status)?.label ?? 'New'
}

export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'questionnaire_reviewed', label: 'Questionnaire Reviewed' },
  { key: 'content_gathered', label: 'Content Gathered' },
  { key: 'design_started', label: 'Design Started' },
  { key: 'first_version_complete', label: 'First Version Complete' },
  { key: 'client_review', label: 'Client Review' },
  { key: 'changes_complete', label: 'Changes Complete' },
  { key: 'website_launched', label: 'Website Launched' },
]

export const NOTE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'private', label: 'Private note' },
  { value: 'build', label: 'Build note' },
  { value: 'follow_up', label: 'Follow-up' },
]

export const NOTE_CATEGORY_VALUES = NOTE_CATEGORIES.map((entry) => entry.value)

/* ------------------------------------------------------------------ *
 * The questionnaire
 * ------------------------------------------------------------------ */

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

export const SECTIONS: Section[] = [
  {
    id: 'business',
    step: 1,
    eyebrow: 'Section 1 of 7',
    title: 'About Your Business',
    intro:
      'Let us start with the essentials — who you are, how to reach you, and what your business does.',
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
    eyebrow: 'Section 2 of 7',
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
    eyebrow: 'Section 3 of 7',
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
    eyebrow: 'Section 4 of 7',
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
        id: 'logo_files',
        type: 'files',
        label: 'Upload your logo',
        help: 'The highest quality version you have — PNG, JPG, SVG or PDF, up to 20MB each.',
        showIf: { fieldId: 'has_logo', equals: ['yes', 'needs_work'] },
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
    eyebrow: 'Section 5 of 7',
    title: 'Content & Photography',
    intro: 'What you already have, and what we may need to create together.',
    fields: [
      {
        id: 'has_photos',
        type: 'radio',
        label: "Do you already have photographs you'd like to use?",
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'some', label: 'Some, but not enough' },
          { value: 'no', label: 'No' },
        ],
      },
      {
        id: 'photo_files',
        type: 'files',
        label: "Upload any photographs you'd like us to consider",
        help: 'Up to 10 files here. Send the rest by email later if you have a large library.',
        showIf: { fieldId: 'has_photos', equals: ['yes', 'some'] },
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
        label: "Do you have testimonials you'd like included?",
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
    eyebrow: 'Section 6 of 7',
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
        label: "Is there anything specific you'd like the website to include?",
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
    eyebrow: 'Section 7 of 7',
    title: 'Final Details',
    intro: 'Last few things, then you are done.',
    fields: [
      {
        id: 'exclusions',
        type: 'textarea',
        label: "Is there anything you definitely don't want on the website?",
        maxLength: 1500,
        rows: 4,
        help: 'Pop-ups, stock photography, certain colours — anything at all.',
      },
      {
        id: 'competitors',
        type: 'textarea',
        label: "Are there any competitors you'd like us to look at?",
        maxLength: 1500,
        rows: 4,
      },
      {
        id: 'anything_else',
        type: 'textarea',
        label: "Is there anything else you'd like us to know?",
        maxLength: 3000,
        rows: 5,
      },
      {
        id: 'agreement',
        type: 'agreement',
        label: 'Agreement',
        required: true,
        agreementText:
          'The details above will be used by NexalField to plan, quote for and build your website. We will contact you using the details you have given if anything needs clarifying. Your answers and any files you upload are kept private and are never shared with anyone outside NexalField.',
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

/** Which step a field lives on — used to send a customer back to the right place. */
export const STEP_BY_FIELD_ID: Map<string, number> = new Map(
  SECTIONS.flatMap((section) => section.fields.map((field) => [field.id, section.step] as const)),
)

export const UPLOAD_FIELD_IDS = new Set(
  ALL_FIELDS.filter((field) => field.type === 'files').map((field) => field.id),
)

/* ------------------------------------------------------------------ *
 * Reading answers
 * ------------------------------------------------------------------ */

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

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function text(value: AnswerValue): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Is a question visible, given what has been answered so far? */
export function isFieldVisible(field: Field, answers: Answers): boolean {
  if (!field.showIf) return true
  return field.showIf.equals.includes(text(answers[field.showIf.fieldId]))
}

export function visibleFields(section: Section, answers: Answers): Field[] {
  return section.fields.filter((field) => isFieldVisible(field, answers))
}

export function visibleFieldsAcrossSections(answers: Answers): Field[] {
  return SECTIONS.flatMap((section) => visibleFields(section, answers))
}

/** Has this question been given a real answer? Drives the ✓ and the percentage. */
export function isFieldAnswered(field: Field, answers: Answers, counts: FileCounts = {}): boolean {
  const value = answers[field.id]

  switch (field.type) {
    case 'files':
      return (counts[field.id] ?? 0) > 0
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
  step?: number
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

/**
 * Validates one section. Required questions must be answered; optional ones are
 * still checked for obviously wrong formats, because a mistyped email address
 * is worth catching whether or not the question was compulsory.
 */
export function validateSection(
  section: Section,
  answers: Answers,
  counts: FileCounts = {},
): FieldError[] {
  const errors: FieldError[] = []

  for (const field of visibleFields(section, answers)) {
    const value = answers[field.id]
    const answered = isFieldAnswered(field, answers, counts)

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
      errors.push({
        fieldId: field.id,
        message: 'Please enter a valid phone number.',
        step: section.step,
      })
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

function requiredMessage(field: Field): string {
  switch (field.type) {
    case 'agreement':
      return 'Please confirm the information you have given is accurate before submitting.'
    case 'multiselect':
      return 'Please choose at least one option, or add your own.'
    case 'radio':
    case 'select':
      return 'Please choose one of the options.'
    case 'files':
      return 'Please attach at least one file.'
    default:
      return 'This question needs an answer.'
  }
}

/** Every outstanding problem across the whole questionnaire. */
export function validateAll(answers: Answers, counts: FileCounts = {}): FieldError[] {
  return SECTIONS.flatMap((section) => validateSection(section, answers, counts))
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

/**
 * A weighted percentage rather than a plain count: required questions carry
 * more, so the bar reflects how close the customer is to being able to submit
 * rather than how many optional boxes they have filled.
 */
export function completionPercent(answers: Answers, counts: FileCounts = {}): number {
  let total = 0
  let earned = 0

  for (const field of visibleFieldsAcrossSections(answers)) {
    const weight = field.weight ?? (field.required ? 3 : 1)
    total += weight
    if (isFieldAnswered(field, answers, counts)) earned += weight
  }

  if (total === 0) return 0
  return Math.max(0, Math.min(100, Math.round((earned / total) * 100)))
}

/* ------------------------------------------------------------------ *
 * Rendering an answer as text
 * ------------------------------------------------------------------ */

function optionLabel(field: Field, value: string): string {
  return field.options?.find((option) => option.value === value)?.label ?? value
}

/**
 * One readable line (or short block) for an answer. Shared by the review stage,
 * the dashboard record and the AI prompt, so all three agree on what a stored
 * answer actually says.
 */
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

    case 'files':
      // Attachments are never stored in `answers` — the caller renders them
      // from the uploaded_files table instead.
      return ''

    default:
      return text(value)
  }
}
