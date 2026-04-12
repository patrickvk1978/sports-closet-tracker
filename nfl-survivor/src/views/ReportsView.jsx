import { Link } from "react-router-dom";
import { useSurvivorPool } from "../hooks/useSurvivorPool";

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
            <Link className="secondary-button" to="/picks">
              Go to picks
            </Link>
          </div>
          <div className="survivor-standings-list">
            {reports.bestPicks.slice(0, 4).map((team) => (
              <div key={team.code} className="survivor-standings-row">
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
          </div>
          <div className="survivor-standings-list">
            {reports.rootingGuide.length ? (
              reports.rootingGuide.map((item) =>
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
              )
            ) : (
              <div className="detail-card">
                <strong>No clean sweat target yet.</strong>
                <p>Once more of the room commits to a side, this becomes the sharpest “who do I need to lose?” module in the product.</p>
              </div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">{isPreLock ? "Future value" : "Pool exposure"}</span>
              <h2>{isPreLock ? "What the room can still reach later" : "Where the room is clustering"}</h2>
            </div>
          </div>
          <div className="survivor-standings-list">
            {isPreLock
              ? reports.bestPicks.slice(0, 4).map((team) => (
                  <div key={team.code} className="survivor-standings-row">
                    <div>
                      <strong>{team.code}</strong>
                      <p className="subtle">
                        Still available to {team.availabilityPct}% of active opponents later · Future cost {team.futurePenalty}
                      </p>
                    </div>
                  </div>
                ))
              : reports.poolExposure.map((item) => (
                  <div key={item.code} className="survivor-standings-row">
                    <div>
                      <strong>{item.code}</strong>
                      <p className="subtle">
                        Chosen by {item.exposurePct}% of active opponents · Still available to {item.availablePct}% of them later
                      </p>
                    </div>
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
          </div>
          <div className="survivor-note-stack">
            <div className="detail-card">
              <strong>Play-by-play voice</strong>
              <p>{playByPlayVoice.headline}</p>
              <p className="subtle">{playByPlayVoice.body}</p>
            </div>
            <div className="detail-card">
              <strong>Color voice</strong>
              <p>{colorVoice.headline}</p>
              <p className="subtle">{colorVoice.body}</p>
            </div>
            <div className="detail-card">
              <strong>Survive-this-week odds</strong>
              <p>
                {reports.strategy.surviveThisWeekOdds
                  ? isPreLock
                    ? `Your current card survives about ${reports.strategy.surviveThisWeekOdds}% of the time. Room averages stay hidden until picks lock.`
                    : `Your current card survives about ${reports.strategy.surviveThisWeekOdds}% of the time, while the room average pending ticket sits around ${reports.strategy.roomAverageWinPct ?? "—"}%.`
                  : "Make a pick to see your weekly survival baseline."}
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
