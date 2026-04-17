import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";

function buildVoiceFrame(reportKey) {
  if (reportKey === "slot-fits") {
    return {
      lane: "Coach lane",
      persona: "Pricing review",
      cue: "Tighten the pricing and trim the loose slots.",
    };
  }

  if (reportKey === "strategic-moves") {
    return {
      lane: "Coach lane",
      persona: "Decision review",
      cue: "Sort the swings worth taking from the ones that only feel brave.",
    };
  }

  if (reportKey === "model-gaps") {
    return {
      lane: "Coach lane",
      persona: "Outside-signal check",
      cue: "Use the outside-signal split to decide what deserves a second look.",
    };
  }

  if (reportKey === "assets") {
    return {
      lane: "Play-by-play lane",
      persona: "Live asset check",
      cue: "Call out the teams carrying the real weight on your board.",
    };
  }

  if (reportKey === "rooting") {
    return {
      lane: "Play-by-play lane",
      persona: "Game-watch guide",
      cue: "Separate the protective roots from the real swing results.",
    };
  }

  if (reportKey === "fragility") {
    return {
      lane: "Color lane",
      persona: "Risk check",
      cue: "Find the places where your board looks stable until someone actually throws it a punch.",
    };
  }

  if (reportKey === "overweight") {
    return {
      lane: "Color lane",
      persona: "Room comparison",
      cue: "See where your board is carrying more exposure than the rest of the pool.",
    };
  }

  return {
    lane: "Coach lane",
    persona: "Decision desk",
    cue: "Use this page to sharpen the board before lock.",
  };
}

function buildMetricPairs(reportKey, row) {
  if (reportKey === "slot-fits") {
    return [
      { label: "Your value", value: row.yourValue || "Unassigned" },
      { label: "Fair slot", value: row.fairValue },
      { label: "Difference", value: `${row.slotDelta > 0 ? "+" : ""}${row.slotDelta}` },
      { label: "Expected pts", value: row.expectedPoints },
      { label: "Pool EV", value: row.poolEv },
    ];
  }

  if (reportKey === "overweight") {
    return [
      { label: "Your value", value: row.yourValue },
      { label: "Room avg", value: row.avgValue },
      { label: "Leverage", value: `${row.leverage > 0 ? "+" : ""}${row.leverage}` },
      { label: "Pool EV", value: row.poolEv },
    ];
  }

  if (reportKey === "assets") {
    return [
      { label: "Your value", value: row.yourValue },
      { label: "Expected pts", value: row.expectedPoints },
      { label: "Pool EV", value: row.poolEv },
    ];
  }

  if (reportKey === "rooting") {
    return [
      { label: "Preferred team", value: row.preferredTeam },
      { label: "Value on side", value: row.yourValue },
      { label: "Board gap", value: row.gap },
    ];
  }

  if (reportKey === "fragility") {
    return [
      { label: "Your value", value: row.yourValue },
      { label: "R1 market", value: `${row.marketLean}%` },
      { label: "Title odds", value: `${row.titleOddsPct}%` },
      { label: "Fragility", value: row.fragility },
    ];
  }

  if (reportKey === "strategic-moves") {
    return [
      { label: "Your value", value: row.yourValue },
      { label: "Fair slot", value: row.fairValue },
      { label: "Risk score", value: row.riskScore },
      { label: "Upside score", value: row.upsideScore },
      { label: "Pool EV", value: row.poolEv },
    ];
  }

  if (reportKey === "model-gaps") {
    return [
      { label: "Market", value: `${row.marketLean}%` },
      { label: "Model", value: `${row.modelLean}%` },
      { label: "Gap", value: row.gap },
      { label: "Pool EV", value: row.poolEv },
    ];
  }

  return [];
}

