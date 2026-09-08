import { statusLabel } from '@shared/questionnaire'

interface StatusBadgeProps {
  status: string
}

/**
 * Status is conveyed by label *and* colour, never colour alone, so the badge
 * always reads correctly in greyscale or to a screen reader.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
}
