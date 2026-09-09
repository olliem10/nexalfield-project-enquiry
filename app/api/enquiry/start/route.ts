import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createEnquiry } from '@/lib/db'

export async function POST() {
  try {
    const enquiry = await createEnquiry(randomUUID())

    return NextResponse.json(
      {
        id: enquiry.id,
        status: enquiry.status,
        currentStep: enquiry.current_step,
        answers: enquiry.answers,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('POST /api/enquiry/start failed:', err)
    return NextResponse.json(
      { error: 'Something went wrong starting your enquiry. Please try again.' },
      { status: 500 }
    )
  }
}
