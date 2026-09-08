/**
 * The project summary shown on the thank-you page.
 *
 *   POST — ask for it to be generated, then report where it got to
 *   GET  — poll for the result
 *
 * The customer sees only the summary for their own submission, identified by
 * their continuation token. Nothing internal is exposed here.
 */
import type { FunctionConfig, HandlerContext } from '../lib/types.ts'
import { HttpError, clientIp, handle, json, rateLimit } from '../lib/http.ts'
import { runSummaryTask } from '../lib/tasks.ts'
import { loadSubmissionByToken } from '../lib/tokens.ts'

export default handle(async (request: Request, context: HandlerContext) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    throw new HttpError(405, 'method_not_allowed', 'That method is not supported here.')
  }

  const submission = await loadSubmissionByToken(request)

  if (!submission.submittedAt) {
    throw new HttpError(
      409,
      'not_submitted',
      'This enquiry has not been submitted yet, so there is no summary.',
    )
  }

  // A POST asks us to spend money on a model, so it is limited more tightly
  // than the polling GET the thank-you page performs.
  if (request.method === 'POST' && submission.summaryStatus === 'pending') {
    await rateLimit(`summary:${clientIp(request, context)}`, 6, 60 * 60)
    await runSummaryTask(submission.id).catch((error) =>
      console.error('Summary generation failed:', error),
    )
  }

  // Re-read: the task above will have moved the status on.
  const current = await loadSubmissionByToken(request)

  return json({
    reference: current.reference,
    status: current.summaryStatus,
    summary: current.summary ?? null,
    // The customer is told a summary is still being prepared, never why it
    // failed — an internal error message is not theirs to read.
    error: null,
    attempts: current.summaryAttempts,
  })
})

export const config: FunctionConfig = {
  path: '/api/questionnaire/summary',
}
