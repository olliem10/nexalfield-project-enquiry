/**
 * Reference numbers: NEX-4821.
 *
 * Drawn at random rather than from a sequence, so a reference never discloses
 * how many customers NexalField has, nor when one arrived relative to another.
 */
import { randomInt } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { submissions } from '../../db/schema.js'
import { getDb } from './db.js'

/**
 * Four digits is only 9,000 possibilities, so a collision becomes realistic
 * long before the space is exhausted. After repeated collisions the reference
 * widens by a digit rather than failing the customer's submission.
 */
export async function allocateReference(): Promise<string> {
  const db = getDb()

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const reference = `NEX-${String(randomInt(1000, 10000))}`
    const [existing] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.reference, reference))
      .limit(1)
    if (!existing) return reference
  }

  return `NEX-${String(randomInt(10000, 100000))}`
}
