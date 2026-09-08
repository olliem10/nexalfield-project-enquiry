/**
 * The AI project summary.
 *
 * Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_BASE_URL`, for a gateway
 * in front of the API) as environment variables. This module never throws:
 * every outcome is a value, because a submission must not depend on a model
 * being available. A failed summary is recorded, shown in the dashboard,
 * retried by the housekeeping job, and can be regenerated on demand.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  SECTIONS,
  formatAnswer,
  visibleFields,
  type Answers,
} from '../../shared/questionnaire.ts'
import type { StoredSummary } from '../../db/schema.ts'
import { optionalEnv } from './http.ts'

const DEFAULT_MODEL = 'claude-opus-5'

export type SummaryOutcome =
  | { status: 'ready'; summary: StoredSummary }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export function aiIsConfigured(): boolean {
  return Boolean(optionalEnv('ANTHROPIC_API_KEY'))
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'businessName',
    'overview',
    'websiteGoals',
    'requestedPages',
    'brandingPreferences',
    'contentAvailable',
    'specialRequests',
  ],
  properties: {
    businessName: { type: 'string' },
    overview: {
      type: 'string',
      description: 'Two or three sentences describing the business and the project.',
    },
    websiteGoals: { type: 'array', items: { type: 'string' } },
    requestedPages: { type: 'array', items: { type: 'string' } },
    brandingPreferences: { type: 'array', items: { type: 'string' } },
    contentAvailable: { type: 'array', items: { type: 'string' } },
    specialRequests: { type: 'array', items: { type: 'string' } },
  },
} as const

const SYSTEM_PROMPT = `You are preparing an internal project brief for NexalField, a web design studio.

You will be given a customer's completed website questionnaire. Summarise it for the designer who is about to build the site.

Rules:
- Use only what the questionnaire says. Never invent a detail, a page, or a preference the customer did not give.
- Where the customer gave nothing useful for a section, return an empty array rather than padding it.
- Write in British English, plainly, as short noun phrases. No marketing language.
- Each list item should be one specific, actionable point, not a sentence of commentary.`

/** Renders the questionnaire the same way the dashboard shows it. */
function buildTranscript(answers: Answers, fileNames: string[]): string {
  const parts: string[] = []

  for (const section of SECTIONS) {
    const lines: string[] = []
    for (const field of visibleFields(section, answers)) {
      if (field.type === 'files') continue
      const value = formatAnswer(field, answers[field.id])
      if (value) lines.push(`${field.label}: ${value}`)
    }
    if (lines.length > 0) parts.push(`## ${section.title}\n${lines.join('\n')}`)
  }

  if (fileNames.length > 0) {
    parts.push(`## Files the customer uploaded\n${fileNames.join('\n')}`)
  }

  return parts.join('\n\n')
}

function coerceStrings(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.length <= 300)
    .slice(0, limit)
}

/**
 * Accepts the model's JSON whether it came back as a structured output or as
 * text, and rebuilds it into exactly the shape the UI renders.
 */
function parseSummary(raw: string, model: string): StoredSummary | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Fall back to the first balanced object in the text.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null
  const source = parsed as Record<string, unknown>

  return {
    businessName:
      typeof source.businessName === 'string' ? source.businessName.trim().slice(0, 200) : '',
    overview: typeof source.overview === 'string' ? source.overview.trim().slice(0, 1200) : '',
    websiteGoals: coerceStrings(source.websiteGoals),
    requestedPages: coerceStrings(source.requestedPages, 20),
    brandingPreferences: coerceStrings(source.brandingPreferences),
    contentAvailable: coerceStrings(source.contentAvailable),
    specialRequests: coerceStrings(source.specialRequests),
    generatedAt: new Date().toISOString(),
    model,
  }
}

function textFrom(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
}

/**
 * Generates the brief. Structured output is used where the gateway supports it;
 * if the parameter is rejected the request is retried once relying on the
 * prompt alone, so an older gateway still produces a usable summary.
 */
export async function generateProjectSummary(
  answers: Answers,
  fileNames: string[] = [],
): Promise<SummaryOutcome> {
  if (!aiIsConfigured()) {
    return { status: 'skipped', reason: 'No AI credentials are available on this site' }
  }

  const transcript = buildTranscript(answers, fileNames)
  if (transcript.trim().length === 0) {
    return { status: 'skipped', reason: 'The questionnaire had nothing to summarise' }
  }

  const model = optionalEnv('AI_SUMMARY_MODEL') ?? DEFAULT_MODEL
  const client = new Anthropic({
    apiKey: optionalEnv('ANTHROPIC_API_KEY'),
    // Only needed for a gateway in front of the API; the SDK's own default is
    // used otherwise.
    baseURL: optionalEnv('ANTHROPIC_BASE_URL'),
    maxRetries: 2,
    timeout: 60_000,
  })

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    // A short extraction task: low effort keeps it quick and inexpensive
    // without leaving the model unable to reason about the answers.
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Here is the completed questionnaire.\n\n${transcript}`,
      },
    ],
  }

  async function ask(useStructuredOutput: boolean): Promise<string> {
    const params = { ...request }
    if (!useStructuredOutput) {
      params.output_config = { effort: 'low' }
      params.system = `${SYSTEM_PROMPT}\n\nReply with a single JSON object and nothing else, using exactly these keys: businessName (string), overview (string), websiteGoals, requestedPages, brandingPreferences, contentAvailable, specialRequests (all arrays of strings).`
    }
    const response = await client.messages.create(params)
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to summarise this questionnaire.')
    }
    return textFrom(response.content)
  }

  try {
    let raw: string
    try {
      raw = await ask(true)
    } catch (error) {
      // A gateway that does not understand structured output rejects the
      // request outright; the prompt-only form still works there.
      if (error instanceof Anthropic.BadRequestError) {
        console.warn('Structured output rejected, retrying without it:', error.message)
        raw = await ask(false)
      } else {
        throw error
      }
    }

    const summary = parseSummary(raw, model)
    if (!summary) {
      return { status: 'failed', error: 'The model did not return a usable summary.' }
    }
    return { status: 'ready', summary }
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return { status: 'failed', error: `AI Gateway error ${error.status}: ${error.message}`.slice(0, 500) }
    }
    return {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown AI error',
    }
  }
}
