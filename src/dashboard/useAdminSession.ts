import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../lib/api'

export interface Admin {
  email: string
  name: string
}

type State = 'checking' | 'signed-in' | 'signed-out'

/**
 * The dashboard UI is only ever a convenience: every API route re-checks the
 * signed session server-side, so hiding the UI is not the security boundary.
 */
export function useAdminSession() {
  const [state, setState] = useState<State>('checking')
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const result = await api<{ admin: Admin }>('/api/admin/session')
      setAdmin(result.admin)
      setState('signed-in')
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        setConfigError(error.message)
      }
      setAdmin(null)
      setState('signed-out')
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const signOut = useCallback(async () => {
    try {
      await api('/api/admin/logout', { method: 'POST', body: {} })
    } finally {
      setAdmin(null)
      setState('signed-out')
    }
  }, [])

  return { state, admin, configError, refresh: check, signOut, setSignedIn: (value: Admin) => {
    setAdmin(value)
    setState('signed-in')
  } }
}
