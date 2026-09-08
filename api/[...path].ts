/**
 * The whole API, as a single Vercel Function.
 *
 * Vercel routes every `/api/*` request here. The handlers themselves take a
 * `Request` and return a `Response`, and the only thing they want from the
 * platform is `params`, the caller's IP, and somewhere to hand background
 * work — so this file's job is just to match the path and supply those three.
 *
 * `server/lib/router.ts` builds the table from each function's own `config`,
 * so a function is reachable here purely by existing.
 */
import { waitUntil } from '@vercel/functions'
import { matchRoute, notFound } from '../server/lib/router.ts'

export const config = {
  runtime: 'nodejs',
  // Uploads arrive in 4MB parts and the assembly step buffers a whole 20MB
  // file, so the default allowance is not enough.
  memory: 1024,
  maxDuration: 60,
}

/**
 * Vercel puts the caller's address in `x-forwarded-for`, and `x-real-ip` on
 * some paths. The left-most entry is the client; the rest are proxies.
 */
function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim()
  return request.headers.get('x-real-ip') ?? undefined
}

export default async function handler(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url)

  const matched = matchRoute(pathname)
  if (!matched) return notFound()

  return matched.handler(request, {
    params: matched.params,
    ip: clientIp(request),
    /*
     * Lets the confirmation email and the AI summary finish after the customer
     * already has their reference number, instead of making them wait. Anything
     * that still fails is picked up by the housekeeping job.
     */
    waitUntil: (promise) => waitUntil(promise),
  })
}
