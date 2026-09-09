import { NextResponse } from 'next/server'
import { getEnquiry, submitEnquiry } from '@/lib/db'
import { validateAll } from '@/lib/enquiry-sections'

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

  const { id } = body

  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'A valid enquiry id is required.' }, { status: 400 })
  }

  let enquiry
  try {
    enquiry = await getEnquiry(id)
  } catch (err) {
    console.error('GET enquiry failed in /api/enquiry/submit:', err)
    return NextResponse.json({ error: 'Something went wrong submitting your enquiry. Please try again.' }, { status: 500 })
  }

  if (!enquiry) {
    return NextResponse.json({ error: 'No enquiry was found with that id.' }, { status: 404 })
  }

  if (enquiry.status !== 'draft') {
    return NextResponse.json({ error: 'This enquiry has already been submitted.' }, { status: 409 })
  }

  const errors = validateAll(enquiry.answers)
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Some required answers are missing or invalid.', fieldErrors: errors },
      { status: 400 }
    )
  }

  try {
    const submitted = await submitEnquiry(id)
    if (!submitted) {
      return NextResponse.json({ error: 'This enquiry has already been submitted.' }, { status: 409 })
    }

    return NextResponse.json({
      id: submitted.id,
      status: submitted.status,
      submittedAt: submitted.submitted_at,
    })
  } catch (err) {
    console.error('POST /api/enquiry/submit failed:', err)
    return NextResponse.json({ error: 'Something went wrong submitting your enquiry. Please try again.' }, { status: 500 })
  }
}
