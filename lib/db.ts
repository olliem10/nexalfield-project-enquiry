import { Client } from 'pg'
import type { Answers } from '@/lib/enquiry-sections'

// Each call opens its own connection and closes it when the query is done.
// No pool is cached across invocations — an idle cached connection is what
// crashed the previous version of this application in production.
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  })

  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export interface EnquiryRow {
  id: string
  created_at: string
  updated_at: string
  status: string
  current_step: number
  answers: Answers
  submitted_at: string | null
}

export async function createEnquiry(id: string): Promise<EnquiryRow> {
  return withDb(async (client) => {
    const result = await client.query<EnquiryRow>(
      `INSERT INTO enquiries (id, status, current_step, answers)
       VALUES ($1, 'draft', 1, '{}'::jsonb)
       RETURNING *`,
      [id]
    )
    return result.rows[0]
  })
}

export async function getEnquiry(id: string): Promise<EnquiryRow | null> {
  return withDb(async (client) => {
    const result = await client.query<EnquiryRow>(
      `SELECT * FROM enquiries WHERE id = $1`,
      [id]
    )
    return result.rows[0] ?? null
  })
}

export async function saveEnquiryAnswers(
  id: string,
  currentStep: number,
  answers: Answers
): Promise<EnquiryRow | null> {
  return withDb(async (client) => {
    const result = await client.query<EnquiryRow>(
      `UPDATE enquiries
       SET current_step = $2,
           answers = $3::jsonb,
           updated_at = now()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id, currentStep, JSON.stringify(answers)]
    )
    return result.rows[0] ?? null
  })
}

export async function submitEnquiry(id: string): Promise<EnquiryRow | null> {
  return withDb(async (client) => {
    const result = await client.query<EnquiryRow>(
      `UPDATE enquiries
       SET status = 'submitted',
           submitted_at = now(),
           updated_at = now()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id]
    )
    return result.rows[0] ?? null
  })
}
