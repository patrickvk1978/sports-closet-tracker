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
      persona: "Film room",
      cue: "Tighten the pricing and trim the loose slots.",
    };
  }

  if (reportKey === "strategic-moves") {
    return {
      lane: "Coach lane",
      persona: "Bench huddle",
      cue: "Sort the swings worth taking from the ones that only feel brave.",
    };
  }

  if (reportKey === "model-gaps") {
    return {
      lane: "Coach lane",
      persona: "Analytics desk",
      cue: "Use the outside-signal split to decide what deserves a second look.",
    };
  }

  if (reportKey === "assets") {
    return {
      lane: "Play-by-play lane",
      persona: "Broadcast desk",
      cue: "Call out the teams carrying the real weight on your board.",
    };
  }

  if (reportKey === "rooting") {
    return {
      lane: "Play-by-play lane",
      persona: "Tonight's booth",
      cue: "Separate the protective roots from the real swing results.",
    };
  }

  if (reportKey === "fragility") {
    return {
      lane: "Color lane",
      persona: "Scout's corner",
      cue: "Find the places where your board looks stable until someone actually throws it a punch.",
    };
  }

  if (reportKey === "overweight") {
    return {
      lane: "Color lane",
      persona: "Room whisperer",
      cue: "See where your board is carrying more exposure than the rest of the pool.",
    };
  }

  return {
    lane: "Coach lane",
    persona: "Decision desk",
    cue: "Use this page to sharpen the board before lock.",
  };
}

function buildMetaLines(reportKey, row) {
  if (reportKey === "slot-fits") {
    return [
      `Your value: ${row.yourValue || "Unassigned"}`,
      `Fair slot: ${row.fairValue}`,
      `Difference: ${row.slotDelta > 0 ? "+" : ""}${row.slotDelta}`,
      `Expected points: ${row.expectedPoints}`,
      `Pool EV: ${row.poolEv}`,
    ];
  }

  if (reportKey === "overweight") {
    return [
      `Your value: ${row.yourValue}`,
      `Room average: ${row.avgValue}`,
      `Leverage: ${row.leverage > 0 ? "+" : ""}${row.leverage}`,
      `Pool EV: ${row.poolEv}`,
    ];
  }

  if (reportKey === "assets") {
    return [
      `Your value: ${row.yourValue}`,
      `Expected points: ${row.expectedPoints}`,
      `Pool EV: ${row.poolEv}`,
    ];
  }

  if (reportKey === "rooting") {
    return [
      `Preferred team: ${row.preferredTeam}`,
      `Value tied to that side: ${row.yourValue}`,
      `Gap in your board: ${row.gap}`,
    ];
  }

  if (reportKey === "fragility") {
    return [
      `Your value: ${row.yourValue}`,
      `Round 1 market: ${row.marketLean}%`,
      `Championship odds: ${row.titleOddsPct}%`,
      `Fragility score: ${row.fragility}`,
    ];
  }

  if (reportKey === "strategic-moves") {
    return [
      `Move type: ${row.moveType}`,
      `Your value: ${row.yourValue}`,
      `Fair slot: ${row.fairValue}`,
      `Risk score: ${row.riskScore}`,
      `Upside score: ${row.upsideScore}`,
      `Pool EV: ${row.poolEv}`,
    ];
  }

  return [];
}

function SectionIntro({ label, title, description, lane, persona }) {
  return (
    <div className="detail-card inset-card nba-report-column-intro">
      <div className="nba-report-column-kicker">
        <span className="label">{label}</span>
        {lane ? <span className="chip nba-lane-chip">{lane}</span> : null}
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
      {persona ? <span className="micro-label nba-report-persona">{persona}</span> : null}
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

function SlotFitColumns({ rows }) {
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
        <div className="nba-report-meta">
          {buildMetaLines("slot-fits", row).map((line) => (
            <span className="chip" key={line}>{line}</span>
          ))}
        </div>
      </article>
    ));
  };

  return (
    <div className="nba-report-split-grid">
      <div className="nba-report-split-column">
        <SectionIntro
          label="Biggest risks"
          title="Where are you paying the richest prices?"
          description="These are the teams your board is asking the most to justify. They may still work, but the slot cost is doing some of the heavy lifting."
          lane="Coach lane"
          persona="Film room"
        />
        <div className="nba-dashboard-list">
          {renderRows(biggestRisks, "No obvious over-slotted teams right now.")}
        </div>
      </div>

      <div className="nba-report-split-column">
        <SectionIntro
          label="Potentially under-slotted"
          title="Where might you still be buying upside cheaply?"
          description="These are the teams the board thinks deserve more respect than their current slot. They are the cleanest candidates to move up without forcing a total rebuild."
          lane="Coach lane"
          persona="Film room"
        />
        <div className="nba-dashboard-list">
          {renderRows(underSlotted, "No obvious cheap-upside teams right now.")}
        </div>
      </div>
    </div>
  );
}

