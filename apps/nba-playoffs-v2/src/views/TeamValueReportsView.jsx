import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";
import { SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";

function ReportCard({ report, sampleRows, to }) {
  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{report.label}</span>
          <h2>{report.title}</h2>
        </div>
      </div>

      <p className="subtle">{report.description}</p>

      <div className="nba-dashboard-list">
        {sampleRows.map((row) => (
          <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
            <div>
              <strong>{row.headline}</strong>
              <p>{row.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="nba-report-actions">
        <a className="secondary-button" href={to}>
          Open full report
        </a>
      </div>
    </article>
  );
}

function buildReportsHero(reportState) {
  const slotFit = reportState.reports["slot-fits"]?.rows?.[0];
  const strategicMove = reportState.reports["strategic-moves"]?.rows?.[0];
  const modelGap = reportState.reports["model-gaps"]?.rows?.[0];
  const topScenario = SCENARIO_WATCH_ITEMS[0];
  const secondScenario = SCENARIO_WATCH_ITEMS[1];

  if (reportState.phase === "pre_lock") {
    return {
      headline: "This is the decision desk for the board you are about to lock.",
      body: modelGap
        ? `${topScenario?.likelyImpact ?? "The board tightened last night, but it did not finish itself."} ${modelGap.teamLabel} is one of the clearest outside-signal disagreements on your board, while ${slotFit?.teamLabel ?? "your top slot-fit issue"} is still one of the cleanest placement questions. The real pre-lock job is not reading everything. It is finding the two or three teams worth revisiting.`
        : `${secondScenario?.likelyImpact ?? "The useful pre-lock question is not “what do the reports say?” so much as “which few teams are worth one more hard look?”"} Start with slot fit, strategic moves, and any major outside-signal disagreement.`,
      stats: [
        {
          label: "First report",
          value: "Best slot fits",
        },
        {
          label: "High-signal check",
          value: "Market vs. model",
        },
        {
          label: "Decision lens",
          value: strategicMove?.moveType ?? "Strategic moves",
        },
      ],
    };
  }

  return {
    headline: reportState.summary.headline,
    body: reportState.summary.body,
    stats: reportState.summary.stats,
  };
}

export default function TeamValueReportsView() {
  const { profile } = useAuth();
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const playoffTeams = getRoundOneTeamsFromData(seriesByRound, teamsById);
  const { allAssignmentsByUser } = useTeamValueBoard(playoffTeams);
  const reportState = buildTeamValueReports({
    profileId: profile?.id,
    memberList,
    allAssignmentsByUser,
    seriesByRound,
    teamsById,
    series,
  });
  const heroState = buildReportsHero(reportState);
  const reportOrder =
    reportState.phase === "pre_lock"
      ? [
          "slot-fits",
          "model-gaps",
          "strategic-moves",
          "assets",
          "rooting",
          "fragility",
          "overweight",
        ]
      : [
          "overweight",
          "assets",
          "rooting",
          "slot-fits",
          "strategic-moves",
          "model-gaps",
          "fragility",
        ];
  const visibleReports = reportOrder
    .filter((key) => reportState.visibleReportKeys.includes(key))
    .map((key) => reportState.reports[key]);

  return (
    <div className="nba-shell">
      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Reports</span>
          <h2>{heroState.headline}</h2>
          <p className="subtle">{heroState.body}</p>
        </div>
        <div className="nba-stat-grid">
          {heroState.stats.map((stat) => (
            <div className="nba-stat-card" key={stat.label}>
              <span className="micro-label">{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="detail-card inset-card">
          <span className="micro-label">Report mode</span>
          <p>
            {reportState.phase === "pre_lock"
              ? "This is the pre-lock report set. It is built to help you place the slots well without leaking anything about the rest of the pool."
              : "This is the post-lock report set. Now the reports can compare your live portfolio to the room and show true pool-specific leverage."}
          </p>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        {visibleReports.map((report) => {
          return (
            <ReportCard
              key={report.key}
              report={report}
              sampleRows={report.rows.slice(0, 2)}
              to={`/reports/${report.key}`}
            />
          );
        })}
      </section>
    </div>
  );
}
