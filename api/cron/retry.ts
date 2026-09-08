/**
 * The hourly housekeeping job, as a Vercel Cron target.
 *
 * On Netlify this is a scheduled function (`retry-outstanding.mts`, `@hourly`).
 * Vercel schedules by calling a URL instead, so this is the doorway to the same
 * work: retry confirmation emails and AI summaries that failed earlier, and
 * clear out expired drafts, abandoned upload parts and stale rate-limit rows.
 *
 * The schedule lives in vercel.json.
 */
import runHousekeeping from '../../netlify/functions/retry-outstanding.mts'

export const config = { runtime: 'nodejs', maxDuration: 60 }

export default async function handler(request: Request): Promise<Response> {
  /*
   * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is
   * set. Without it anyone could trigger the job — which spends money on the
   * AI model and sends email — so a configured secret is required to match.
   */
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = request.headers.get('authorization')
    if (provided !== `Bearer ${secret}`) {
      return new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Not permitted.' } }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      )
    }
  }

  return runHousekeeping()
}
