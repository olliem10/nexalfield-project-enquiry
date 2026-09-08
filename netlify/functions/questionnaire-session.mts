/**
 * Start, resume and autosave a draft questionnaire.
 *
 *   POST   — create a draft and hand back a continuation token
 *   GET    — resume the draft the token identifies
 *   PATCH  — autosave answers and the current step
 */
import type { Config, Context } from '@netlify/functions'
import { asc, eq } from 'drizzle-orm'
import { submissions, uploadedFiles } from '../../db/schema.ts'
import { clampStep, normaliseAnswers } from '../lib/answers.ts'
import { getDb } from '../lib/db.ts'
import { HttpError, clientIp, handle, json, rateLimit, readJson } from '../lib/http.ts'
import { createResumeToken, draftExpiry, loadSubmissionByToken } from '../lib/tokens.ts'
import type { Submission } from '../../db/schema.ts'

async function filesFor(submissionId: string) {
  const db = getDb()
  const rows = await db
    .select({
      id: uploadedFiles.id,
      fieldId: uploadedFiles.fieldId,
      fileName: uploadedFiles.fileName,
      contentType: uploadedFiles.contentType,
      sizeBytes: uploadedFiles.sizeBytes,
      createdAt: uploadedFiles.createdAt,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.submissionId, submissionId))
    .orderBy(asc(uploadedFiles.createdAt))

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

/**
 * The customer-facing view of a draft. Deliberately narrow: no database id, no
 * token hash, and nothing about internal notes or workflow status.
 */
async function sessionPayload(submission: Submission) {
  return {
    status: submission.submittedAt ? 'submitted' : 'draft',
    reference: submission.reference,
    answers: submission.answers ?? {},
    currentStep: submission.currentStep,
    furthestStep: submission.furthestStep,
    lastSavedAt: submission.lastSavedAt?.toISOString() ?? null,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    expiresAt: submission.expiresAt?.toISOString() ?? null,
    summaryStatus: submission.summaryStatus,
    files: await filesFor(submission.id),
  }
}

async function startDraft(request: Request, context: Context): Promise<Response> {
  // Enough headroom for a household or an office behind one address, but not
  // enough for a script to fill the table.
  await rateLimit(`start:${clientIp(request, context)}`, 20, 60 * 60)

  const db = getDb()
  const { token, hash } = createResumeToken()

  const [created] = await db
    .insert(submissions)
    .values({
      tokenHash: hash,
      status: 'draft',
      answers: {},
      currentStep: 1,
      furthestStep: 1,
      expiresAt: draftExpiry(),
    })
    .returning()

  return json({ token, session: await sessionPayload(created) }, 201)
}

async function resumeDraft(request: Request): Promise<Response> {
  const submission = await loadSubmissionByToken(request)
  return json({ session: await sessionPayload(submission) })
}

async function autosave(request: Request, context: Context): Promise<Response> {
  const submission = await loadSubmissionByToken(request)

  if (submission.submittedAt) {
    throw new HttpError(
      409,
      'already_submitted',
      'This questionnaire has already been sent to us, so it can no longer be changed.',
    )
  }

  await rateLimit(`save:${clientIp(request, context)}`, 600, 60 * 60)

  const body = await readJson<{ answers?: unknown; currentStep?: unknown }>(request)
  const answers = normaliseAnswers(body.answers ?? {})
  const currentStep = clampStep(body.currentStep, submission.currentStep)
  const now = new Date()

  const db = getDb()
  const [saved] = await db
    .update(submissions)
    .set({
      answers,
      currentStep,
      furthestStep: Math.max(submission.furthestStep, currentStep),
      lastSavedAt: now,
      updatedAt: now,
      // Every save pushes the expiry out, so an active customer's draft never
      // disappears mid-questionnaire.
      expiresAt: draftExpiry(),
    })
    .where(eq(submissions.id, submission.id))
    .returning({ lastSavedAt: submissions.lastSavedAt })

  return json({ savedAt: (saved?.lastSavedAt ?? now).toISOString() })
}

export default handle(async (request: Request, context: Context) => {
  switch (request.method) {
    case 'POST':
      return startDraft(request, context)
    case 'GET':
      return resumeDraft(request)
    case 'PATCH':
      return autosave(request, context)
    default:
      throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }
})

export const config: Config = {
  path: '/api/questionnaire/session',
}
