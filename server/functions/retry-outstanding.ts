/**
 * Housekeeping. Triggered by the Vercel Cron target at `api/cron/retry.ts`.
 *
 * Retries summaries and confirmation emails that failed earlier, and clears out
 * expired drafts, abandoned upload parts and stale rate-limit counters. This is
 * what makes a transient outage self-healing rather than something Ollie has to
 * notice and fix by hand.
 */
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { submissions, uploadSessions, uploadedFiles } from '../../db/schema'
import { getDb } from '../lib/db'
import { pruneRateLimits } from '../lib/http'
import { findOutstanding, runEmailTask, runSummaryTask } from '../lib/tasks'
import { chunksStore, deleteQuietly, filesStore, prunePostgresChunks } from '../lib/storage'

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
      await deleteQuietly(chunks, `${session.id}/${String(index).padStart(5, '0')}`)
    }
  }

  // Belt and braces for the Postgres backend: sweeps parts whose upload session
  // row has already gone, which the loop above could never reach.
  await prunePostgresChunks(24 * 60 * 60 * 1000)

  return expired.length
}

/**
 * Deletes drafts nobody came back to. A submitted record has its `expiresAt`
 * cleared at submission, so this can never reach a real customer record.
 *
 * A draft's uploaded files cascade away with it at the database level, but
 * cascading only ever touched the `uploaded_files` rows — nothing told the
 * `blob_objects` table that those bytes were now unreachable, so every logo
 * and photo on a pruned draft was leaked forever. This locks the expiring
 * rows first, reads the file keys they still own, deletes the submissions,
 * and only once that has actually committed does it remove the bytes.
 *
 * The row lock (`for('update')`) is what keeps this safe against a customer
 * resuming mid-prune: a concurrent autosave on one of these exact rows blocks
 * behind the lock rather than racing it, so a draft is either genuinely still
 * expired when we act on it, or the autosave lands first and the row no
 * longer matches — never both.
 */
async function pruneDrafts(): Promise<number> {
  const db = getDb()
  const expiredCondition = and(
    isNull(submissions.submittedAt),
    eq(submissions.status, 'draft'),
    lt(submissions.expiresAt, new Date()),
    sql`${submissions.expiresAt} is not null`,
  )

  const { removedIds, blobKeys } = await db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: submissions.id })
      .from(submissions)
      .where(expiredCondition)
      .for('update')

    if (candidates.length === 0) return { removedIds: [] as string[], blobKeys: [] as string[] }

    const ids = candidates.map((row) => row.id)

    const files = await tx
      .select({ blobKey: uploadedFiles.blobKey })
      .from(uploadedFiles)
      .where(inArray(uploadedFiles.submissionId, ids))

    const removed = await tx
      .delete(submissions)
      .where(inArray(submissions.id, ids))
      .returning({ id: submissions.id })

    return { removedIds: removed.map((row) => row.id), blobKeys: files.map((row) => row.blobKey) }
  })

  // Only after the transaction has committed: a rolled-back prune must never
  // have already deleted bytes the database still thinks exist.
  const store = filesStore()
  for (const key of blobKeys) {
    await deleteQuietly(store, key)
  }

  return removedIds.length
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

  console.log('Housekeeping complete:', results)
  return new Response(JSON.stringify(results), {
    headers: { 'content-type': 'application/json' },
  })
}
