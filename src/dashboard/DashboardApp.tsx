import { Link, Route, Routes } from 'react-router-dom'
import { PageLoading } from '../components/Skeleton'
import { LoginPage } from './LoginPage'
import { ProjectPage } from './ProjectPage'
import { ProjectsPage } from './ProjectsPage'
import { useAdminSession } from './useAdminSession'

export function DashboardApp() {
  const session = useAdminSession()

  if (session.state === 'checking') {
    return <PageLoading label="Checking your session" />
  }

  if (session.state === 'signed-out' || !session.admin) {
    return <LoginPage configError={session.configError} onSignedIn={session.setSignedIn} />
  }

  return (
    <div className="admin-shell">
      <div className="admin-bar">
        <div className="admin-bar-inner">
          <div className="row" style={{ gap: 12 }}>
            <Link className="brand" to="/dashboard">
              <img src="/assets/img/nexalfield-logo.png" alt="" width={26} height={26} />
              <span className="brand-name">NexalField</span>
            </Link>
            <span className="admin-tag">Project dashboard</span>
          </div>
          <div className="row">
            <span className="small muted">{session.admin.name || session.admin.email}</span>
            <button type="button" className="btn btn-sm" onClick={() => void session.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </div>

      <main className="admin-main">
        <div className="shell">
          <Routes>
            <Route index element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectPage onSignedOut={session.refresh} />} />
            <Route
              path="*"
              element={
                <div className="card stack-sm">
                  <h2>Page not found</h2>
                  <p className="help">
                    <Link to="/dashboard">Back to all projects</Link>
                  </p>
                </div>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  )
}
