import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import {
  buildTeamValueStandingsWithOdds,
  getRoundOneTeamsFromData,
} from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";

function formatPlace(value) {
  if (!Number.isFinite(value)) return "TBD";
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function buildPriorityCard({ reportState, completionCount, memberList, currentStanding }) {
  const slotFits = reportState.reports["slot-fits"]?.rows ?? [];
  const modelGaps = reportState.reports["model-gaps"]?.rows ?? [];
  const assets = reportState.reports.assets?.rows ?? [];
  const fragility = reportState.reports.fragility?.rows ?? [];

  const safestPicks = fragility
    .slice()
    .sort((a, b) => a.fragility - b.fragility || b.yourValue - a.yourValue)
    .slice(0, 2)
    .map((row) => row.teamLabel);
  const biggestGambles = fragility
    .slice()
    .sort((a, b) => b.fragility - a.fragility || b.yourValue - a.yourValue)
    .slice(0, 2)
    .map((row) => row.teamLabel);

  if (reportState.phase === "pre_lock") {
    if (completionCount < 16) {
      return {
        eyebrow: "Most important right now",
        headline: `${16 - completionCount} rank${16 - completionCount === 1 ? "" : "s"} still need a team.`,
        body: "Finish the board first. Until every rank is filled, the rest of the reports are useful, but not decisive.",
        ctaLabel: "Open My Board",
        ctaPath: "/teams",
        secondary: "Complete the board before lock",
        safestPicks,
        biggestGambles,
      };
    }

    const topMisfit = slotFits.find((row) => row.gap > 0);
    if (topMisfit) {
      return {
        eyebrow: "Most important right now",
        headline: `${topMisfit.teamLabel} still looks mis-ranked.`,
        body: `Your board has them at rank ${topMisfit.yourValue || "unassigned"}, while the current board model likes them closer to rank ${topMisfit.fairValue}. That is probably the cleanest revision left before lock.`,
        ctaLabel: "Open Best slot fits",
        ctaPath: "/reports/slot-fits",
        secondary: `${topMisfit.expectedPoints} expected pts · ${topMisfit.poolEv} pool EV`,
        safestPicks,
        biggestGambles,
      };
    }

    const topModelGap = modelGaps[0];
    if (topModelGap) {
      return {
        eyebrow: "Most important right now",
        headline: `${topModelGap.teamLabel} is the biggest market-model split on your board.`,
        body: `The market and model are ${topModelGap.gap} points apart here. If you still want one meaningful review before lock, this is probably it.`,
        ctaLabel: "Open Market vs model",
        ctaPath: "/reports/model-gaps",
        secondary: `${topModelGap.marketLean}% market · ${topModelGap.modelLean}% model`,
        safestPicks,
        biggestGambles,
      };
    }

    return {
      eyebrow: "Most important right now",
      headline: "All 16 slots are in, and the board looks coherent.",
      body: "At this point the best use of time is a final pass through your top slots, not another full rebuild.",
      ctaLabel: "Open reports",
      ctaPath: "/reports",
      secondary: "Board complete · ready for lock",
      safestPicks,
      biggestGambles,
    };
  }

  const topAsset = assets[0];
  return {
    eyebrow: "Most important right now",
    headline: topAsset ? `${topAsset.teamLabel} is your biggest live asset.` : "Your live value is now the whole story.",
    body: topAsset
      ? `${topAsset.teamLabel} is carrying ${topAsset.yourValue} points on your board and projecting for ${topAsset.expectedPoints} expected points from here.`
      : "With the board locked, the key question is which of your top teams are still in position to keep paying out.",
    ctaLabel: "Open Biggest assets",
    ctaPath: "/reports/assets",
    secondary: currentStanding
      ? `${currentStanding.liveValueRemaining} live value · ${currentStanding.winProbability}% win probability`
      : "Board locked",
    safestPicks,
    biggestGambles,
  };
}

function buildLockWatchRows(memberList, allAssignmentsByUser) {
  const rows = memberList.map((member) => {
    const assignmentCount = Object.keys(allAssignmentsByUser?.[member.id] ?? {}).length;
    return {
      id: member.id,
      name: member.name,
      assignmentCount,
      isReady: assignmentCount === 16,
    };
  });

  const readyRows = rows
    .filter((row) => row.isReady)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3);
  const buildingRows = rows
    .filter((row) => !row.isReady)
    .sort((a, b) => b.assignmentCount - a.assignmentCount || a.name.localeCompare(b.name))
    .slice(0, 3);

  return { readyRows, buildingRows, readyCount: rows.filter((row) => row.isReady).length };
}

