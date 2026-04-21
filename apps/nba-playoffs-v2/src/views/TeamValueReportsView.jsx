import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";

function ReportCard({ report, sampleRows, to }) {
  const featuredRow = sampleRows[0];
  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{report.label}</span>
          <h2>{report.title}</h2>
        </div>
      </div>

      <p className="subtle nba-report-card-summary">{report.description}</p>

      {featuredRow ? (
        <div className="nba-dashboard-list">
          <div className="nba-dashboard-row nba-dashboard-row-stacked" key={featuredRow.id}>
            <div>
              <strong>{featuredRow.headline}</strong>
              <p>{featuredRow.body}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="nba-report-actions">
        <a className="secondary-button" href={to}>
          Open full report
        </a>
      </div>
    </article>
  );
}

function buildReportsHero(reportState) {
  if (reportState.phase === "pre_lock") {
    return {
      headline: "Use reports to narrow the board to the few teams still worth revisiting.",
      body: "Start with Best slot fits. Then use Strategic moves and Market vs. model to pressure-test the calls you are least sure about. The goal here is not to read everything. It is to find the two or three assignments worth one more pass before lock.",
      stats: [
        {
          label: "Start here",
          value: "Best slot fits",
        },
        {
          label: "Outside check",
          value: "Market vs. model",
        },
        {
          label: "Main question",
          value: "Board decisions",
        },
      ],
    };
  }

  return {
    headline: "Use reports to understand what is driving your board now that it is live.",
    body: "Start with Overweight / underweight and Biggest assets to see where your exposure sits. Then use Rooting guide and Market vs. model to understand what outcomes matter most and where the outside signals still disagree.",
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
          "strategic-moves",
          "model-gaps",
          "assets",
          "fragility",
        ]
      : [
          "overweight",
          "assets",
          "rooting",
          "slot-fits",
          "model-gaps",
        ];
  const visibleReports = reportOrder
    .filter((key) => reportState.visibleReportKeys.includes(key))
    .map((key) => reportState.reports[key])
    .slice(0, 4);
  const reportChoices = useMemo(() => visibleReports, [visibleReports]);
  const [selectedReportKey, setSelectedReportKey] = useState(reportChoices[0]?.key ?? "");

  useEffect(() => {
    if (!reportChoices.length) {
      setSelectedReportKey("");
      return;
    }

    if (!reportChoices.some((report) => report.key === selectedReportKey)) {
      setSelectedReportKey(reportChoices[0].key);
    }
  }, [reportChoices, selectedReportKey]);

  const selectedIndex = reportChoices.findIndex((report) => report.key === selectedReportKey);
  const activeReport = selectedIndex >= 0 ? reportChoices[selectedIndex] : reportChoices[0] ?? null;

  return (
    <div className="nba-shell">
      {activeReport ? (
        <section className="nba-report-browser">
          <section className="panel nba-reports-hero nba-report-browser-hero">
            <div className="nba-report-browser-copy">
              <span className="label">Reports</span>
              <h2>{heroState.headline}</h2>
              <p className="subtle">{heroState.body}</p>
              <div className="nba-report-browser-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedReportKey(reportChoices[Math.max(selectedIndex - 1, 0)].key)}
                  disabled={selectedIndex <= 0}
                >
                  Previous
                </button>
                <label className="nba-report-browser-select-wrap">
                  <span className="micro-label">Choose report</span>
                  <select
                    className="nba-report-browser-select"
                    value={activeReport.key}
                    onChange={(event) => setSelectedReportKey(event.target.value)}
                  >
                    {reportChoices.map((report) => (
                      <option key={report.key} value={report.key}>
                        {report.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedReportKey(reportChoices[Math.min(selectedIndex + 1, reportChoices.length - 1)].key)}
                  disabled={selectedIndex === reportChoices.length - 1}
                >
                  Next
                </button>
              </div>
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

          <section className="nba-dashboard-grid nba-reports-grid nba-reports-grid-single">
            <ReportCard
              key={activeReport.key}
              report={activeReport}
              sampleRows={activeReport.rows.slice(0, 1)}
              to={`/reports/${activeReport.key}`}
            />
            {reportState.phase === "post_lock" ? (
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <span className="label">Board Compare</span>
                    <h2>Compare any two live boards</h2>
                  </div>
                </div>
                <p className="subtle nba-report-card-summary">
                  Use the board matrix for the whole room, then jump into a two-board comparison when you want to see exactly where rankings split.
                </p>
                <div className="nba-report-actions">
                  <a className="secondary-button" href="/board-compare">
                    Open compare
                  </a>
                  <a className="secondary-button" href="/board-matrix">
                    Open matrix
                  </a>
                </div>
              </article>
            ) : null}
          </section>
        </section>
      ) : null}
    </div>
  );
}