function StrategicMoveColumns({ rows }) {
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

  return (
    <div className="nba-report-split-grid">
      {groups.map((group) => {
        const items = rows.filter((row) => row.moveType === group.key);
        return (
          <div className="nba-report-split-column" key={group.key}>
            <SectionIntro
              label={group.label}
              title={group.title}
              description={group.description}
              lane={group.key === "Balanced hold" ? "Color lane" : "Coach lane"}
              persona={group.key === "Balanced hold" ? "Bench color" : "Bench huddle"}
            />
            <div className="nba-dashboard-list">
              {items.length ? (
                items.map((row) => (
                  <article className="detail-card inset-card" key={row.id}>
                    <div className="panel-header">
                      <div>
                        <span className="micro-label">{row.teamLabel}</span>
                        <h3>{row.headline}</h3>
                      </div>
                    </div>
                    <p>{row.body}</p>
                    <div className="nba-report-meta">
                      {buildMetaLines("strategic-moves", row).map((line) => (
                        <span className="chip" key={line}>{line}</span>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <article className="detail-card inset-card">
                  <p className="subtle">Nothing notable in this lane right now.</p>
                </article>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModelGapColumns({ rows }) {
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
        <div className="nba-report-meta">
          <span className="chip">{`Market: ${row.marketLean}%`}</span>
          <span className="chip">{`Model: ${row.modelLean}%`}</span>
          <span className="chip">{`Gap: ${row.gap}`}</span>
          <span className="chip">{`Pool EV: ${row.poolEv}`}</span>
        </div>
      </article>
    ));
  };

  return (
    <div className="nba-report-split-grid">
      <div className="nba-report-split-column">
        <SectionIntro
          label="Model stronger"
          title="Where does the model see more than the market?"
          description="These are the teams where the model is more optimistic than the public price. They are often the more interesting pre-lock second looks."
          lane="Coach lane"
          persona="Analytics desk"
        />
        <div className="nba-dashboard-list">
          {renderRows(modelHigher, "No obvious model-over-market teams right now.")}
        </div>
      </div>

      <div className="nba-report-split-column">
        <SectionIntro
          label="Market stronger"
          title="Where is the public price more confident?"
          description="These are the teams where the market is leaning harder than the model. Sometimes that is signal. Sometimes it is just expensive consensus."
          lane="Coach lane"
          persona="Analytics desk"
        />
        <div className="nba-dashboard-list">
          {renderRows(marketHigher, "No obvious market-over-model teams right now.")}
        </div>
      </div>
    </div>
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

  return (
    <div className="report-back-shell">
      <a className="back-link" href="/reports">← Back to Reports</a>

      <section className="panel nba-reports-hero">
        <div>
          <span className="label">{report.label}</span>
          <h2>{report.title}</h2>
          <div className="nba-report-voice-row">
            <span className="chip nba-lane-chip active">{voiceFrame.lane}</span>
            <span className="chip">{voiceFrame.persona}</span>
          </div>
          <p className="subtle">
            {report.key === "strategic-moves"
              ? "This page is about board decisions, not standings. Before lock, the useful question is which slots are too rich, which are quietly cheap, and which risks are actually worth carrying."
              : report.key === "slot-fits"
                ? slotFitSummary?.body
                : report.key === "model-gaps"
                  ? modelGapSummary?.body
                : report.description}
          </p>
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

      <section className="simple-shell">
        {report.key === "slot-fits" ? (
          <SlotFitColumns rows={report.rows} />
        ) : report.key === "strategic-moves" ? (
          <StrategicMoveColumns rows={report.rows} />
        ) : report.key === "model-gaps" ? (
          <ModelGapColumns rows={report.rows} />
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
                <div className="nba-report-meta">
                  {buildMetaLines(report.key, row).map((line) => (
                    <span className="chip" key={line}>{line}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
