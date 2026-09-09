'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveStoredEnquiry } from '@/lib/enquiry-storage'

export default function StartEnquiryButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/enquiry/start', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        setError(data?.error ?? 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      saveStoredEnquiry({ id: data.id, step: data.currentStep ?? 1, answers: data.answers ?? {} })
      router.push('/enquiry')
    } catch {
      setError('We could not reach the server. Please check your connection and try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleStart}
        disabled={loading}
        className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Starting…' : 'Start Project Enquiry'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
