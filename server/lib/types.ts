/**
 * The shapes every handler and the router share.
 *
 * Vercel's `api/[...path].ts` builds a `HandlerContext` from the raw request
 * (caller IP, route params, a way to hand off background work) and each
 * function declares its own routes with a `FunctionConfig`. Neither type
 * belongs to any one platform — they exist so a function's signature says
 * exactly what it needs without importing a host's SDK just for its types.
 */

export interface HandlerContext {
  params: Record<string, string>
  ip?: string
  waitUntil?: (promise: Promise<unknown>) => void
}

export interface FunctionConfig {
  path?: string | string[]
  excludedPath?: string | string[]
}
