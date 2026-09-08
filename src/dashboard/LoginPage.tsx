import { useState } from 'react'
import { ApiError, api } from '../lib/api'
import { Masthead } from '../components/Masthead'
import { Notice } from '../components/Notice'
import type { Admin } from './useAdminSession'

interface LoginPageProps {
  configError: string | null
  onSignedIn: (admin: Admin) => void
}

export function LoginPage({ configError, onSignedIn }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api<{ admin: Admin }>('/api/admin/login', {
        method: 'POST',
        body: { email, password },
      })
      onSignedIn(result.admin)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'We could not sign you in. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Masthead>
        <span className="admin-tag">Internal</span>
      </Masthead>
      <main className="login-wrap">
        <div className="login-card card stack">
          <div className="stack-sm">
            <p className="eyebrow">NexalField internal</p>
            <h1 style={{ fontSize: '1.7rem' }}>Project dashboard</h1>
            <p className="help">
              This area is for NexalField staff only. Customer enquiries and uploaded files are
              private.
            </p>
          </div>

          {configError ? (
            <Notice tone="warning" title="Dashboard not configured yet">
              {configError}
            </Notice>
          ) : null}

          {error ? <Notice tone="error">{error}</Notice> : null}

          <form className="stack" onSubmit={submit}>
            <div className="stack-sm">
              <label className="label" htmlFor="admin-email">
                Email address
              </label>
              <input
                id="admin-email"
                className="input"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="stack-sm">
              <label className="label" htmlFor="admin-password">
                Password
              </label>
              <input
                id="admin-password"
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </main>
    </>
  )
}
