'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  SECTIONS,
  formatAnswer,
  visibleFields,
  type Answers,
  type FieldError,
} from '@/lib/enquiry-sections'
import { clearStoredEnquiry, loadStoredEnquiry, saveStoredEnquiry } from '@/lib/enquiry-storage'

export default function ReviewPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [id, setId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [outstanding, setOutstanding] = useState<FieldError[]>([])

  useEffect(() => {
    const stored = loadStoredEnquiry()
    if (!stored) {
      router.replace('/')
      return
    }
    setId(stored.id)
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

  function editStep(step: number) {
    saveStoredEnquiry({ id: id as string, step, answers })
    router.push('/enquiry')
  }

  async function handleSubmit() {
    setSubmitting(true)
    setFormError(null)
    setOutstanding([])

    try {
      const response = await fetch('/api/enquiry/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await response.json()

      if (!response.ok) {
        if (Array.isArray(data?.fieldErrors)) {
          setOutstanding(data.fieldErrors)
          setFormError(data?.error ?? 'Some required answers are missing or invalid.')
        } else {
          setFormError(data?.error ?? 'Something went wrong submitting your enquiry. Please try again.')
        }
        setSubmitting(false)
        return
      }

      clearStoredEnquiry()
      router.push(`/enquiry/complete?ref=${encodeURIComponent(data.id)}`)
    } catch {
      setFormError('We could not reach the server. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
        Website Project Enquiry
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Review your answers</h1>
      <p className="mt-1 text-slate-600">
        Check everything below, then submit your enquiry. You can jump back to any section to
        make changes.
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((section) => {
          const fields = visibleFields(section, answers)
          return (
            <div key={section.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                <button
                  type="button"
                  onClick={() => editStep(section.step)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Edit
                </button>
              </div>
              <dl className="mt-3 space-y-3">
                {fields.map((field) => {
                  const formatted = formatAnswer(field, answers[field.id])
                  return (
                    <div key={field.id}>
                      <dt className="text-sm font-medium text-slate-500">{field.label}</dt>
                      <dd className="whitespace-pre-line text-sm text-slate-900">
                        {formatted || <span className="text-slate-400">Not answered</span>}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </div>
          )
        })}
      </div>

      {formError && (
        <div className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{formError}</p>
          {outstanding.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {outstanding.map((err) => (
                <li key={err.fieldId}>
                  <button
                    type="button"
                    onClick={() => editStep(err.step)}
                    className="underline hover:no-underline"
                  >
                    {err.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-end border-t border-slate-200 pt-6">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit Enquiry'}
        </button>
      </div>
    </main>
  )
}
