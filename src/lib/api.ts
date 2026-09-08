export interface ApiFieldError {
  fieldId: string
  message: string
  step?: number
}

/** Every server error arrives as { error: { code, message, ... } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: ApiFieldError[],
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const OFFLINE =
  'We could not reach the server. Check your connection — your answers are safe and will be sent again.'

interface RequestOptions {
  method?: string
  body?: unknown
  /** Continuation token for customer endpoints. */
  token?: string | null
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.token) headers['x-nexalfield-resume'] = options.token

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new ApiError(0, 'offline', OFFLINE)
  }

  if (response.status === 204) return undefined as T

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; fields?: ApiFieldError[] } })
      ?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'server_error',
      error?.message ?? 'Something went wrong. Please try again in a moment.',
      error?.fields,
    )
  }

  return payload as T
}

/** Raw PUT used for upload chunks — the body is bytes, not JSON. */
export async function putBytes(
  path: string,
  bytes: Blob,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', 'x-nexalfield-resume': token },
      body: bytes,
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw new ApiError(0, 'offline', OFFLINE)
  }

  if (!response.ok) {
    let message = 'That part of the file did not upload. Please retry.'
    let code = 'upload_failed'
    try {
      const payload = (await response.json()) as { error?: { code?: string; message?: string } }
      if (payload?.error?.message) message = payload.error.message
      if (payload?.error?.code) code = payload.error.code
    } catch {
      /* keep the friendly default */
    }
    throw new ApiError(response.status, code, message)
  }
}
