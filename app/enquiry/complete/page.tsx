'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function CompleteContent() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
        ✓
      </div>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Thank you — your enquiry is in</h1>
      <p className="mt-2 text-slate-600">
        We&apos;ve received your Website Project Enquiry and will be in touch using the details
        you provided.
      </p>
      {ref && (
        <p className="mt-4 text-sm text-slate-500">
          Your reference number: <span className="font-mono text-slate-700">{ref}</span>
        </p>
      )}
      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Return to the homepage
        </Link>
      </div>
    </main>
  )
}

export default function CompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteContent />
    </Suspense>
  )
}
