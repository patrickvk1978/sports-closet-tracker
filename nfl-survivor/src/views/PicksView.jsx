import { useSurvivorPool } from "../hooks/useSurvivorPool";

function formatKickoff(value) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PicksView() {
  const {
    board,
    currentWeek,
    currentEntry,
    reports,
    saveState,
    setWeeklyPick,
    clearWeeklyPick,
  } = useSurvivorPool();

  const coachVoice = reports.voices.coach;

  return (
    <div className="simple-shell survivor-shell">
      <section className="panel">
        <div className="hero hero-simple">
          <div className="title-wrap">
            <span className="label">Coach voice · Week {currentWeek} picks</span>
            <h1 className="survivor-display survivor-page-title">Stay alive with one team.</h1>
            <p className="subtle">{coachVoice.headline}</p>
            <p className="subtle">{coachVoice.body}</p>
          </div>
          <div className="detail-card survivor-summary-card">
            <span className="micro-label">Your card</span>
            <strong>{currentEntry.currentPick ?? "No team selected"}</strong>
            <p>{saveState === "saved" ? "Autosaved locally" : "Ready"}</p>
            <div className="survivor-chip-row">
              {currentEntry.usedTeams.map((team) => (
                <span key={team} className="chip">
                  {team}
                </span>
              ))}
            </div>
            {currentEntry.currentPick ? (
              <button className="secondary-button full" onClick={clearWeeklyPick}>
                Clear Week {currentWeek} pick
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="survivor-board-grid">
        {board.map((game) => (
          <article key={game.id} className="panel survivor-game-card">
            <div className="panel-header">
              <div>
                <span className="label">{game.networkWindow}</span>
                <h2>{formatKickoff(game.kickoff)}</h2>
              </div>
              <span className="chip">Market favorite: {game.favorite}</span>
            </div>

            <div className="survivor-team-stack">
              {game.teams.map((team) => {
                const disabled = team.isUsed || game.isLocked;
                return (
                  <button
                    key={team.code}
                    className={`survivor-team-option${team.isSelected ? " selected" : ""}${disabled ? " disabled" : ""}`}
                    disabled={disabled}
                    onClick={() => setWeeklyPick(game.id, team.code)}
                  >
                    <div>
                      <span className="micro-label">{team.code}</span>
                      <strong>{team.name}</strong>
                      <p className="subtle">
                        Market {team.marketWinPct}% · Model {team.modelWinPct}% · Public {team.publicPickPct}%
                      </p>
                    </div>
                    <div className="survivor-option-state">
                      {team.isSelected ? (
                        <span className="status-badge">Your pick</span>
                      ) : team.isUsed ? (
                        <span className="pill neutral">Already used</span>
                      ) : (
                        <span className="pill-meta">Available</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
