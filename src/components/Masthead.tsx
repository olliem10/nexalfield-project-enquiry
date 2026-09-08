import type { ReactNode } from 'react'

interface MastheadProps {
  /** Optional right-hand slot: autosave state, admin identity, and so on. */
  children?: ReactNode
}

/**
 * NexalField brand bar. Uses the logo and wordmark from the live site so the
 * questionnaire reads as part of the same ecosystem.
 */
export function Masthead({ children }: MastheadProps) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <a className="brand" href="https://www.nexalfield.com" rel="noreferrer">
          <img src="/assets/img/nexalfield-logo.png" alt="" width={30} height={30} />
          <span className="brand-name">NexalField</span>
        </a>
        {children}
      </div>
    </header>
  )
}
