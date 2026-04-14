// Shimmer skeleton loaders for async data states

export function SkeletonLine({ width = '100%', height = 14, style }) {
  return (
    <span
      className="skeleton-line"
      style={{ display: 'block', width, height, ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletonBlock({ height = 80, style }) {
  return (
    <div
      className="skeleton-block"
      style={{ height, width: '100%', ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ height = 100 }) {
  return <SkeletonBlock height={height} style={{ borderRadius: 10 }} />
}

export function SkeletonPanel({ rows = 4 }) {
  return (
    <section className="panel" aria-label="Loading…">
      <div style={{ display: 'grid', gap: 10 }}>
        <SkeletonLine width="40%" height={12} />
        <SkeletonLine width="60%" height={20} />
      </div>
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonBlock key={i} height={54} />
        ))}
      </div>
    </section>
  )
}
