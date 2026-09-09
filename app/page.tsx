import StartEnquiryButton from '@/components/StartEnquiryButton'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">NexalField</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        Website Project Enquiry
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Answer a few questions about your business and what you need from a website. It takes
        most people around 15 minutes, and you can save your progress and come back at any time.
      </p>

      <ul className="mt-8 space-y-2 text-sm text-slate-600">
        <li>• Seven short sections — your business, customers, and the site itself</li>
        <li>• Nothing is submitted until you review and confirm everything</li>
        <li>• Your answers are kept private and used only to plan your project</li>
      </ul>

      <div className="mt-10">
        <StartEnquiryButton />
      </div>
    </main>
  )
}
