import { useEffect, useId, useState, type ReactNode } from 'react'

interface CollapsiblePanelProps {
  title: string
  children: ReactNode
  /** Collapsed on small screens so it never crowds the questionnaire. */
  collapsibleBelow?: number
}

export function CollapsiblePanel({
  title,
  children,
  collapsibleBelow = 1000,
}: CollapsiblePanelProps) {
  const id = useId()
  const query = `(min-width: ${collapsibleBelow}px)`
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(query).matches,
  )
  const [open, setOpen] = useState(wide)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = (event: MediaQueryList | MediaQueryListEvent) => {
      setWide(event.matches)
      if (event.matches) setOpen(true)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  const expanded = wide || open

  return (
    <section className="panel">
      <button
        type="button"
        className={`panel-head${wide ? ' panel-head-static' : ''}`}
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => {
          if (!wide) setOpen((value) => !value)
        }}
      >
        <span>{title}</span>
        {wide ? null : (
          <svg className="panel-chevron" width="14" height="9" viewBox="0 0 14 9" aria-hidden="true">
            <path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </button>
      <div className="panel-body" id={id} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