function buildQuickLinks({ reportState, memberList, allAssignmentsByUser }) {
  const lockWatch = buildLockWatchRows(memberList, allAssignmentsByUser);

  if (reportState.phase === "pre_lock") {
    return [
      {
        key: "slot-fits",
        label: "Best slot fits",
        title: "Which team should you revisit first?",
        body:
          reportState.reports["slot-fits"]?.rows?.[0]?.body ??
          "This is the quickest way to find the clearest slot mismatch on your board before lock.",
        ctaLabel: "Open report",
        ctaPath: "/reports/slot-fits",
      },
      {
        key: "model-gaps",
        label: "Market vs. model",
        title: "Where do outside signals disagree?",
        body:
          reportState.reports["model-gaps"]?.rows?.[0]?.body ??
          "This is the best quick stress test for consensus assumptions before lock.",
        ctaLabel: "Open report",
        ctaPath: "/reports/model-gaps",
      },
      {
        key: "strategic-moves",
        label: "Strategic moves",
        title: "Which calls are risky in the right way?",
        body:
          reportState.reports["strategic-moves"]?.rows?.[0]?.body ??
          "This is the cleaner tradeoff report: upside buys, rich slots, and safer but expensive choices.",
        ctaLabel: "Open report",
        ctaPath: "/reports/strategic-moves",
      },
    ];
  }

  return [
    {
      key: "overweight",
      label: "Overweight / underweight",
      title: "Where are you really above or below the room?",
      body:
        reportState.reports.overweight?.rows?.[0]?.body ??
        "This is the true pool-leverage report once the board is public.",
      ctaLabel: "Open report",
      ctaPath: "/reports/overweight",
    },
    {
      key: "assets",
      label: "Biggest assets",
      title: "Which teams are carrying your position?",
      body:
        reportState.reports.assets?.rows?.[0]?.body ??
        "These are the teams doing the most work for you from here.",
      ctaLabel: "Open report",
      ctaPath: "/reports/assets",
    },
    {
      key: "standings",
      label: "Standings",
      title: "How does the room compare from here?",
      body: "Points, live value, and win probability all matter once the board starts paying out.",
      ctaLabel: "Open standings",
      ctaPath: "/standings",
    },
  ];
}

function buildDeskIntro({ reportState, completionCount }) {
  const topScenario = SCENARIO_WATCH_ITEMS[0];
  const secondScenario = SCENARIO_WATCH_ITEMS[1];
  const topMisfit = reportState.reports["slot-fits"]?.rows?.find((row) => row.gap > 0);
  const strategicMove = reportState.reports["strategic-moves"]?.rows?.[0];

  if (reportState.phase !== "pre_lock") {
    return {
      headline: "The board is locked. Now it is about which teams keep paying you.",
      body:
        "At this point the dashboard should stop sounding like a draft room and start sounding like a position monitor: what is still alive, what is carrying you, and what result matters most next.",
      currentRead:
        "The private board-building phase is over. The useful question now is how much live value your best teams still have left to return.",
    };
  }

  if (completionCount < 16) {
    return {
      headline: "Rank the 16 teams before the field starts scoring.",
      body:
        "The biggest mistake right now is waiting for every unknown to vanish. Get the full board in first, then use the reports to decide which few ranks deserve a harder second look.",
      currentRead:
        secondScenario?.likelyImpact ??
        "The useful pre-lock rhythm is simple: finish the board first, then revisit only the places where the bracket movement should actually change your pricing.",
    };
  }

  if (topMisfit) {
    return {
      headline: `${topMisfit.teamLabel} is probably the cleanest rank tweak still left.`,
      body:
        `Your board is in. The job now is not another full rebuild; it is tightening the few teams that still look mispriced against the current bracket and market picture.`,
      currentRead:
        topScenario?.likelyImpact ??
        "Portland locking the West 7 line turned one side of the board into a real series. That is the kind of shift that should move a slot, not just your mood.",
    };
  }

  return {
    headline: "You are done ranking. Now narrow it to the two or three teams worth reopening.",
      body:
        strategicMove?.body ??
        "The highest-value work from here is not reading every report evenly. It is deciding which few teams still deserve a meaningful reprice before lock.",
    currentRead:
      topScenario?.likelyImpact ??
      "The board is mature enough now that the only really useful changes are the ones tied to actual bracket movement or a clear outside-signal disagreement.",
  };
}

