import { Link } from "react-router-dom";
import { useSurvivorPool } from "../hooks/useSurvivorPool";

function sample(items, count = 2) {
  return items.slice(0, count);
}

export default function ReportsView() {
  const { currentWeek, reports } = useSurvivorPool();
  const isPreLock = reports.phase === "pre_lock";
  const coachVoice = reports.voices.coach;
  const playByPlayVoice = reports.voices.playByPlay;
  const colorVoice = reports.voices.color;

  return (
    <div className="simple-shell survivor-shell">
      <section className="panel survivor-hero-panel">
        <div className="title-wrap">
          <span className="label">Reports · Week {currentWeek}</span>
          <h1 className="survivor-display survivor-page-title">Find the pick that keeps you alive without selling next week short.</h1>
          <p className="subtle">{reports.overview.headline}</p>
          <p className="subtle">{reports.overview.detail}</p>
          <div className="detail-card inset-card">
            <span className="micro-label">Coach voice</span>
            <strong>{coachVoice.headline}</strong>
            <p>{coachVoice.body}</p>
          </div>
        </div>
      </section>

      <section className="mode-grid survivor-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Best picks this week</span>
              <h2>Best weekly spends</h2>
            </div>
            <Link className="secondary-button" to="/reports/best-picks">
              Open full report
            </Link>
          </div>
          <div className="survivor-standings-list">
            {sample(reports.bestPicks).map((team) => (
              <div key={team.code} className="survivor-standings-row survivor-report-row">
                <div>
                  <strong>{team.code} · EV {team.evScore}</strong>
                  <p className="subtle">
                    Market {team.marketWinPct}% · Model {team.modelWinPct}% · Public pick rate {team.publicPickPct}% · Future cost {team.futurePenalty}
                  </p>
                </div>
                <span className="pill-meta">{team.networkWindow}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Rooting guide</span>
              <h2>{isPreLock ? "Protect or spend?" : "Who helps you if they lose"}</h2>
            </div>
            <Link className="secondary-button" to="/reports/rooting">
              Open full report
            </Link>
          </div>
          <div className="survivor-standings-list">
            {sample(reports.rootingGuide).map((item) =>
              isPreLock ? (
                <div key={item.team} className="detail-card">
                  <strong>{item.headline}</strong>
                  <p>{item.detail}</p>
                </div>
              ) : (
                <div key={`${item.opponent}-${item.opponentPick}`} className="detail-card">
                  <strong>Fade {item.opponentPick} against {item.opponent}.</strong>
                  <p>{item.fadeReason}</p>
                </div>
              )
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">{isPreLock ? "Future value" : "Pool exposure"}</span>
              <h2>{isPreLock ? "What the room can still reach later" : "Where the room is clustering"}</h2>
            </div>
            <Link className="secondary-button" to="/reports/future">
              Open full report
            </Link>
          </div>
          <div className="survivor-standings-list">
            {sample(isPreLock ? reports.bestPicks : reports.poolExposure).map((item) => (
              <div key={item.code} className="detail-card">
                <strong>{item.code}</strong>
                <p>
                  {isPreLock
                    ? `Still available to ${item.availabilityPct}% of active opponents later · Future cost ${item.futurePenalty}`
                    : `Chosen by ${item.exposurePct}% of active opponents · Still available to ${item.availablePct}% of them later`}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Commentary booth</span>
              <h2>How the week sounds</h2>
            </div>
            <Link className="secondary-button" to="/reports/booth">
              Open full report
            </Link>
          </div>
          <div className="survivor-note-stack">
            <div className="detail-card">
              <strong>Play-by-play voice</strong>
              <p>{playByPlayVoice.headline}</p>
            </div>
            <div className="detail-card">
              <strong>Color voice</strong>
              <p>{colorVoice.headline}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
