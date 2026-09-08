/**
 * The continuation token is an opaque, server-generated secret — never a
 * database id. It is kept in localStorage for the same browser and can be
 * carried to another device with a link that puts it in the URL *fragment*,
 * which browsers never send to a server or leak in a referrer header. It is
 * removed from the address bar as soon as it has been read.
 */
const KEY = 'nexalfield.questionnaire.token'
const FRAGMENT = 'continue'

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function storeToken(token: string): void {
  try {
    window.localStorage.setItem(KEY, token)
  } catch {
    /* Private browsing can refuse storage; the resume link still works. */
  }
}

export function clearStoredToken(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}

/** Reads (and immediately strips) a continuation token from the URL fragment. */
export function consumeTokenFromUrl(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const token = params.get(FRAGMENT)
  if (!token) return null
  window.history.replaceState(null, '', window.location.pathname)
  return token
}

export function resumeLink(token: string): string {
  return `${window.location.origin}/questionnaire#${FRAGMENT}=${token}`
}
