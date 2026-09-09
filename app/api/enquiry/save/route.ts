import { NextResponse } from 'next/server'
import { getEnquiry, saveEnquiryAnswers } from '@/lib/db'
import { SECTION_BY_STEP, TOTAL_STEPS, validateSection, type Answers } from '@/lib/enquiry-sections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 })
  }

  const { id, step, answers } = body

  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'A valid enquiry id is required.' }, { status: 400 })
  }

  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    return NextResponse.json({ error: `step must be an integer between 1 and ${TOTAL_STEPS}.` }, { status: 400 })
  }

  if (!isPlainObject(answers)) {
    return NextResponse.json({ error: 'answers must be a JSON object.' }, { status: 400 })
  }

  let enquiry
  try {
    enquiry = await getEnquiry(id)
  } catch (err) {
    console.error('GET enquiry failed in /api/enquiry/save:', err)
    return NextResponse.json({ error: 'Something went wrong saving your answers. Please try again.' }, { status: 500 })
  }

  if (!enquiry) {
    return NextResponse.json({ error: 'No enquiry was found with that id.' }, { status: 404 })
  }

  if (enquiry.status !== 'draft') {
    return NextResponse.json({ error: 'This enquiry has already been submitted and can no longer be edited.' }, { status: 409 })
  }

  const mergedAnswers: Answers = { ...enquiry.answers, ...(answers as Answers) }

  const section = SECTION_BY_STEP.get(step)
  if (!section) {
    return NextResponse.json({ error: 'Unknown step.' }, { status: 400 })
  }

  const errors = validateSection(section, mergedAnswers)
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Please fix the highlighted answers before continuing.', fieldErrors: errors }, { status: 400 })
  }

  try {
    const updated = await saveEnquiryAnswers(id, step, mergedAnswers)
    if (!updated) {
      return NextResponse.json({ error: 'This enquiry has already been submitted and can no longer be edited.' }, { status: 409 })
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      currentStep: updated.current_step,
      answers: updated.answers,
    })
  } catch (err) {
    console.error('POST /api/enquiry/save failed:', err)
    return NextResponse.json({ error: 'Something went wrong saving your answers. Please try again.' }, { status: 500 })
  }
}
