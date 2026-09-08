/**
 * Hourly housekeeping.
 *
 * Retries summaries and confirmation emails that failed earlier, and clears out
 * expired drafts, abandoned upload parts and stale rate-limit counters. This is
 * what makes a transient outage self-healing rather than something Ollie has to
 * notice and fix by hand.
 */
import type { Config } from '@netlify/functions'
import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { submissions, uploadSessions } from '../../db/schema.ts'
import { getDb } from '../lib/db.ts'
import { pruneRateLimits } from '../lib/http.ts'
import { findOutstanding, runEmailTask, runSummaryTask } from '../lib/tasks.ts'
import { chunksStore, deleteBlobQuietly } from '../lib/uploads.ts'

async function retryOutstanding(): Promise<number> {
  const pending = await findOutstanding(20)

  for (const submission of pending) {
    if (['pending', 'failed'].includes(submission.emailStatus) && submission.emailAttempts < 5) {
      await runEmailTask(submission.id).catch((error) =>
        console.error('Retrying email failed:', submission.id, error),
      )
    }
    if (
      ['pending', 'generating', 'failed'].includes(submission.summaryStatus) &&
      submission.summaryAttempts < 5
    ) {
      await runSummaryTask(submission.id).catch((error) =>
        console.error('Retrying summary failed:', submission.id, error),
      )
    }
  }

  return pending.length
}

/** Removes upload sessions that were never completed, and their stored parts. */
async function pruneUploads(): Promise<number> {
  const db = getDb()
  const expired = await db
    .delete(uploadSessions)
    .where(lt(uploadSessions.expiresAt, new Date()))
    .returning({ id: uploadSessions.id, totalChunks: uploadSessions.totalChunks })

  const chunks = chunksStore()
  for (const session of expired) {
    for (let index = 0; index < session.totalChunks; index += 1) {
      await deleteBlobQuietly(chunks, `${session.id}/${String(index).padStart(5, '0')}`)
    }
  }

  return expired.length
}

/**
 * Deletes drafts nobody came back to. A submitted record has its `expiresAt`
 * cleared at submission, so this can never reach a real customer record.
 */
async function pruneDrafts(): Promise<number> {
  const db = getDb()
  const removed = await db
    .delete(submissions)
    .where(
      and(
        isNull(submissions.submittedAt),
        eq(submissions.status, 'draft'),
        lt(submissions.expiresAt, new Date()),
        sql`${submissions.expiresAt} is not null`,
      ),
    )
    .returning({ id: submissions.id })

  return removed.length
}

export default async () => {
  const results = {
    retried: 0,
    uploadsPruned: 0,
    draftsPruned: 0,
  }

  // Each step is independent: one failing must not stop the others.
  try {
    results.retried = await retryOutstanding()
  } catch (error) {
    console.error('Retry pass failed:', error)
  }
  try {
    results.uploadsPruned = await pruneUploads()
  } catch (error) {
    console.error('Upload prune failed:', error)
  }
  try {
    results.draftsPruned = await pruneDrafts()
  } catch (error) {
    console.error('Draft prune failed:', error)
  }
  try {
    await pruneRateLimits()
  } catch (error) {
    console.error('Rate-limit prune failed:', error)
  }

  console.log('Hourly housekeeping complete:', results)
  return new Response(JSON.stringify(results), {
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  schedule: '@hourly',
}
