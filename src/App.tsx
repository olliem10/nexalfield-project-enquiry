import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Masthead } from './components/Masthead'
import { PageLoading } from './components/Skeleton'
import { QuestionnairePage } from './questionnaire/QuestionnairePage'

// The dashboard is a separate chunk: none of the admin code is downloaded by a
// customer filling in the questionnaire.
const DashboardApp = lazy(async () => ({
  default: (await import('./dashboard/DashboardApp')).DashboardApp,
}))

function NotFound() {
  return (
    <>
      <Masthead />
      <main className="shell shell-narrow page-intro">
        <div className="stack">
          <p className="eyebrow">Page not found</p>
          <h1>We could not find that page</h1>
          <p className="lede">
            The link may be incomplete. You can pick up the website project questionnaire below.
          </p>
          <p>
            <a className="btn btn-primary" href="/questionnaire">
              Go to the questionnaire
            </a>
          </p>
        </div>
      </main>
    </>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/questionnaire" replace />} />
        <Route path="/questionnaire" element={<QuestionnairePage />} />
        <Route
          path="/dashboard/*"
          element={
            <Suspense fallback={<PageLoading label="Loading the dashboard" />}>
              <DashboardApp />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
