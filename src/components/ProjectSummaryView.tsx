export interface ProjectSummary {
  businessName: string
  overview: string
  websiteGoals: string[]
  requestedPages: string[]
  brandingPreferences: string[]
  contentAvailable: string[]
  specialRequests: string[]
  generatedAt?: string
  model?: string
}

interface ProjectSummaryViewProps {
  summary: ProjectSummary
  columns?: boolean
}

const BLOCKS: { key: keyof ProjectSummary; title: string }[] = [
  { key: 'websiteGoals', title: 'Website goals' },
  { key: 'requestedPages', title: 'Requested pages' },
  { key: 'brandingPreferences', title: 'Branding preferences' },
  { key: 'contentAvailable', title: 'Content available' },
  { key: 'specialRequests', title: 'Special requests' },
]

/** Shared between the customer thank-you page and the internal record page. */
export function ProjectSummaryView({ summary, columns = true }: ProjectSummaryViewProps) {
  return (
    <div className="stack">
      {summary.businessName ? (
        <div className="summary-block">
          <h4>Business</h4>
          <p>{summary.businessName}</p>
        </div>
      ) : null}

      {summary.overview ? <p className="lede">{summary.overview}</p> : null}

      <div className={`summary-grid${columns ? ' summary-grid-2' : ''}`}>
        {BLOCKS.map((block) => {
          const items = (summary[block.key] as string[] | undefined) ?? []
          if (items.length === 0) return null
          return (
            <div key={block.key} className="summary-block">
              <h4>{block.title}</h4>
              <ul>
                {items.map((item, index) => (
                  <li key={`${block.key}-${index}`}>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
