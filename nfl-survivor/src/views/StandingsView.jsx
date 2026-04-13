import { Link } from "react-router-dom";
import { useSurvivorPool } from "../hooks/useSurvivorPool";

function uniqueTeams(board) {
  const seen = new Map();
  board.forEach((game) => {
    game.teams.forEach((team) => {
      if (!seen.has(team.code)) {
        seen.set(team.code, team);
      }
    });
  });
  return [...seen.values()];
}

function computeFutureMetrics(row, allTeams, poolSize, isPreLock) {
  const spent = new Set(row.usedTeams);
  if (row.currentPick) spent.add(row.currentPick);

  const remaining = allTeams
    .filter((team) => !spent.has(team.code))
    .sort((a, b) => b.marketWinPct - a.marketWinPct);

  const topWindow = remaining.slice(0, 5);
  const futureValue = topWindow.length
    ? Math.round(topWindow.reduce((sum, team) => sum + team.marketWinPct, 0) / topWindow.length)
    : 0;
  const bestTeamLeft = remaining[0]?.code ?? "—";
  const placeStrength = poolSize > 1 ? ((poolSize - row.place) / (poolSize - 1)) * 100 : 100;
  const currentWeekBoost =
    !isPreLock && row.currentWinPct
      ? row.currentWinPct * 0.22
      : row.isCurrentUser && row.currentWinPct
        ? row.currentWinPct * 0.12
        : 0;

  const winProbability = row.status === "eliminated"
    ? 0
    : Math.round(futureValue * 0.58 + placeStrength * 0.32 + currentWeekBoost);

  return {
    futureValue,
    bestTeamLeft,
    winProbability,
  };
}

function thisWeekLabel(row, isPreLock) {
  if (row.status === "eliminated") return "Out";
  if (isPreLock && !row.isCurrentUser) return "Hidden until lock";
  if (!row.currentPick) return "Open";
  return `${row.currentPick} · ${row.currentWinPct ?? "—"}%`;
}

export default function StandingsView() {
  const { currentWeek, standings, summary, reports, board } = useSurvivorPool();
  const isPreLock = reports.phase === "pre_lock";
  const heroVoice = reports.voices.playByPlay;
  const currentRow = standings.find((row) => row.isCurrentUser) ?? null;
  const allTeams = uniqueTeams(board);

  const enrichedStandings = standings.map((row) => ({
    ...row,
    ...computeFutureMetrics(row, allTeams, standings.length, isPreLock),
  }));

  const topFutureRows = [...enrichedStandings]
    .filter((row) => row.status !== "eliminated")
    .sort((a, b) => b.futureValue - a.futureValue)
    .slice(0, 2);

  const topEquityRows = [...enrichedStandings]
    .filter((row) => row.status !== "eliminated")
    .sort((a, b) => b.winProbability - a.winProbability)
    .slice(0, 2);

  return (
    <div className="simple-shell survivor-shell">
      <section className="panel survivor-hero-panel">
        <div className="hero hero-simple">
          <div className="title-wrap">
            <span className="label">Standings · Week {currentWeek}</span>
            <h1 className="survivor-display survivor-page-title">The room right now.</h1>
            <p className="subtle">{heroVoice.body}</p>
          </div>
          <div className="detail-card survivor-summary-card">
            <span className="micro-label">Your position</span>
            <strong>{currentRow ? `${currentRow.place}. ${currentRow.name}` : "No active position"}</strong>
            <p>
              {currentRow
                ? `${thisWeekLabel(currentRow, false)} · Future value ${currentRow.futureValue} · Win probability ${currentRow.winProbability}%`
                : "Join a pool to start tracking your path."}
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header compact-panel-header">
          <div>
            <span className="label">Standings board</span>
            <h2>Week {currentWeek} table</h2>
          </div>
        </div>

        <div className="survivor-table">
          <div className="survivor-table-head survivor-table-head-wide">
            <span>Place</span>
            <span>Player</span>
            <span>Status</span>
            <span>This Week</span>
            <span>Future Value</span>
            <span>Best Team Left</span>
            <span>Win Probability</span>
          </div>
          {enrichedStandings.map((row) => (
            <div key={row.id} className={`survivor-table-row survivor-table-${row.status}${row.isCurrentUser ? " current" : ""}`}>
              <span className="survivor-place">{row.place}</span>
              <span>
                <strong>{row.name}</strong>
                {row.isCurrentUser ? <em> You</em> : null}
              </span>
              <span>
                <span className={`pill ${row.status === "eliminated" ? "neutral" : "active"}`}>
                  {row.status === "eliminated" ? "out" : row.currentPick ? "live" : "open"}
                </span>
              </span>
              <span>{thisWeekLabel(row, isPreLock)}</span>
              <span>{row.futureValue || "—"}</span>
              <span>{row.bestTeamLeft}</span>
              <span>{row.winProbability ? `${row.winProbability}%` : "—"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mode-grid survivor-dashboard-grid">
        <article className="panel">
          <div className="panel-header compact-panel-header">
            <div>
              <span className="label">Future board</span>
              <h2>Best inventory</h2>
            </div>
            <Link className="secondary-button" to="/reports/future">
              Open details
            </Link>
          </div>
          <div className="survivor-note-stack">
            {topFutureRows.map((row) => (
              <div key={row.id} className="detail-card">
                <strong>{row.name}</strong>
                <p>Future value {row.futureValue} · Best team left {row.bestTeamLeft}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header compact-panel-header">
            <div>
              <span className="label">Win outlook</span>
              <h2>Best chances from here</h2>
            </div>
            <Link className="secondary-button" to="/reports/booth">
              Open details
            </Link>
          </div>
          <div className="survivor-note-stack">
            {topEquityRows.map((row) => (
              <div key={row.id} className="detail-card">
                <strong>{row.name}</strong>
                <p>Win probability {row.winProbability}% · {row.status === "eliminated" ? "Season over" : "Still alive"}</p>
              </div>
            ))}
            <div className="detail-card">
              <strong>Room snapshot</strong>
              <p>{summary.aliveCount} alive · {summary.pendingCount} live picks · {summary.eliminatedCount} eliminated</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
