import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useSurvivorPool } from "../hooks/useSurvivorPool";

function formatUpdatedAt(value) {
  if (!value) return "No pick submitted yet";
  return `Saved ${new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export default function DashboardView() {
  const { pool } = usePool();
  const { currentWeek, currentEntry, standings, summary, pickSummary, reports } = useSurvivorPool();
  const isPreLock = reports.phase === "pre_lock";
  const heroVoice = reports.voices.playByPlay;
  const supportVoice = isPreLock ? reports.voices.coach : reports.voices.playByPlay;
  const flavorVoice = reports.voices.color;

  const topRows = standings.slice(0, 4);

  return (
    <div className="simple-shell survivor-shell">
      <section className="panel survivor-hero-panel">
        <div className="hero">
          <div className="title-wrap">
            <span className="label">Play-by-play · Week {currentWeek}</span>
            <h1 className="survivor-display">{heroVoice.headline}</h1>
            <p className="subtle">{heroVoice.body}</p>
            <p className="subtle">
              {isPreLock
                ? `Right now the week is all stakes and setup. ${pickSummary.urgency}`
                : pickSummary.urgency}
            </p>
            <div className="survivor-hero-actions">
              <Link className="primary-button" to="/picks">
                Open picks board
              </Link>
              <Link className="secondary-button" to="/standings">
                Open standings
              </Link>
            </div>
          </div>

          <div className="detail-card spotlight survivor-score-card">
            <span className="micro-label">Current pool</span>
            <strong>{pool?.name ?? "No active pool"}</strong>
            <p>{formatUpdatedAt(currentEntry.updatedAt)}</p>
            <div className="survivor-stat-grid">
              <div className="detail-card survivor-mini-card">
                <span className="micro-label">Status</span>
                <strong>{currentEntry.status === "pending" ? "Pick in" : "Still open"}</strong>
              </div>
              <div className="detail-card survivor-mini-card">
                <span className="micro-label">Used teams</span>
                <strong>{currentEntry.usedTeams.length}</strong>
              </div>
              <div className="detail-card survivor-mini-card">
                <span className="micro-label">Alive in pool</span>
                <strong>{summary.aliveCount}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mode-grid survivor-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Reports preview</span>
              <h2>Best weekly angle</h2>
            </div>
            <Link className="secondary-button" to="/reports">
              Open reports
            </Link>
          </div>
          {reports.bestPicks[0] ? (
            <div className="detail-card spotlight">
              <strong>
                {reports.bestPicks[0].code} look like the cleanest Week {currentWeek} spend on the board.
              </strong>
              <p>
                Market {reports.bestPicks[0].marketWinPct}% · Model {reports.bestPicks[0].modelWinPct}% · Public pick rate{" "}
                {reports.bestPicks[0].publicPickPct}% · Future cost {reports.bestPicks[0].futurePenalty}
              </p>
            </div>
          ) : (
            <div className="detail-card">
              <strong>You have already burned through the obvious comfort picks.</strong>
              <p>That is a very Survivor problem, and usually a sign the board is starting to get interesting.</p>
            </div>
          )}
          <div className="detail-card inset-card">
            <span className="micro-label">{supportVoice.voice === "coach" ? "Coach voice" : "Play-by-play voice"}</span>
            <strong>{supportVoice.headline}</strong>
            <p>{supportVoice.body}</p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Standings snapshot</span>
              <h2>Who still has a pulse</h2>
            </div>
          </div>
          <div className="survivor-standings-list">
            {topRows.map((row) => (
              <div key={row.id} className="survivor-standings-row">
                <div>
                  <strong>{row.place}. {row.name}</strong>
                  <p className="subtle">
                    {row.status === "eliminated"
                      ? `Out in Week ${row.eliminatedWeek ?? row.lastSafeWeek}`
                      : row.currentPick
                        ? `On ${row.currentPick} this week`
                        : "Pick still open"}
                  </p>
                </div>
                <span className={`pill ${row.status === "eliminated" ? "neutral" : "active"}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Color booth</span>
              <h2>Flavor and forecast</h2>
            </div>
          </div>
          <div className="survivor-note-stack">
            <div className="detail-card">
              <strong>{flavorVoice.headline}</strong>
              <p>{flavorVoice.body}</p>
            </div>
            <div className="detail-card">
              <strong>Probability inputs</strong>
              <p>Weekly game win odds and public pick rates give the board its backbone. Without them, Survivor is just vibes.</p>
            </div>
            <div className="detail-card">
              <strong>Commentary outputs</strong>
              <p>Coach for decision help, play-by-play for the moment, color for the jab. That mix is where this starts sounding like us.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
