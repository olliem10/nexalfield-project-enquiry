import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SECTIONS,
  SECTION_BY_STEP,
  TOTAL_STEPS,
  completionPercent,
  validateSection,
  type Answers,
  type AnswerValue,
} from '@shared/questionnaire'
import { ApiError, api } from '../lib/api'
import { clearStoredToken, consumeTokenFromUrl, readStoredToken, storeToken } from './storage'
import { useUploads, type StoredFile } from './uploads'

export type Phase = 'loading' | 'intro' | 'wizard' | 'review' | 'done'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SessionPayload {
  status: string
  reference: string | null
  answers: Answers
  currentStep: number
  furthestStep: number
  lastSavedAt: string | null
  submittedAt: string | null
  expiresAt: string | null
  summaryStatus: string
  files: StoredFile[]
}

interface SubmitResponse {
  reference: string
  submittedAt: string | null
  summaryStatus: string
  emailStatus?: string
  duplicate: boolean
}

const AUTOSAVE_DELAY = 900

export function useQuestionnaire() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [step, setStep] = useState(1)
  const [furthestStep, setFurthestStep] = useState(1)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resumed, setResumed] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)

  const uploads = useUploads(token)
  const { setFiles, counts } = uploads

  const tokenRef = useRef<string | null>(null)
  const answersRef = useRef<Answers>({})
  const stepRef = useRef(1)
  const savedSnapshot = useRef<string>('')
  const timer = useRef<number | undefined>(undefined)
  const inFlight = useRef(false)
  const submittingRef = useRef(false)

  tokenRef.current = token
  answersRef.current = answers
  stepRef.current = step

  const snapshot = useCallback(
    () => JSON.stringify({ answers: answersRef.current, step: stepRef.current }),
    [],
  )

  /* ---------------------------------------------------------------- *
   * Loading and starting
   * ---------------------------------------------------------------- */

  const applySession = useCallback(
    (session: SessionPayload) => {
      setAnswers(session.answers ?? {})
      setFiles(session.files ?? [])
      setFurthestStep(Math.max(1, session.furthestStep || 1))
      setSavedAt(session.lastSavedAt)
      setReference(session.reference)
      setSubmittedAt(session.submittedAt)
      const nextStep = Math.min(TOTAL_STEPS, Math.max(1, session.currentStep || 1))
      setStep(nextStep)
      answersRef.current = session.answers ?? {}
      stepRef.current = nextStep
      savedSnapshot.current = JSON.stringify({ answers: session.answers ?? {}, step: nextStep })
    },
    [setFiles],
  )

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const existing = consumeTokenFromUrl() ?? readStoredToken()
      if (!existing) {
        setPhase('intro')
        return
      }

      try {
        const { session } = await api<{ session: SessionPayload }>('/api/questionnaire/session', {
          token: existing,
        })
        if (cancelled) return
        setToken(existing)
        storeToken(existing)
        applySession(session)
        if (session.status !== 'draft') {
          setPhase('done')
        } else {
          setResumed(true)
          setPhase('wizard')
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
          clearStoredToken()
          setNotice(
            error.status === 410
              ? 'Your saved questionnaire has expired. You can start a new one below — it only takes 10–15 minutes.'
              : 'We could not find that saved questionnaire. You can start a new one below.',
          )
          setPhase('intro')
          return
        }
        setStartError(
          error instanceof ApiError
            ? error.message
            : 'We could not load your questionnaire. Please refresh and try again.',
        )
        setPhase('intro')
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [applySession])

  const start = useCallback(async () => {
    setStartError(null)
    setNotice(null)
    try {
      const created = await api<{ token: string; session: SessionPayload }>(
        '/api/questionnaire/session',
        { method: 'POST', body: {} },
      )
      setToken(created.token)
      storeToken(created.token)
      applySession(created.session)
      setPhase('wizard')
    } catch (error) {
      setStartError(
        error instanceof ApiError
          ? error.message
          : 'We could not start the questionnaire. Please try again.',
      )
    }
  }, [applySession])

  /* ---------------------------------------------------------------- *
   * Autosave
   * ---------------------------------------------------------------- */

  const save = useCallback(async (): Promise<boolean> => {
    const activeToken = tokenRef.current
    if (!activeToken || inFlight.current) return false
    const payload = snapshot()
    if (payload === savedSnapshot.current) {
      setSaveState((state) => (state === 'error' ? 'idle' : state))
      return true
    }

    inFlight.current = true
    setSaveState('saving')
    try {
      const result = await api<{ savedAt: string }>('/api/questionnaire/session', {
        method: 'PATCH',
        token: activeToken,
        body: { answers: answersRef.current, currentStep: stepRef.current },
      })
      savedSnapshot.current = payload
      setSavedAt(result.savedAt)
      setSaveState('saved')
      return true
    } catch (error) {
      if (error instanceof ApiError && error.code === 'already_submitted') {
        setSaveState('idle')
        return true
      }
      setSaveState('error')
      return false
    } finally {
      inFlight.current = false
    }
  }, [snapshot])

  const queueSave = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void save()
    }, AUTOSAVE_DELAY)
  }, [save])

  // Flush pending work if the customer leaves or backgrounds the tab.
  useEffect(() => {
    function flush() {
      if (document.visibilityState === 'hidden' && tokenRef.current) {
        window.clearTimeout(timer.current)
        void save()
      }
    }
    document.addEventListener('visibilitychange', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.clearTimeout(timer.current)
    }
  }, [save])

  const setAnswer = useCallback(
    (fieldId: string, value: AnswerValue) => {
      setAnswers((current) => ({ ...current, [fieldId]: value }))
      setErrors((current) => {
        if (!current[fieldId]) return current
        const next = { ...current }
        delete next[fieldId]
        return next
      })
      queueSave()
    },
    [queueSave],
  )

  const saveNow = useCallback(async () => {
    window.clearTimeout(timer.current)
    return save()
  }, [save])

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  const goToStep = useCallback(
    (next: number) => {
      const target = Math.min(TOTAL_STEPS, Math.max(1, next))
      setStep(target)
      stepRef.current = target
      setFurthestStep((current) => Math.max(current, target))
      setPhase('wizard')
      queueSave()
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    },
    [queueSave],
  )

  const section = SECTION_BY_STEP.get(step)

  const validateCurrent = useCallback((): boolean => {
    if (!section) return true
    const found = validateSection(section, answers, counts)
    if (found.length === 0) {
      setErrors({})
      return true
    }
    const map: Record<string, string> = {}
    for (const error of found) map[error.fieldId] = error.message
    setErrors(map)
    requestAnimationFrame(() => {
      const target = document.getElementById(`${found[0].fieldId}-label`)
      target?.scrollIntoView({ block: 'center', behavior: 'auto' })
      const control = document.getElementById(found[0].fieldId)
      if (control instanceof HTMLElement) control.focus({ preventScroll: true })
    })
    return false
  }, [answers, counts, section])

  const next = useCallback(() => {
    if (!validateCurrent()) return
    if (step >= TOTAL_STEPS) {
      setPhase('review')
      void saveNow()
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
      return
    }
    goToStep(step + 1)
  }, [goToStep, saveNow, step, validateCurrent])

  const back = useCallback(() => {
    if (phase === 'review') {
      setPhase('wizard')
      goToStep(TOTAL_STEPS)
      return
    }
    if (step > 1) goToStep(step - 1)
  }, [goToStep, phase, step])

  /* ---------------------------------------------------------------- *
   * Submission
   * ---------------------------------------------------------------- */

  const submit = useCallback(async () => {
    const activeToken = tokenRef.current
    if (!activeToken || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    try {
      window.clearTimeout(timer.current)
      await save()
      const result = await api<SubmitResponse>('/api/questionnaire/submit', {
        method: 'POST',
        token: activeToken,
        body: { answers: answersRef.current },
      })
      setReference(result.reference)
      setSubmittedAt(result.submittedAt)
      setPhase('done')
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.fields?.length) {
        const map: Record<string, string> = {}
        for (const entry of error.fields) map[entry.fieldId] = entry.message
        setErrors(map)
        const earliest = error.fields
          .map((entry) => entry.step ?? TOTAL_STEPS)
          .reduce((lowest, value) => Math.min(lowest, value), TOTAL_STEPS)
        setSubmitError(error.message)
        goToStep(earliest)
      } else {
        setSubmitError(
          error instanceof ApiError
            ? error.message
            : 'We could not send your questionnaire. Please try again.',
        )
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [goToStep, save])

  const startAnother = useCallback(() => {
    clearStoredToken()
    window.location.assign('/questionnaire')
  }, [])

  const percent = useMemo(() => completionPercent(answers, counts), [answers, counts])

  const sectionErrors = useMemo(() => {
    const map = new Map<number, number>()
    for (const entry of SECTIONS) {
      const found = validateSection(entry, answers, counts)
      if (found.length > 0) map.set(entry.step, found.length)
    }
    return map
  }, [answers, counts])

  return {
    phase,
    setPhase,
    token,
    answers,
    setAnswer,
    step,
    section,
    furthestStep,
    percent,
    errors,
    notice,
    startError,
    submitError,
    submitting,
    resumed,
    reference,
    submittedAt,
    saveState,
    savedAt,
    sectionErrors,
    uploads,
    start,
    saveNow,
    goToStep,
    next,
    back,
    submit,
    startAnother,
    dismissResumed: () => setResumed(false),
  }
}

export type Questionnaire = ReturnType<typeof useQuestionnaire>
