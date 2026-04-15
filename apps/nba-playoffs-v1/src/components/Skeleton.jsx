// Shimmer skeleton loaders for async data states

export function SkeletonLine({ width = "100%", height = 14, style }) {
  return (
    <span
      className="skeleton-line"
      style={{ display: "block", width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({ height = 80, style }) {
  return (
    <div
      className="skeleton-block"
      style={{ height, width: "100%", ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonPickRow() {
  return (
    <div
      className="pick-row"
      style={{ cursor: "default", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <div className="pick-num">
        <SkeletonLine width={24} height={14} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <SkeletonLine width="55%" height={14} />
        <SkeletonLine width="35%" height={11} />
      </div>
    </div>
  );
}

export function SkeletonPickList({ count = 5 }) {
  return (
    <div className="pick-list" aria-label="Loading…">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonPickRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonBoardRow() {
  return (
    <div
      className="board-row"
      style={{ cursor: "default", pointerEvents: "none" }}
      aria-hidden="true"
    >
      <SkeletonLine width={28} height={14} />
      <SkeletonLine width="70%" height={14} />
      <SkeletonLine width="60%" height={11} />
      <SkeletonLine width="70%" height={11} />
      <SkeletonLine width="50%" height={11} />
      <SkeletonLine width="50%" height={11} />
      <SkeletonLine width="60%" height={11} />
      <SkeletonLine width="55%" height={11} />
      <SkeletonLine width="65%" height={11} />
      <span />
    </div>
  );
}

export function SkeletonBoardTable({ count = 8 }) {
  return (
    <div className="board-table" aria-label="Loading prospects…">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBoardRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 100 }) {
  return <SkeletonBlock height={height} style={{ borderRadius: 10 }} />;
}

// Full-panel loading state
export function SkeletonPanel({ rows = 4 }) {
  return (
    <section className="panel" aria-label="Loading…">
      <div style={{ display: "grid", gap: 10 }}>
        <SkeletonLine width="40%" height={12} />
        <SkeletonLine width="60%" height={20} />
      </div>
      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonBlock key={i} height={54} />
        ))}
      </div>
    </section>
  );
}
