import { SkeletonBlock } from './Skeleton.jsx'

/**
 * Universal leaderboard — renders simulation_outputs rows.
 * Works for any game type.
 *
 * @param {object} props
 * @param {import('@sports/shared/types').SimulationOutput[]} props.entries
 * @param {boolean} props.loading
 * @param {string} props.currentUserId  - highlights the current user's row
 * @param {function} [props.renderDetails] - optional slot to render game-specific detail columns
 */
export default function Leaderboard({ entries, loading, currentUserId, renderDetails }) {
  if (loading) {
    return (
      <div className="leaderboard leaderboard--loading" aria-label="Loading leaderboard…">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBlock key={i} height={48} style={{ marginBottom: 6 }} />
        ))}
      </div>
    )
  }

  if (!entries?.length) {
    return (
      <div className="leaderboard leaderboard--empty">
        <p>No standings yet.</p>
      </div>
    )
  }

  return (
    <div className="leaderboard" role="table" aria-label="Pool standings">
      <div className="leaderboard__header" role="row">
        <span>#</span>
        <span>Player</span>
        <span>Pts</span>
        <span>Max</span>
        <span>Win%</span>
        {renderDetails && <span>Details</span>}
      </div>
      {entries.map((entry, i) => {
        const isCurrentUser = entry.user_id === currentUserId
        return (
          <div
            key={entry.id}
            className={`leaderboard__row ${isCurrentUser ? 'leaderboard__row--me' : ''}`}
            role="row"
          >
            <span className="leaderboard__rank">{entry.rank ?? i + 1}</span>
            <span className="leaderboard__name">{entry.user_id}</span>
            <span className="leaderboard__pts">{entry.points_total ?? 0}</span>
            <span className="leaderboard__max">{entry.max_possible ?? '—'}</span>
            <span className="leaderboard__win">
              {entry.win_odds != null ? `${entry.win_odds.toFixed(1)}%` : '—'}
            </span>
            {renderDetails && (
              <span className="leaderboard__details">{renderDetails(entry)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
