import { Link, useParams } from "react-router-dom";
import { useSurvivorPool } from "../hooks/useSurvivorPool";

const REPORT_CONFIG = {
  "best-picks": {
    label: "Best picks this week",
    title: "Best weekly spends",
  },
  rooting: {
    label: "Rooting guide",
    title: "Protect or spend?",
  },
  future: {
    label: "Future value",
    title: "What the room can still reach later",
  },
  booth: {
    label: "Commentary booth",
    title: "How the week sounds",
  },
};

export default function ReportDetailView() {
  const { reportKey } = useParams();
  const { currentWeek, reports } = useSurvivorPool();
  const isPreLock = reports.phase === "pre_lock";
  const config = REPORT_CONFIG[reportKey];

  if (!config) {
    return (
      <div className="simple-shell survivor-shell">
        <div className="report-back-shell">
          <Link className="back-link" to="/reports">← Back to Reports</Link>
        </div>
        <section className="panel">
          <h2>Report not found</h2>
        </section>
      </div>
    );
  }

  function renderBody() {
    if (reportKey === "best-picks") {
      return (
        <div className="survivor-note-stack">
          {reports.bestPicks.map((team) => (
            <div key={team.code} className="detail-card">
              <strong>{team.code} · EV {team.evScore}</strong>
              <p>
                Market {team.marketWinPct}% · Model {team.modelWinPct}% · Public pick rate {team.publicPickPct}% · Future cost {team.futurePenalty}
              </p>
              <p className="subtle">
                Still available to {team.availabilityPct}% of active opponents later.
              </p>
            </div>
          ))}
        </div>
      );
    }

    if (reportKey === "rooting") {
      return (
        <div className="survivor-note-stack">
          {reports.rootingGuide.map((item) =>
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
      );
    }

    if (reportKey === "future") {
      return (
        <div className="survivor-note-stack">
          {(isPreLock ? reports.bestPicks : reports.poolExposure).map((item) => (
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
      );
    }

    return (
      <div className="survivor-note-stack">
        <div className="detail-card">
          <strong>Coach voice</strong>
          <p>{reports.voices.coach.headline}</p>
          <p className="subtle">{reports.voices.coach.body}</p>
        </div>
        <div className="detail-card">
          <strong>Play-by-play voice</strong>
          <p>{reports.voices.playByPlay.headline}</p>
          <p className="subtle">{reports.voices.playByPlay.body}</p>
        </div>
        <div className="detail-card">
          <strong>Color voice</strong>
          <p>{reports.voices.color.headline}</p>
          <p className="subtle">{reports.voices.color.body}</p>
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
    );
  }

  return (
    <div className="simple-shell survivor-shell">
      <div className="report-back-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
      </div>

      <section className="panel survivor-hero-panel">
        <div className="title-wrap">
          <span className="label">{config.label} · Week {currentWeek}</span>
          <h1 className="survivor-display survivor-page-title">{config.title}</h1>
          <p className="subtle">{reports.overview.headline}</p>
        </div>
      </section>

      <section className="panel">
        {renderBody()}
      </section>
    </div>
  );
}
