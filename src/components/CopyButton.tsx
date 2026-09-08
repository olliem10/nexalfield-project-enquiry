import { useEffect, useRef, useState } from 'react'

interface CopyButtonProps {
  value: string
  label?: string
  className?: string
}

/** Copies to the clipboard, with a visible confirmation for both mouse and AT users. */
export function CopyButton({ value, label = 'Copy', className = 'btn btn-sm' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard permissions can be denied; the value is always visible and
      // selectable next to the button, so tell the customer to copy manually.
      setCopied(false)
      window.prompt('Copy this link:', value)
      return
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2400)
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? 'Copied' : label}
      <span className="visually-hidden" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  )
}