export default function TeamValueDashboardView() {
  const { profile } = useAuth();
  const { pool, memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { allAssignmentsByUser, completionCount } = useTeamValueBoard(playoffTeams);

  const standings = buildTeamValueStandingsWithOdds(memberList, allAssignmentsByUser, series);
  const currentStanding = standings.find((member) => member.id === profile?.id) ?? null;
  const reportState = buildTeamValueReports({
    profileId: profile?.id,
    memberList,
    allAssignmentsByUser,
    seriesByRound,
    teamsById,
    series,
  });
  const quickLinks = buildQuickLinks({ reportState, memberList, allAssignmentsByUser });
  const deskIntro = buildDeskIntro({ reportState, completionCount });
  const priorityCard = buildPriorityCard({
    reportState,
    completionCount,
    memberList,
    currentStanding,
  });
  const isBoardComplete = completionCount === 16;

  return (
    <div className="nba-shell">
      <section className={`panel nba-hero-panel ${isBoardComplete ? "board-complete" : "board-building"}`}>
        <div className={`nba-hero-copy ${isBoardComplete ? "is-secondary" : ""}`}>
          <span className="label">Team value board · {SCENARIO_WATCH_DATE}</span>
          <h1>{deskIntro.headline}</h1>
          <p className="subtle">
            {deskIntro.body}
          </p>
          <div className="nba-commentary-placeholder">
            <strong>Current read</strong>
            <span>{deskIntro.currentRead}</span>
          </div>
          <div className="nba-hero-actions">
            <Link className={isBoardComplete ? "secondary-button" : "primary-button"} to="/teams">
              Open board
            </Link>
            <Link className="secondary-button" to="/reports">
              Open reports
            </Link>
          </div>
        </div>

        <div className={`nba-scoreboard-card ${isBoardComplete ? "is-primary-focus" : ""}`}>
          <span className="micro-label">{priorityCard.eyebrow}</span>
          <strong>{priorityCard.headline}</strong>
          <span className="subtle">
            {priorityCard.body}
          </span>
          <div className="nba-priority-hits">
            <div className="nba-priority-hit">
              <span className="micro-label">Safest picks</span>
              <strong>{priorityCard.safestPicks?.join(" · ") || "Still forming"}</strong>
            </div>
            <div className="nba-priority-hit">
              <span className="micro-label">Biggest gambles</span>
              <strong>{priorityCard.biggestGambles?.join(" · ") || "Still forming"}</strong>
            </div>
          </div>
          <div className="nba-report-actions">
            <a className={isBoardComplete ? "primary-button" : "secondary-button"} href={priorityCard.ctaPath}>
              {priorityCard.ctaLabel}
            </a>
          </div>
          <div className="nba-stat-grid">
            <div className="nba-stat-card">
              <span className="micro-label">Board filled</span>
              <strong>{completionCount}/16</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">{reportState.phase === "pre_lock" ? "Next key read" : "Live value"}</span>
              <strong>{priorityCard.secondary}</strong>
            </div>
            <div className="nba-stat-card">
              <span className="micro-label">{reportState.phase === "pre_lock" ? "Pool members" : "Current place"}</span>
              <strong>{reportState.phase === "pre_lock" ? memberList.length : currentStanding ? formatPlace(currentStanding.place) : "TBD"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        {quickLinks.map((item) => (
          <article className="panel" key={item.key}>
            <div className="panel-header">
              <div>
                <span className="label">{item.label}</span>
                <h2>{item.title}</h2>
              </div>
              <a className="secondary-button" href={item.ctaPath}>
                {item.ctaLabel}
              </a>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <p>{item.body}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
