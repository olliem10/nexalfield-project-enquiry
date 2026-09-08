import type { ReactNode } from 'react'

type Tone = 'info' | 'error' | 'warning' | 'success'

interface NoticeProps {
  tone?: Tone
  title?: string
  children: ReactNode
  action?: ReactNode
  /** Announce the message to screen readers as it appears. */
  live?: boolean
}

const TONE_CLASS: Record<Tone, string> = {
  info: '',
  error: 'notice-error',
  warning: 'notice-warning',
  success: 'notice-success',
}

export function Notice({ tone = 'info', title, children, action, live }: NoticeProps) {
  return (
    <div
      className={`notice ${TONE_CLASS[tone]}`.trim()}
      role={tone === 'error' ? 'alert' : live ? 'status' : undefined}
      aria-live={live && tone !== 'error' ? 'polite' : undefined}
    >
      <div className="stack-sm">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action ? <div className="notice-actions">{action}</div> : null}
    </div>
  )
}
