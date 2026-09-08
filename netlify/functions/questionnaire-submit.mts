/**
 * Final submission.
 *
 * Validates everything again server-side, allocates the reference number,
 * writes the record and its build checklist in one transaction, then hands the
 * customer their reference. The AI summary and confirmation email happen after
 * the response — neither can cause a submission to fail.
 */
import type { Config, Context } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { checklistItems, submissions, uploadedFiles } from '../../db/schema.ts'
import { CHECKLIST_ITEMS, type FileCounts } from '../../shared/questionnaire.ts'
import { deriveContactFields, normaliseAnswers, validateSubmission } from '../lib/answers.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, clientIp, handle, json, rateLimit, readJson } from '../lib/http.ts'
import { allocateReference } from '../lib/reference.ts'
import { scheduleFollowUp } from '../lib/tasks.ts'
import { loadSubmissionByToken } from '../lib/tokens.ts'

export default handle(async (request: Request, context: Context) => {
  if (request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const submission = await loadSubmissionByToken(request)

  /**
   * Submitting twice — a double click, a retried request, a resumed tab — must
   * never create a second record or a second reference number. The already
   * submitted record is simply returned again.
   */
  if (submission.submittedAt && submission.reference) {
    return json({
      reference: submission.reference,
      submittedAt: submission.submittedAt.toISOString(),
      summaryStatus: submission.summaryStatus,
      emailStatus: submission.emailStatus,
      duplicate: true,
    })
  }

  await rateLimit(
    `submit:${clientIp(request, context)}`,
    10,
    60 * 60,
    'That is a few too many submissions from this connection. Please wait a little while, or email us directly.',
  )

  const db = getDb()
  const body = await readJson<{ answers?: unknown }>(request)

  // The browser's copy is normalised again here; the stored draft is the
  // fallback if this request carried nothing.
  const answers =
    body.answers === undefined ? (submission.answers ?? {}) : normaliseAnswers(body.answers)

  const files = await db
    .select({ fieldId: uploadedFiles.fieldId })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.submissionId, submission.id))

  const counts: FileCounts = {}
  for (const file of files) counts[file.fieldId] = (counts[file.fieldId] ?? 0) + 1

  const problems = validateSubmission(answers, counts)
  if (problems.length > 0) {
    throw new HttpError(
      422,
      'validation_failed',
      'A few answers still need attention before we can accept the questionnaire.',
      problems,
    )
  }

  const reference = await allocateReference()
  const now = new Date()
  const contact = deriveContactFields(answers)

  await db.transaction(async (tx) => {
    // The guard re-runs inside the transaction: two requests that both passed
    // the check above cannot both write a reference.
    const [current] = await tx
      .select({ submittedAt: submissions.submittedAt })
      .from(submissions)
      .where(eq(submissions.id, submission.id))
      .limit(1)
    if (current?.submittedAt) return

    await tx
      .update(submissions)
      .set({
        answers,
        reference,
        status: 'new',
        submittedAt: now,
        updatedAt: now,
        lastSavedAt: now,
        // A submitted record is permanent — only abandoned drafts expire.
        expiresAt: null,
        summaryStatus: 'pending',
        emailStatus: 'pending',
        ...contact,
      })
      .where(eq(submissions.id, submission.id))

    await tx
      .insert(checklistItems)
      .values(
        CHECKLIST_ITEMS.map((item, index) => ({
          submissionId: submission.id,
          itemKey: item.key,
          label: item.label,
          position: index,
        })),
      )
      .onConflictDoNothing()
  })

  const [saved] = await db
    .select({
      reference: submissions.reference,
      submittedAt: submissions.submittedAt,
      summaryStatus: submissions.summaryStatus,
      emailStatus: submissions.emailStatus,
    })
    .from(submissions)
    .where(eq(submissions.id, submission.id))
    .limit(1)

  scheduleFollowUp(submission.id, context.waitUntil)

  return json({
    reference: saved?.reference ?? reference,
    submittedAt: (saved?.submittedAt ?? now).toISOString(),
    summaryStatus: saved?.summaryStatus ?? 'pending',
    emailStatus: saved?.emailStatus ?? 'pending',
    duplicate: false,
  })
})

export const config: Config = {
  path: '/api/questionnaire/submit',
}
