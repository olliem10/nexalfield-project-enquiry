import { Masthead } from './Masthead'

interface SkeletonProps {
  width?: string
  height?: number
}

export function Skeleton({ width = '100%', height = 14 }: SkeletonProps) {
  return <div className="skeleton" style={{ width, height }} aria-hidden="true" />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card stack" aria-hidden="true">
      <Skeleton width="38%" height={12} />
      <Skeleton width="72%" height={22} />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} width={index === rows - 1 ? '55%' : '100%'} />
      ))}
    </div>
  )
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="project-row stack-sm">
          <Skeleton width="42%" height={16} />
          <Skeleton width="66%" height={12} />
        </div>
      ))}
    </div>
  )
}

/** Full-page loading state used while a route chunk or a record loads. */
export function PageLoading({ label }: { label: string }) {
  return (
    <>
      <Masthead />
      <main className="shell page-intro stack-lg">
        <span className="visually-hidden" role="status">
          {label}
        </span>
        <SkeletonCard rows={2} />
        <SkeletonCard rows={4} />
      </main>
    </>
  )
}