function ReportMetricsTable({ metrics, ariaLabel = "Report metrics" }) {
  if (!metrics.length) {
    return null;
  }

  const columnTemplate = `repeat(${metrics.length}, minmax(0, 1fr))`;

  return (
    <div className="nba-report-metric-wrap">
      <div className="nba-report-metric-table" role="table" aria-label={ariaLabel}>
        <div className="nba-report-metric-row nba-report-metric-row-head" role="row" style={{ gridTemplateColumns: columnTemplate }}>
          {metrics.map((metric) => (
            <span className="nba-report-metric-cell" role="columnheader" key={metric.label}>
              {metric.label}
            </span>
          ))}
        </div>
        <div className="nba-report-metric-row" role="row" style={{ gridTemplateColumns: columnTemplate }}>
          {metrics.map((metric) => (
            <strong className="nba-report-metric-cell nba-report-metric-value" role="cell" key={metric.label}>
              {metric.value}
            </strong>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionIntro({ label, title, description }) {
  return (
    <div className="detail-card inset-card nba-report-column-intro">
      <div className="nba-report-column-kicker">
        <span className="label">{label}</span>
      </div>
      <div className="nba-report-column-title-row">
        <h3>{title}</h3>
        <span className="tooltip-wrap tooltip-wrap-inline">
          <button className="help-dot" type="button" aria-label={`More about ${title}`}>
            ?
          </button>
          <span className="tooltip-bubble">{description}</span>
        </span>
      </div>
    </div>
  );
}

function ReportSectionBrowser({ sections, reportLabel, reportTitle, reportBody, reportCue, summaryStats }) {
  const [selectedKey, setSelectedKey] = useState(sections[0]?.key ?? "");

  useEffect(() => {
    if (!sections.length) {
      setSelectedKey("");
      return;
    }

    if (!sections.some((section) => section.key === selectedKey)) {
      setSelectedKey(sections[0].key);
    }
  }, [sections, selectedKey]);

  if (!sections.length) {
    return null;
  }

  const selectedIndex = sections.findIndex((section) => section.key === selectedKey);
  const activeSection = selectedIndex >= 0 ? sections[selectedIndex] : sections[0];

  return (
    <div className="nba-report-browser nba-report-browser-detail">
      <section className="panel nba-reports-hero nba-report-browser-hero">
        <div className="nba-report-browser-copy">
          <span className="label">{reportLabel}</span>
          <h2>{reportTitle}</h2>
          <p className="subtle">{reportBody}</p>
          {reportCue ? <p className="subtle">{reportCue}</p> : null}
          <div className="nba-report-browser-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedKey(sections[Math.max(selectedIndex - 1, 0)].key)}
              disabled={selectedIndex <= 0}
            >
              Previous
            </button>
            <label className="nba-report-browser-select-wrap">
              <span className="micro-label">Choose section</span>
              <select
                className="nba-report-browser-select"
                value={activeSection.key}
                onChange={(event) => setSelectedKey(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.key} value={section.key}>
                    {section.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setSelectedKey(sections[Math.min(selectedIndex + 1, sections.length - 1)].key)}
              disabled={selectedIndex === sections.length - 1}
            >
              Next
            </button>
          </div>
        </div>
        <div className="nba-stat-grid">
          {summaryStats.map((stat) => (
            <div className="nba-stat-card" key={stat.label}>
              <span className="micro-label">{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {activeSection.content}
    </div>
  );
}

function buildStrategicSummaryStats(rows) {
  const upsideBuys = rows.filter((row) => row.moveType === "Upside buy").length;
  const richSlots = rows.filter((row) => row.moveType === "Rich slot").length;
  const riskyUpside = rows.filter((row) => row.moveType === "Risk with upside").length;

  return [
    { label: "Upside buys", value: upsideBuys },
    { label: "Rich slots", value: richSlots },
    { label: "Risk with upside", value: riskyUpside },
  ];
}

function buildSlotFitSummary(rows) {
  const biggestRisks = rows.filter((row) => row.fitType === "over");
  const underSlotted = rows.filter((row) => row.fitType === "under");
  const topRisk = biggestRisks
    .slice()
    .sort((a, b) => b.slotDelta - a.slotDelta || b.poolEv - a.poolEv)[0];
  const topUpside = underSlotted
    .slice()
    .sort((a, b) => a.slotDelta - b.slotDelta || b.poolEv - a.poolEv)[0];

  return {
    body: topRisk || topUpside
      ? `${topRisk?.teamLabel ?? "Your priciest slot"} is still one of the clearest places where the board may be paying too much, while ${topUpside?.teamLabel ?? "your cheapest upside team"} is the best example of a team that may deserve a little more respect. This page is about getting the pricing right before lock, not chasing every last decimal.`
      : "This page is about pricing discipline before lock: where you may be overpaying, where the board still sees cheap upside, and which teams are probably fine where they are.",
    stats: [
      { label: "Biggest risks", value: biggestRisks.length },
      { label: "Under-slotted", value: underSlotted.length },
      { label: "Top gap", value: rows[0]?.gap ?? 0 },
    ],
  };
}

function buildModelGapSummary(rows) {
  const modelHigher = rows.filter((row) => row.modelLean > row.marketLean);
  const marketHigher = rows.filter((row) => row.marketLean > row.modelLean);
  const topGap = rows[0];

  return {
    body: topGap
      ? `${topGap.teamLabel} is the clearest disagreement on the page right now. This report is less about “who is right?” and more about where outside signals are split enough to justify another board check before lock.`
      : "This page is about outside-signal disagreement: where the market and model are telling meaningfully different stories about the same team.",
    stats: [
      { label: "Model stronger", value: modelHigher.length },
      { label: "Market stronger", value: marketHigher.length },
      { label: "Top gap", value: topGap?.gap ?? 0 },
    ],
  };
}

function SlotFitColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats }) {
  const biggestRisks = rows
    .filter((row) => row.fitType === "over")
    .sort((a, b) => b.slotDelta - a.slotDelta || b.poolEv - a.poolEv);
  const underSlotted = rows
    .filter((row) => row.fitType === "under")
    .sort((a, b) => a.slotDelta - b.slotDelta || b.poolEv - a.poolEv);

  const renderRows = (items, emptyText) => {
    if (!items.length) {
      return (
        <article className="detail-card inset-card">
          <p className="subtle">{emptyText}</p>
        </article>
      );
    }

    return items.map((row) => (
      <article className="detail-card inset-card" key={row.id}>
        <div className="panel-header">
          <div>
            <span className="micro-label">{row.teamLabel}</span>
            <h3>{row.headline}</h3>
          </div>
        </div>
        <p>{row.body}</p>
        <ReportMetricsTable metrics={buildMetricPairs("slot-fits", row)} ariaLabel="Best slot fit metrics" />
      </article>
    ));
  };

  const sections = [
    {
      key: "biggest-risks",
      label: "Biggest risks",
      content: (
        <section className="nba-report-split-column nba-report-group-table">
          <SectionIntro
            label="Biggest risks"
            title="Where are you paying the richest prices?"
            description="These are the teams your board is asking the most to justify. They may still work, but the slot cost is doing some of the heavy lifting."
          />
          <div className="nba-dashboard-list nba-report-group-body">
            {renderRows(biggestRisks, "No obvious over-slotted teams right now.")}
          </div>
        </section>
      ),
    },
    {
      key: "under-slotted",
      label: "Potentially under-slotted",
      content: (
        <section className="nba-report-split-column nba-report-group-table">
          <SectionIntro
            label="Potentially under-slotted"
            title="Where might you still be buying upside cheaply?"
            description="These are the teams the board thinks deserve more respect than their current slot. They are the cleanest candidates to move up without forcing a total rebuild."
          />
          <div className="nba-dashboard-list nba-report-group-body">
            {renderRows(underSlotted, "No obvious cheap-upside teams right now.")}
          </div>
        </section>
      ),
    },
  ];

  return (
    <ReportSectionBrowser
      sections={sections}
      reportLabel={reportLabel}
      reportTitle={reportTitle}
      reportBody={reportBody}
      reportCue={reportCue}
      summaryStats={summaryStats}
    />
  );
}

function StrategicMoveColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats }) {
  const groups = [
    {
      key: "Upside buy",
      label: "Upside buys",
      title: "Where are you still buying upside cheaply?",
      description:
        "These are the teams where the slot cost is still lighter than the board thinks it should be.",
    },
    {
      key: "Safe but expensive",
      label: "Safe but expensive",
      title: "Where are you paying for steadiness?",
      description:
        "These assignments are easier to live with emotionally, but they can crowd out stronger ceiling uses of the same slot.",
    },
    {
      key: "Risk with upside",
      label: "Risk with upside",
      title: "Which swings are actually worth considering?",
      description:
        "These are the uncomfortable bets that still have enough payoff to justify the risk.",
    },
    {
      key: "Rich slot",
      label: "Rich slots",
      title: "Where might the board be overpaying?",
      description:
        "The team may still be good. The question is whether this number is doing too much of the work.",
    },
    {
      key: "Balanced hold",
      label: "Balanced holds",
      title: "Which calls are quieter, but still real?",
      description:
        "Not every important decision is loud. These are the slots that are mostly fair, but still shape the board around the edges.",
    },
  ];

  const sections = groups.map((group) => {
    const items = rows.filter((row) => row.moveType === group.key);

    return {
      key: group.key,
      label: group.label,
      content: (
        <section className="nba-report-split-column nba-report-group-table" key={group.key}>
          <SectionIntro
            label={group.label}
            title={group.title}
            description={group.description}
          />
          <div className="nba-dashboard-list nba-report-group-body nba-report-group-body-strategic">
            {items.length ? (
              items.map((row) => (
                <article className="detail-card inset-card nba-strategic-card" key={row.id}>
                  <div className="panel-header">
                    <div>
                      <span className="micro-label">{row.teamLabel}</span>
                      <h3>{row.headline}</h3>
                    </div>
                  </div>
                  <p>{row.body}</p>
                  <ReportMetricsTable metrics={buildMetricPairs("strategic-moves", row)} ariaLabel="Strategic move metrics" />
                </article>
              ))
            ) : (
              <article className="detail-card inset-card">
                <p className="subtle">Nothing notable in this lane right now.</p>
              </article>
            )}
          </div>
        </section>
      ),
    };
  });

  return (
    <ReportSectionBrowser
      sections={sections}
      reportLabel={reportLabel}
      reportTitle={reportTitle}
      reportBody={reportBody}
      reportCue={reportCue}
      summaryStats={summaryStats}
    />
  );
}

function ModelGapColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats }) {
  const modelHigher = rows
    .filter((row) => row.modelLean > row.marketLean)
    .sort((a, b) => b.gap - a.gap || b.poolEv - a.poolEv);
  const marketHigher = rows
    .filter((row) => row.marketLean > row.modelLean)
    .sort((a, b) => b.gap - a.gap || b.poolEv - a.poolEv);

  const renderRows = (items, emptyText) => {
    if (!items.length) {
      return (
        <article className="detail-card inset-card">
          <p className="subtle">{emptyText}</p>
        </article>
      );
    }

    return items.map((row) => (
      <article className="detail-card inset-card" key={row.id}>
        <div className="panel-header">
          <div>
            <span className="micro-label">{row.teamLabel}</span>
            <h3>{row.headline}</h3>
          </div>
        </div>
        <p>{row.body}</p>
        <ReportMetricsTable metrics={buildMetricPairs("model-gaps", row)} ariaLabel="Market versus model metrics" />
      </article>
    ));
  };

  const sections = [
    {
      key: "model-stronger",
      label: "Model stronger",
      content: (
        <section className="nba-report-split-column nba-report-group-table">
          <SectionIntro
            label="Model stronger"
            title="Where does the model see more than the market?"
            description="These are the teams where the model is more optimistic than the public price. They are often the more interesting pre-lock second looks."
          />
          <div className="nba-dashboard-list nba-report-group-body">
            {renderRows(modelHigher, "No obvious model-over-market teams right now.")}
          </div>
        </section>
      ),
    },
    {
      key: "market-stronger",
      label: "Market stronger",
      content: (
        <section className="nba-report-split-column nba-report-group-table">
          <SectionIntro
            label="Market stronger"
            title="Where is the public price more confident?"
            description="These are the teams where the market is leaning harder than the model. Sometimes that is signal. Sometimes it is just expensive consensus."
          />
          <div className="nba-dashboard-list nba-report-group-body">
            {renderRows(marketHigher, "No obvious market-over-model teams right now.")}
          </div>
        </section>
      ),
    },
  ];

  return (
    <ReportSectionBrowser
      sections={sections}
      reportLabel={reportLabel}
      reportTitle={reportTitle}
      reportBody={reportBody}
      reportCue={reportCue}
      summaryStats={summaryStats}
    />
  );
}

export default function TeamValueReportDetailView() {
  const { reportKey } = useParams();
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
  const report = reportState.reports[reportKey];

  if (!report || !reportState.visibleReportKeys.includes(reportKey)) {
    return (
      <div className="report-back-shell">
        <a className="back-link" href="/reports">← Back to Reports</a>
        <div className="panel">
          <h2>Report not available</h2>
        </div>
      </div>
    );
  }

  const voiceFrame = buildVoiceFrame(reportKey);
  const slotFitSummary =
    reportKey === "slot-fits"
      ? buildSlotFitSummary(reportState.reports["slot-fits"]?.rows ?? [])
      : null;
  const modelGapSummary =
    reportKey === "model-gaps"
      ? buildModelGapSummary(reportState.reports["model-gaps"]?.rows ?? [])
      : null;
  const summaryStats =
    reportKey === "strategic-moves"
      ? buildStrategicSummaryStats(reportState.reports["strategic-moves"]?.rows ?? [])
      : reportKey === "slot-fits"
        ? slotFitSummary?.stats ?? reportState.summary.stats
        : reportKey === "model-gaps"
          ? modelGapSummary?.stats ?? reportState.summary.stats
          : reportState.summary.stats;
  const reportBody =
    report.key === "strategic-moves"
      ? "This page is about board decisions, not standings. Before lock, the useful question is which slots are too rich, which are quietly cheap, and which risks are actually worth carrying."
      : report.key === "slot-fits"
        ? slotFitSummary?.body
        : report.key === "model-gaps"
          ? modelGapSummary?.body
          : report.description;
  const groupedReport = ["slot-fits", "strategic-moves", "model-gaps"].includes(report.key);

  return (
    <div className="report-back-shell">
      <a className="back-link" href="/reports">← Back to Reports</a>

      {!groupedReport ? (
        <section className="panel nba-reports-hero">
          <div>
            <span className="label">{report.label}</span>
            <h2>{report.title}</h2>
            <p className="subtle">{reportBody}</p>
            <p className="subtle">{voiceFrame.cue}</p>
          </div>
          <div className="nba-stat-grid">
            {summaryStats.map((stat) => (
              <div className="nba-stat-card" key={stat.label}>
                <span className="micro-label">{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="simple-shell">
        {report.key === "slot-fits" ? (
          <SlotFitColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={reportBody}
            reportCue={voiceFrame.cue}
            summaryStats={summaryStats}
          />
        ) : report.key === "strategic-moves" ? (
          <StrategicMoveColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={reportBody}
            reportCue={voiceFrame.cue}
            summaryStats={summaryStats}
          />
        ) : report.key === "model-gaps" ? (
          <ModelGapColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={reportBody}
            reportCue={voiceFrame.cue}
            summaryStats={summaryStats}
          />
        ) : (
          <div className="nba-dashboard-list">
            {report.rows.map((row) => (
              <article className="detail-card inset-card" key={row.id}>
                <div className="panel-header">
                  <div>
                    <span className="micro-label">{row.teamLabel}</span>
                    <h3>{row.headline}</h3>
                  </div>
                </div>
                <p>{row.body}</p>
                <ReportMetricsTable metrics={buildMetricPairs(report.key, row)} ariaLabel={`${report.title} metrics`} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
