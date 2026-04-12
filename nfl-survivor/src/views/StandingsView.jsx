import { useSurvivorPool } from "../hooks/useSurvivorPool";

function statusLabel(row) {
  if (row.status === "eliminated") {
    return `Eliminated in Week ${row.eliminatedWeek ?? row.lastSafeWeek}`;
  }
  if (row.currentPick) {
    return `${row.currentPick} pending`;
  }
  return "Waiting on pick";
}

function statusTone(row) {
  if (row.status === "eliminated") return "eliminated";
  if (row.currentPick) return "pending";
  return "alive";
}

export default function StandingsView() {
  const { currentWeek, standings, summary, reports } = useSurvivorPool();
  const heroVoice = reports.voices.playByPlay;
  const activeRows = standings.filter((row) => row.status !== "eliminated");
  const eliminatedRows = standings.filter((row) => row.status === "eliminated");

  return (
    <div className="simple-shell survivor-shell">
      <section className="panel survivor-hero-panel">
        <div className="hero hero-simple">
          <div className="title-wrap">
            <span className="label">Standings · Week {currentWeek} · Play-by-play</span>
            <h1 className="survivor-display survivor-page-title">This is the part of the pool that breathes.</h1>
            <p className="subtle">{heroVoice.headline}</p>
            <p className="subtle">{heroVoice.body}</p>
          </div>
          <div className="detail-card survivor-summary-card">
            <span className="micro-label">Room snapshot</span>
            <strong>{summary.aliveCount} still alive</strong>
            <p>{summary.pendingCount} picks currently in play · {summary.eliminatedCount} already gone</p>
          </div>
        </div>
      </section>

      <section className="mode-grid survivor-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Still in it</span>
              <h2>Live entries</h2>
            </div>
          </div>
          <div className="survivor-standings-list">
            {activeRows.slice(0, 4).map((row) => (
              <div key={row.id} className={`survivor-standings-row survivor-status-${statusTone(row)}`}>
                <div>
                  <strong>{row.name}</strong>
                  <p className="subtle">{row.currentPick ? `Ticket live on ${row.currentPick}` : "Waiting to lock a pick"}</p>
                </div>
                <span className={`pill ${row.currentPick ? "active" : "neutral"}`}>{row.currentPick ? "live" : "open"}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Casualties</span>
              <h2>Already out</h2>
            </div>
          </div>
          <div className="survivor-standings-list">
            {eliminatedRows.length ? (
              eliminatedRows.map((row) => (
                <div key={row.id} className="survivor-standings-row survivor-status-eliminated">
                  <div>
                    <strong>{row.name}</strong>
                    <p className="subtle">Went down in Week {row.eliminatedWeek ?? row.lastSafeWeek}</p>
                  </div>
                  <span className="pill neutral">out</span>
                </div>
              ))
            ) : (
              <div className="detail-card">
                <strong>No one has been knocked out yet.</strong>
                <p>The first upset week is when this page starts to sting.</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Pool standings</span>
            <h2>Week {currentWeek} elimination board</h2>
          </div>
        </div>

        <div className="survivor-table">
          <div className="survivor-table-head">
            <span>Place</span>
            <span>Player</span>
            <span>Status</span>
            <span>Week {currentWeek} Pick</span>
            <span>Used Teams</span>
            <span>Last Safe Week</span>
          </div>
          {standings.map((row) => (
            <div key={row.id} className={`survivor-table-row survivor-table-${statusTone(row)}${row.isCurrentUser ? " current" : ""}`}>
              <span className="survivor-place">{row.place}</span>
              <span>
                <strong>{row.name}</strong>
                {row.isCurrentUser ? <em> You</em> : null}
              </span>
              <span>
                <span className={`pill ${row.status === "eliminated" ? "neutral" : "active"}`}>
                  {row.status === "eliminated" ? "out" : row.currentPick ? "live" : "open"}
                </span>
                <span className="survivor-table-status-copy">{statusLabel(row)}</span>
              </span>
              <span>{row.currentPick ?? "—"}</span>
              <span>{row.usedTeams.length}</span>
              <span>{row.lastSafeWeek || "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
