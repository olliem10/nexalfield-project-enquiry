'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EnquiryField from '@/components/EnquiryField'
import { loadStoredEnquiry, saveStoredEnquiry } from '@/lib/enquiry-storage'
import { SECTION_BY_STEP, TOTAL_STEPS, visibleFields, type Answers } from '@/lib/enquiry-sections'

export default function EnquiryPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [id, setId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState<Answers>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stored = loadStoredEnquiry()
    if (!stored) {
      router.replace('/')
      return
    }
    setId(stored.id)
    setStep(Math.min(Math.max(stored.step, 1), TOTAL_STEPS))
    setAnswers(stored.answers)
    setReady(true)
  }, [router])

  if (!ready || !id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-slate-500">Loading…</p>
      </main>
    )
  }

  const section = SECTION_BY_STEP.get(step)
  if (!section) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-red-600">Something went wrong loading this section.</p>
      </main>
    )
  }

  function updateField(fieldId: string, value: Answers[string]) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }))
    setFieldErrors((prev) => {
      if (!(fieldId in prev)) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  function goBack() {
    if (step <= 1) return
    const newStep = step - 1
    setStep(newStep)
    setFormError(null)
    setFieldErrors({})
    saveStoredEnquiry({ id: id as string, step: newStep, answers })
  }

  async function saveAndContinue() {
    setSaving(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const response = await fetch('/api/enquiry/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, step, answers }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (Array.isArray(data?.fieldErrors)) {
          const errors: Record<string, string> = {}
          for (const err of data.fieldErrors) errors[err.fieldId] = err.message
          setFieldErrors(errors)
        } else {
          setFormError(data?.error ?? 'Something went wrong saving your answers. Please try again.')
        }
        setSaving(false)
        return
      }

      const updatedAnswers = data.answers ?? answers
      setAnswers(updatedAnswers)

      if (step >= TOTAL_STEPS) {
        saveStoredEnquiry({ id: id as string, step, answers: updatedAnswers })
        router.push('/enquiry/review')
        return
      }

      const newStep = step + 1
      setStep(newStep)
      saveStoredEnquiry({ id: id as string, step: newStep, answers: updatedAnswers })
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setFormError('We could not reach the server. Please check your connection and try again.')
      setSaving(false)
    }
  }

  const progressPercent = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Website Project Enquiry
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>
            Step {step} of {TOTAL_STEPS}
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <h1 className="mt-6 text-2xl font-bold text-slate-900">{section.title}</h1>
      <p className="mt-1 text-slate-600">{section.intro}</p>

      <form
        className="mt-8 space-y-8"
        onSubmit={(e) => {
          e.preventDefault()
          saveAndContinue()
        }}
      >
        {visibleFields(section, answers).map((field) => (
          <EnquiryField
            key={field.id}
            field={field}
            value={answers[field.id]}
            error={fieldErrors[field.id]}
            onChange={(value) => updateField(field.id, value)}
          />
        ))}

        {formError && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-6">
          <button
            type="button"
            onClick={goBack}
            disabled={step <= 1 || saving}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : step >= TOTAL_STEPS ? 'Save & Review' : 'Save & Continue'}
          </button>
        </div>
      </form>
    </main>
  )
}
