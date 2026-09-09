import type { Answers } from '@/lib/enquiry-sections'

const STORAGE_KEY = 'nexalfield-enquiry'

export interface StoredEnquiry {
  id: string
  step: number
  answers: Answers
}

export function loadStoredEnquiry(): StoredEnquiry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.id !== 'string' || typeof parsed?.step !== 'number') return null
    return { id: parsed.id, step: parsed.step, answers: parsed.answers ?? {} }
  } catch {
    return null
  }
}

export function saveStoredEnquiry(value: StoredEnquiry): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore storage failures (private browsing, quota, etc.) — the in-memory
    // state for this session still works, refresh resilience is best-effort.
  }
}

export function clearStoredEnquiry(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}
