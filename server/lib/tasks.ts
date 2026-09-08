/**
 * Work that happens after a questionnaire is received.
 *
 * The governing rule: a submission is complete the moment the record is
 * written. The AI summary and the confirmation email are consequences of that,
 * never conditions of it — each records its own outcome, and a failure is
 * retried by the housekeeping job rather than shown to the customer as a failed
 * submission.
 */
import { and, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { submissions, uploadedFiles, type Submission } from '../../db/schema.ts'
import { generateProjectSummary } from './ai.ts'
import { configuredAdmins } from './auth.ts'
import { getDb } from './db.ts'
import { emailIsConfigured, sendAdminNotification, sendConfirmationEmail } from './email.ts'

/** Regenerates and stores the project brief. Never throws. */
export async function runSummaryTask(submissionId: string): Promise<void> {
  const db = getDb()

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1)
  if (!submission) return

  // Mark it in flight so two concurrent runs do not both call the model.
  await db
    .update(submissions)
    .set({ summaryStatus: 'generating', updatedAt: new Date() })
    .where(eq(submissions.id, submissionId))

  const files = await db
    .select({ fileName: uploadedFiles.fileName })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.submissionId, submissionId))

  const outcome = await generateProjectSummary(
    submission.answers ?? {},
    files.map((file) => file.fileName),
  )

  const attempts = submission.summaryAttempts + 1
  const now = new Date()

  if (outcome.status === 'ready') {
    await db
      .update(submissions)
      .set({
        summary: outcome.summary,
        summaryStatus: 'ready',
        summaryError: null,
        summaryAttempts: attempts,
        summaryUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(submissions.id, submissionId))
    return
  }

  await db
    .update(submissions)
    .set({
      summaryStatus: 'failed',
      summaryError: outcome.status === 'skipped' ? outcome.reason : outcome.error,
      summaryAttempts: attempts,
      summaryUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
}

/** Sends (or re-sends) the customer confirmation. Never throws. */
export async function runEmailTask(submissionId: string): Promise<void> {
  const db = getDb()

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1)
  if (!submission || !submission.reference) return

  if (!emailIsConfigured()) {
    await db
      .update(submissions)
      .set({
        emailStatus: 'skipped',
        emailError: 'No email provider is configured for this site.',
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, submissionId))
    return
  }

  const outcome = await sendConfirmationEmail({
    to: submission.email ?? '',
    customerName: submission.contactName ?? '',
    reference: submission.reference,
  })

  const attempts = submission.emailAttempts + 1
  const now = new Date()

  if (outcome.status === 'sent') {
    await db
      .update(submissions)
      .set({
        emailStatus: 'sent',
        emailError: null,
        emailProvider: outcome.provider,
        emailSentAt: now,
        emailAttempts: attempts,
        updatedAt: now,
      })
      .where(eq(submissions.id, submissionId))
    return
  }

  await db
    .update(submissions)
    .set({
      emailStatus: outcome.status,
      emailError: outcome.status === 'skipped' ? outcome.reason : outcome.error,
      emailAttempts: attempts,
      updatedAt: now,
    })
    .where(eq(submissions.id, submissionId))
}

/**
 * Tells NexalField a new enquiry has come in. A courtesy notification, not a
 * durable one: it is attempted once, right after submission, and — unlike the
 * customer confirmation — is not tracked on the record or retried later. The
 * enquiry itself is never at risk either way; it is already saved.
 */
export async function runAdminNotificationTask(submissionId: string): Promise<void> {
  if (!emailIsConfigured()) return

  const admins = configuredAdmins()
  if (admins.length === 0) return

  const db = getDb()
  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1)
  if (!submission || !submission.reference) return

  for (const admin of admins) {
    const outcome = await sendAdminNotification({
      to: admin.email,
      customerName: submission.contactName ?? '',
      customerEmail: submission.email ?? '',
      reference: submission.reference,
    })
    if (outcome.status === 'failed') {
      console.error('Admin notification email failed for', admin.email, outcome.error)
    }
  }
}

/**
 * Kicks off the post-submission work.
 *
 * `waitUntil` lets the response reach the customer immediately while the
 * summary and email finish in the background. Where it is unavailable the work
 * is still started but not awaited — either way the submit response never waits
 * on a model or a mail server.
 */
export function scheduleFollowUp(
  submissionId: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  const work = (async () => {
    await runEmailTask(submissionId).catch((error) =>
      console.error('Confirmation email task failed:', error),
    )
    await runAdminNotificationTask(submissionId).catch((error) =>
      console.error('Admin notification task failed:', error),
    )
    await runSummaryTask(submissionId).catch((error) =>
      console.error('Summary task failed:', error),
    )
  })()

  if (waitUntil) {
    waitUntil(work)
  } else {
    void work
  }
}

/**
 * Finds submitted records whose summary or email never completed. Used by the
 * housekeeping job, which is what makes a transient outage self-healing.
 */
export async function findOutstanding(limit = 20): Promise<Submission[]> {
  const db = getDb()
  const cutoff = new Date(Date.now() - 5 * 60 * 1000)

  return db
    .select()
    .from(submissions)
    .where(
      and(
        // "Submitted" is the presence of a timestamp, not a status value:
        // `status` belongs to the dashboard workflow (New, In Progress, …)
        // and moves on without ever meaning the record is unsent.
        isNotNull(submissions.submittedAt),
        lt(submissions.updatedAt, cutoff),
        or(
          and(
            inArray(submissions.summaryStatus, ['pending', 'generating', 'failed']),
            lt(submissions.summaryAttempts, 5),
          ),
          and(
            inArray(submissions.emailStatus, ['pending', 'failed']),
            lt(submissions.emailAttempts, 5),
          ),
        ),
      ),
    )
    .orderBy(sql`${submissions.submittedAt} desc`)
    .limit(limit)
}
