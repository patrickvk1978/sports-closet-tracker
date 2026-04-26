import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { useEspnTodayGames } from "../hooks/useEspnTodayGames";
import { getDisplayRankFromValue } from "../lib/teamValueGame";
import { buildExactResultProbabilities, buildSeriesScoringPathMatrix, buildTeamSelectionRows, buildTeamValueBranchMonteCarlo, buildTeamValueScenarioMonteCarlo, buildTeamValueStandingsWithMonteCarlo, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";
import { buildTeamValueStandings } from "../lib/teamValueStandings";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

function combination(n, k) {
  if (k < 0 || k > n) return 0;
  const edge = Math.min(k, n - k);
  let numerator = 1;
  let denominator = 1;
  for (let index = 1; index <= edge; index += 1) {
    numerator *= n - edge + index;
    denominator *= index;
  }
  return numerator / denominator;
}

function hashSeed(...parts) {
  return parts
    .filter(Boolean)
    .join("|")
    .split("")
    .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function chooseVariant(options, ...seedParts) {
  if (!options.length) return "";
  return options[hashSeed(...seedParts) % options.length];
}

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

  if (reportKey === "board-implications") {
    return {
      lane: "Play-by-play lane",
      persona: "Implication desk",
      cue: "Separate the current series that can help you, hurt you, or quietly reshape the board next.",
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

function buildDetailInstruction(reportKey) {
  if (reportKey === "slot-fits") {
    return "Use this page to spot which teams are slotted too aggressively, which still look cheap, and which assignments are already close enough to leave alone.";
  }

  if (reportKey === "strategic-moves") {
    return "Use this page to separate the moves worth making from the ones that only feel active. Focus on the few assignments most likely to improve the board.";
  }

  if (reportKey === "model-gaps") {
    return "Use this page to compare where outside pricing and the model disagree, then decide which teams deserve one more look before you settle the board.";
  }

  if (reportKey === "board-implications") {
    return "Use this page to see which live first-round series are most likely to help your board, pressure it, or create the next meaningful swing in the room.";
  }

  return "Use this page to sharpen the board before lock.";
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

  if (reportKey === "board-implications") {
    return [
      { label: "Preferred team", value: row.preferredTeam },
      { label: "Value on side", value: row.yourValue },
      { label: "Board gap", value: row.gap },
      { label: "Market lean", value: `${row.marketLean}%` },
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

function buildDecisionOptions(reportKey, row) {
  if (reportKey === "slot-fits") {
    return {
      title: "Decision angle",
      primary:
        row.fitType === "under"
          ? chooseVariant([
              `Move ${row.teamLabel} up if you think the team is more likely to bank early wins than this slot assumes.`,
              `Push ${row.teamLabel} higher if you think this slot is leaving too much room on the table.`,
              `Move ${row.teamLabel} up if you trust the early-win floor more than the current rank does.`,
            ], row.id, reportKey, "decision-under-primary")
          : chooseVariant([
              `Move ${row.teamLabel} down if you think this slot is asking too much from the path.`,
              `Slide ${row.teamLabel} down if this rank feels too ambitious for the likely route.`,
              `Move ${row.teamLabel} lower if you think this slot is demanding more than the team is likely to deliver.`,
            ], row.id, reportKey, "decision-over-primary"),
      secondary:
        row.fitType === "under"
          ? chooseVariant([
              `Hold it if you like the upside but do not see a clearly better floor than the nearby teams.`,
              `Leave it where it is if the upside is real, but not clearly stronger than the neighboring options.`,
              `Keep it in place if you like the case, but not enough to crowd out a steadier team nearby.`,
            ], row.id, reportKey, "decision-under-secondary")
          : chooseVariant([
              `Hold it if you still trust the win volume and advancement upside enough to justify the slot.`,
              `Leave it where it is if you still think the top-end payoff is worth this rank.`,
              `Keep it here if you think the ceiling still supports a stronger slot than the nearby teams.`,
            ], row.id, reportKey, "decision-over-secondary"),
    };
  }

  if (reportKey === "strategic-moves") {
    return {
      title: "Action options",
      primary:
        row.moveType === "Upside buy" || row.moveType === "Risk with upside"
          ? chooseVariant([
              `Move ${row.teamLabel} up if you believe the partial-win floor is real enough to support a higher rank.`,
              `Push ${row.teamLabel} higher if you think the team can stack enough wins along the way to earn a better slot.`,
              `Move ${row.teamLabel} up if you trust the scoring path more than the current rank does.`,
            ], row.id, reportKey, "strategic-up-primary")
          : chooseVariant([
              `Move ${row.teamLabel} down if you think the board is buying reputation more than scoring path.`,
              `Slide ${row.teamLabel} lower if the name feels stronger than the likely point path.`,
              `Move ${row.teamLabel} down if the slot feels more based on comfort than on actual scoring return.`,
            ], row.id, reportKey, "strategic-down-primary"),
      secondary:
        row.moveType === "Upside buy" || row.moveType === "Risk with upside"
          ? chooseVariant([
              `Leave it if you like the team, but not enough to push out a steadier source of points above it.`,
              `Keep it here if you like the upside, but not enough to dislodge a safer point source above it.`,
              `Hold it if the team is interesting, but not clearly better than the steadier names around it.`,
            ], row.id, reportKey, "strategic-up-secondary")
          : chooseVariant([
              `Leave it if you still prefer the safer path and cleaner route to advancement value.`,
              `Keep it here if the steadier route still matters more to you than chasing a little extra flair.`,
              `Hold it if you still trust the cleaner path more than the flashier alternatives nearby.`,
            ], row.id, reportKey, "strategic-down-secondary"),
    };
  }

  if (reportKey === "model-gaps") {
    const modelHigher = Number(row.modelLean ?? 0) > Number(row.marketLean ?? 0);
    return {
      title: "Decision angle",
      primary: modelHigher
        ? chooseVariant([
            `Move ${row.teamLabel} up if you trust the model more than the market read here.`,
            `Push ${row.teamLabel} higher if you think the model is seeing something the market is missing.`,
            `Move ${row.teamLabel} up if you think the quieter read is the better one here.`,
          ], row.id, reportKey, "model-up-primary")
        : chooseVariant([
            `Move ${row.teamLabel} down if you think the market is telling the truer story here.`,
            `Slide ${row.teamLabel} lower if you think the market read is more believable than the model here.`,
            `Move ${row.teamLabel} down if you think the public lean is closer to reality on this team.`,
          ], row.id, reportKey, "model-down-primary"),
      secondary: modelHigher
        ? chooseVariant([
            `Keep it in place if the disagreement feels real, but not strong enough to outrank the nearby options.`,
            `Leave it where it is if you respect the disagreement, but not enough to reorder the slot.`,
            `Hold it here if the model case is interesting, but not decisive versus the nearby teams.`,
          ], row.id, reportKey, "model-up-secondary")
        : chooseVariant([
            `Keep it in place if you still think the ceiling justifies the slot.`,
            `Leave it where it is if you still think the upside is enough to support the rank.`,
            `Hold it here if you still trust the top-end case more than the doubt.`,
          ], row.id, reportKey, "model-down-secondary"),
    };
  }

  return {
    title: "Decision angle",
    primary: `Move ${row.teamLabel} up if you think the path to points is stronger than the surrounding teams at this part of the board.`,
    secondary: `Leave ${row.teamLabel} where it is if the current rank already captures both the floor and the upside cleanly.`,
  };
}

function DecisionCallout({ reportKey, row }) {
  const decision = buildDecisionOptions(reportKey, row);
  if (!decision) return null;

  return (
    <div className="detail-card inset-card nba-report-decision-callout">
      <span className="micro-label">{decision.title}</span>
      <strong className="nba-report-decision-primary">{decision.primary}</strong>
      <p>{decision.secondary}</p>
    </div>
  );
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

function formatPct(value) {
  return `${Math.round(Number(value ?? 0))}%`;
}

function ordinal(value) {
  if (!Number.isFinite(value)) return "TBD";
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function ScoringPathMatrix({ row, seriesItem }) {
  const rank = getDisplayRankFromValue(row?.yourValue);
  const matrixRows = useMemo(
    () => buildSeriesScoringPathMatrix(row?.id, row?.yourValue, seriesItem),
    [row?.id, row?.yourValue, seriesItem]
  );
  const [marketSort, setMarketSort] = useState({ key: "odds", direction: "desc" });
  const [modelSort, setModelSort] = useState({ key: "odds", direction: "desc" });

  if (!rank || !matrixRows.length) {
    return null;
  }

  const marketPeak = Math.max(...matrixRows.map((entry) => entry.marketPct));
  const modelPeak = Math.max(...matrixRows.map((entry) => entry.modelPct));

  function compareOutcome(a, b) {
    const parseOutcome = (value) => {
      const [, result, games] = String(value).match(/(Lose|Win) in (\d)/) ?? [];
      return {
        resultOrder: result === "Lose" ? 0 : 1,
        games: Number(games ?? 0),
      };
    };

    const left = parseOutcome(a.outcome);
    const right = parseOutcome(b.outcome);
    return left.resultOrder - right.resultOrder || left.games - right.games;
  }

  function sortRows(rows, sortState, probabilityKey) {
    const direction = sortState.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let result = 0;
      if (sortState.key === "outcome") {
        result = compareOutcome(a, b);
      } else if (sortState.key === "points") {
        result = a.points - b.points;
      } else {
        result = a[probabilityKey] - b[probabilityKey];
      }
      if (result !== 0) return result * direction;
      return compareOutcome(a, b);
    });
  }

  function toggleSort(current, key) {
    if (current.key === key) {
      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    }
    return {
      key,
      direction: key === "outcome" ? "asc" : "desc",
    };
  }

  function renderTable(label, tone, peakKey) {
    const sortState = peakKey === "marketPct" ? marketSort : modelSort;
    const setSortState = peakKey === "marketPct" ? setMarketSort : setModelSort;
    const sortedRows = sortRows(matrixRows, sortState, peakKey);

    function sortLabel(base, key) {
      if (sortState.key !== key) return base;
      return `${base} ${sortState.direction === "asc" ? "↑" : "↓"}`;
    }

    return (
      <article className={`detail-card inset-card nba-report-scoring-matrix-card ${tone}`}>
        <div className="nba-report-scoring-matrix-header">
          <div className="nba-report-scoring-matrix-title-row">
            <div>
              <span className="micro-label">Scoring path</span>
              <h4>{label}</h4>
            </div>
            <span className="tooltip-wrap tooltip-wrap-inline">
              <button className="help-dot" type="button" aria-label={`More about the ${label} scoring path matrix`}>
                ?
              </button>
              <span className="tooltip-bubble">
                Sort by outcome, points, or odds to see how this team behaves at Rank {rank}. Points follow the team&apos;s value per win plus the rank-scaled Round 1 advancement bonus.
              </span>
            </span>
          </div>
        </div>
        <div className="nba-report-scoring-table">
          <div className="nba-report-scoring-table-head">
            <button type="button" className="nba-report-scoring-sort" onClick={() => setSortState((current) => toggleSort(current, "outcome"))}>
              {sortLabel("Outcome", "outcome")}
            </button>
            <button type="button" className="nba-report-scoring-sort" onClick={() => setSortState((current) => toggleSort(current, "points"))}>
              {sortLabel("Points", "points")}
            </button>
            <button type="button" className="nba-report-scoring-sort" onClick={() => setSortState((current) => toggleSort(current, "odds"))}>
              {sortLabel("Odds", "odds")}
            </button>
          </div>
          {sortedRows.map((entry) => {
            const probability = peakKey === "marketPct" ? entry.marketPct : entry.modelPct;
            const isTopOutcome = probability === (peakKey === "marketPct" ? marketPeak : modelPeak);

            return (
              <div className="nba-report-scoring-table-row" key={`${tone}-${entry.key}`}>
                <strong className="nba-report-scoring-outcome">{entry.outcome}</strong>
                <span className="nba-report-scoring-points">{entry.points}</span>
                <span className={`nba-report-scoring-odds ${isTopOutcome ? "is-top-outcome" : ""}`}>
                  {formatPct(probability)}
                </span>
              </div>
            );
          })}
        </div>
      </article>
    );
  }

  return (
    <div className="nba-report-scoring-matrix-shell">
      <div className="nba-report-scoring-matrix-kicker">
        <span className="micro-label">Scoring path matrix</span>
        <strong>Rank {rank}: {row.teamLabel}</strong>
      </div>
      <div className="nba-report-scoring-matrix-grid">
        {renderTable("Market", "market-card", "marketPct")}
        {renderTable("Model", "model-card", "modelPct")}
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

function formatMemberName(member, currentUserId) {
  if (!member) return "Unknown";
  return member.id === currentUserId ? "You" : (member.displayName ?? member.name ?? "Unknown");
}

function sameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTipTime(value) {
  if (!value) return "Time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSeriesStatus(seriesItem) {
  const conferenceKey = String(seriesItem.conference ?? "").toLowerCase();
  const conference = conferenceKey === "west" ? "West" : conferenceKey === "league" ? "League" : "East";
  const roundLabel = seriesItem.roundKey === "round_1" ? "1st Round" : "Playoff";
  const homeWins = Number(seriesItem.wins?.home ?? 0);
  const awayWins = Number(seriesItem.wins?.away ?? 0);
  const nextGameNumber = Math.min(homeWins + awayWins + 1, 7);
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;

  if (homeWins === awayWins) {
    return `${conference} ${roundLabel} · Game ${nextGameNumber} · Series tied ${homeWins}-${awayWins}`;
  }

  const leader = homeWins > awayWins ? homeAbbr : awayAbbr;
  const leaderWins = Math.max(homeWins, awayWins);
  const trailingWins = Math.min(homeWins, awayWins);
  return `${conference} ${roundLabel} · Game ${nextGameNumber} · ${leader} leads series ${leaderWins}-${trailingWins}`;
}

function buildCurrentLineLabel(game) {
  if (game.currentLineLabel) {
    return game.currentLineLabel;
  }
  return "Line TBD";
}

function buildPredictorLabel(game) {
  if (game.oddsSource === "predictor" && game.marketFavoriteLabel) {
    return game.marketFavoriteLabel.replace(/^Matchup Predictor:\s*/, "");
  }
  if (game.favoriteAbbreviation && Number.isFinite(game.favoritePct)) {
    return `${game.favoriteAbbreviation} ${game.favoritePct}%`;
  }
  return "Predictor TBD";
}

function buildMatchupAccentStyle(seriesItem) {
  const homePalette = getTeamPalette("nba", seriesItem.homeTeam ?? { id: seriesItem.homeTeamId, abbreviation: seriesItem.homeTeam?.abbreviation });
  const awayPalette = getTeamPalette("nba", seriesItem.awayTeam ?? { id: seriesItem.awayTeamId, abbreviation: seriesItem.awayTeam?.abbreviation });
  return {
    "--briefing-accent-primary": homePalette.primary,
    "--briefing-accent-secondary": awayPalette.primary,
    "--briefing-accent-border": homePalette.border,
  };
}

function cloneSeriesWithSingleWinner(series, winnerId) {
  const homeId = series.homeTeam?.id ?? series.homeTeamId;
  const awayId = series.awayTeam?.id ?? series.awayTeamId;
  const wins = {
    home: Number(series.wins?.home ?? 0),
    away: Number(series.wins?.away ?? 0),
  };
  if (winnerId === homeId) wins.home += 1;
  if (winnerId === awayId) wins.away += 1;
  return {
    ...series,
    wins,
    homeWins: wins.home,
    awayWins: wins.away,
    status: wins.home >= 4 || wins.away >= 4 ? "completed" : (series.status === "scheduled" ? "in_progress" : series.status),
    winnerTeamId: wins.home >= 4 ? homeId : wins.away >= 4 ? awayId : null,
  };
}

function getGameWinnerId(game) {
  const homeScore = Number(game?.homeScore ?? 0);
  const awayScore = Number(game?.awayScore ?? 0);
  if (!game || homeScore === awayScore) return null;
  return homeScore > awayScore ? game.homeTeamId : game.awayTeamId;
}

function buildStartOfDaySeries(series, todayEntries) {
  const completedWinnersBySeriesId = Object.fromEntries(
    todayEntries
      .filter(({ game }) => game?.status === "completed")
      .map(({ game, seriesItem }) => [seriesItem.id, getGameWinnerId(game)])
      .filter(([, winnerId]) => winnerId)
  );

  return series.map((seriesItem) => {
    const winnerId = completedWinnersBySeriesId[seriesItem.id];
    if (!winnerId) return seriesItem;

    const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
    const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
    const wins = {
      home: Number(seriesItem.wins?.home ?? 0),
      away: Number(seriesItem.wins?.away ?? 0),
    };

    if (winnerId === homeId) wins.home = Math.max(0, wins.home - 1);
    if (winnerId === awayId) wins.away = Math.max(0, wins.away - 1);

    return {
      ...seriesItem,
      wins,
      homeWins: wins.home,
      awayWins: wins.away,
      status: "scheduled",
      winnerTeamId: null,
    };
  });
}

function buildScenarioSeries(series, winnersBySeriesId) {
  return series.map((seriesItem) => {
    const winnerId = winnersBySeriesId[seriesItem.id];
    return winnerId ? cloneSeriesWithSingleWinner(seriesItem, winnerId) : seriesItem;
  });
}

function buildPerspectiveName(member, currentUserId) {
  return formatMemberName(member, currentUserId);
}

function compareScenarioValues(left, right, direction = "desc") {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "string" && typeof right === "string") {
    return direction === "asc" ? left.localeCompare(right) : right.localeCompare(left);
  }
  return direction === "asc" ? left - right : right - left;
}

function sortScenarioRows(rows, sortState) {
  const { key, direction } = sortState;
  return [...rows].sort((left, right) => {
    if (key === "label") return compareScenarioValues(left.label, right.label, direction);
    if (key === "place") return compareScenarioValues(left.perspectivePlace, right.perspectivePlace, direction);
    if (key === "points") return compareScenarioValues(left.perspectivePoints, right.perspectivePoints, direction);
    if (key === "winProb") return compareScenarioValues(left.perspectiveWinProb, right.perspectiveWinProb, direction);
    return 0;
  });
}

function nextScenarioSortState(current, key, initialDirection = "desc") {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "desc" ? "asc" : "desc",
    };
  }

  return { key, direction: initialDirection };
}

function renderScenarioSortLabel(activeSort, key, label) {
  if (activeSort.key !== key) return `${label} ↕`;
  return `${label} ${activeSort.direction === "asc" ? "↑" : "↓"}`;
}

function sortNeedRows(rows, sortState) {
  const { key, direction } = sortState;
  const multiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    if (key === "preferred") {
      const preferredResult = left.preferred.localeCompare(right.preferred);
      if (preferredResult !== 0) return preferredResult * multiplier;
    }

    if (key === "winSwing") {
      const swingResult = (Number(left.winSwing ?? 0) - Number(right.winSwing ?? 0)) * multiplier;
      if (swingResult !== 0) return swingResult;
    }

    const gapResult = Number(right.gap ?? 0) - Number(left.gap ?? 0);
    if (gapResult !== 0) return gapResult;

    return left.name.localeCompare(right.name);
  });
}

function buildTomorrowScenarioRows(todayEntries, memberList, allAssignmentsByUser, allSeries, currentUserId, simulationTeamEntries, perspectiveUserId = currentUserId) {
  if (!todayEntries.length) return [];
  const options = todayEntries.map(({ game, seriesItem }) => {
    const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
    const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
    return [
      { seriesId: seriesItem.id, winnerId: homeId, label: seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId },
      { seriesId: seriesItem.id, winnerId: awayId, label: seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId },
    ];
  });

  const combinations = [];
  function walk(index, picks) {
    if (index === options.length) {
      combinations.push([...picks]);
      return;
    }
    options[index].forEach((option) => {
      picks.push(option);
      walk(index + 1, picks);
      picks.pop();
    });
  }
  walk(0, []);

  const startOfDaySeries = buildStartOfDaySeries(allSeries, todayEntries);

  return combinations.map((combo) => {
    const winnersBySeriesId = Object.fromEntries(combo.filter((entry) => entry.winnerId).map((entry) => [entry.seriesId, entry.winnerId]));
    const scenarioSeries = buildScenarioSeries(startOfDaySeries, winnersBySeriesId);
    const standings = buildTeamValueStandingsWithMonteCarlo(
      memberList,
      allAssignmentsByUser,
      scenarioSeries,
      simulationTeamEntries
    );
    const perspectiveMember = standings.find((entry) => entry.id === perspectiveUserId) ?? null;
    const leaders = standings.slice(0, 3).map((entry) => `${formatMemberName(entry, currentUserId)} ${entry.summary.totalPoints}`);
    return {
      key: combo.map((entry) => entry.label).join("-"),
      label: combo.map((entry) => entry.label).join(", "),
      perspectivePlace: perspectiveMember?.place ?? null,
      perspectivePoints: perspectiveMember?.summary.totalPoints ?? 0,
      perspectiveWinProb: perspectiveMember?.winProbability ?? 0,
      leaders,
    };
  });
}

function buildBranchSimulationBySeries(todaySeries, memberList, allAssignmentsByUser, allSeries, selectionRows) {
  return Object.fromEntries(
    todaySeries.map((seriesItem) => {
      const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
      const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
      return [
        seriesItem.id,
        {
          [homeId]: {
            winnerId: homeId,
            members: buildTeamValueBranchMonteCarlo(memberList, allAssignmentsByUser, allSeries, selectionRows, seriesItem.id, homeId),
          },
          [awayId]: {
            winnerId: awayId,
            members: buildTeamValueBranchMonteCarlo(memberList, allAssignmentsByUser, allSeries, selectionRows, seriesItem.id, awayId),
          },
        },
      ];
    })
  );
}

function buildSimulationSwingRows(seriesItem, branchSimulationBySeriesId, currentUserId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const branchPair = branchSimulationBySeriesId?.[seriesItem.id] ?? null;
  const homeBranch = branchPair?.[homeId]?.members?.[currentUserId] ?? null;
  const awayBranch = branchPair?.[awayId]?.members?.[currentUserId] ?? null;

  const rows = [
    {
      label: `${homeAbbr} win`,
      expectedPlace: homeBranch?.expectedPlace ?? null,
      expectedPoints: homeBranch?.expectedPoints ?? null,
      winProbability: homeBranch?.winProbability ?? null,
    },
    {
      label: `${awayAbbr} win`,
      expectedPlace: awayBranch?.expectedPlace ?? null,
      expectedPoints: awayBranch?.expectedPoints ?? null,
      winProbability: awayBranch?.winProbability ?? null,
    },
  ];
  const [homeRow, awayRow] = rows;
  return rows.map((row) => {
    const otherRow = row === homeRow ? awayRow : homeRow;
    const swing = row.winProbability != null && otherRow.winProbability != null
      ? Number((row.winProbability - otherRow.winProbability).toFixed(1))
      : null;
    return {
      ...row,
      winProbabilitySwing: swing,
    };
  });
}

function getBranchMember(seriesItem, branchSimulationBySeriesId, teamId, memberId) {
  return branchSimulationBySeriesId?.[seriesItem.id]?.[teamId]?.members?.[memberId] ?? null;
}

function impactLabel(value) {
  const magnitude = Math.abs(Number(value ?? 0));
  if (magnitude >= 8) return "Huge";
  if (magnitude >= 5) return "Major";
  if (magnitude >= 2.5) return "Meaningful";
  if (magnitude >= 1) return "Light";
  return "Low";
}

function buildPoolImpactStats(seriesItem, memberList, branchSimulationBySeriesId, currentUserId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const deltas = memberList
    .map((member) => {
      const homeBranch = getBranchMember(seriesItem, branchSimulationBySeriesId, homeId, member.id);
      const awayBranch = getBranchMember(seriesItem, branchSimulationBySeriesId, awayId, member.id);
      if (!homeBranch || !awayBranch) return null;
      const delta = Number((Number(homeBranch.winProbability ?? 0) - Number(awayBranch.winProbability ?? 0)).toFixed(1));
      return {
        id: member.id,
        name: formatMemberName(member, currentUserId),
        delta,
        absDelta: Math.abs(delta),
        side: delta >= 0
          ? seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId
          : seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId,
      };
    })
    .filter(Boolean);
  const averageSwing = deltas.length
    ? Number((deltas.reduce((sum, row) => sum + row.absDelta, 0) / deltas.length).toFixed(1))
    : 0;
  const maxSwing = deltas.length ? Math.max(...deltas.map((row) => row.absDelta)) : 0;
  const topRows = [...deltas].sort((a, b) => b.absDelta - a.absDelta || a.name.localeCompare(b.name)).slice(0, 3);
  const sideCounts = deltas.reduce((acc, row) => {
    acc[row.side] = (acc[row.side] ?? 0) + 1;
    return acc;
  }, {});

  return {
    averageSwing,
    maxSwing: Number(maxSwing.toFixed(1)),
    topRows,
    sideCounts,
  };
}

function buildSeriesWinLabel(seriesItem, forcedWinnerId = null, referenceGame = null) {
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const wins = {
    home: Number(seriesItem.wins?.home ?? 0),
    away: Number(seriesItem.wins?.away ?? 0),
  };

  if (forcedWinnerId === homeId) wins.home = Math.min(wins.home + 1, 4);
  if (forcedWinnerId === awayId) wins.away = Math.min(wins.away + 1, 4);
  if (wins.home >= 4) return `${homeAbbr} 100%`;
  if (wins.away >= 4) return `${awayAbbr} 100%`;

  const scheduledHomeSeriesPct = computeSeriesWinProbabilityFromSchedule(seriesItem, wins.home, wins.away, referenceGame);
  if (Number.isFinite(scheduledHomeSeriesPct)) {
    const scheduledAwaySeriesPct = Math.max(1, Math.min(99, Math.round(100 - scheduledHomeSeriesPct)));
    const leaderAbbr = scheduledHomeSeriesPct >= scheduledAwaySeriesPct ? homeAbbr : awayAbbr;
    const leaderPct = scheduledHomeSeriesPct >= scheduledAwaySeriesPct ? scheduledHomeSeriesPct : scheduledAwaySeriesPct;
    return `${leaderAbbr} ${Math.round(leaderPct)}%`;
  }

  const baselineHomeSeriesPct = resolveSeriesMarketPct(seriesItem, homeId);
  const inferredHomeGamePct = inferGameWinPctFromSeriesOdds(
    Number(seriesItem.wins?.home ?? 0),
    Number(seriesItem.wins?.away ?? 0),
    baselineHomeSeriesPct
  );
  const fallbackHomeGamePct = resolveTeamGameWinPct(seriesItem, homeId, referenceGame);
  const homeGamePct = inferredHomeGamePct ?? fallbackHomeGamePct;

  const homeSeriesPct = forcedWinnerId == null && Number.isFinite(baselineHomeSeriesPct)
    ? Math.max(1, Math.min(99, Math.round(baselineHomeSeriesPct)))
    : computeSeriesWinProbabilityFromGamePct(wins.home, wins.away, homeGamePct);
  const awaySeriesPct = forcedWinnerId == null && Number.isFinite(baselineHomeSeriesPct)
    ? Math.max(1, Math.min(99, Math.round(100 - baselineHomeSeriesPct)))
    : computeSeriesWinProbabilityFromGamePct(wins.away, wins.home, homeGamePct != null ? 100 - homeGamePct : null);
  const leaderAbbr = homeSeriesPct >= awaySeriesPct ? homeAbbr : awayAbbr;
  const leaderPct = homeSeriesPct >= awaySeriesPct ? homeSeriesPct : awaySeriesPct;
  return `${leaderAbbr} ${Math.round(leaderPct)}%`;
}

function resolveSeriesMarketPct(seriesItem, teamId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  if (teamId === homeId) return Number(seriesItem.market?.homeWinPct ?? null);
  if (teamId === awayId) return Number(seriesItem.market?.awayWinPct ?? null);
  return null;
}

function resolveTeamGameWinPct(seriesItem, teamId, referenceGame = null) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  if (referenceGame) {
    if (teamId === referenceGame.homeTeamId) return Number(referenceGame.marketHomeWinPct ?? referenceGame.homeWinPct ?? null);
    if (teamId === referenceGame.awayTeamId) return Number(referenceGame.marketAwayWinPct ?? referenceGame.awayWinPct ?? null);
  }
  if (teamId === homeId) return Number(seriesItem.market?.homeWinPct ?? null);
  if (teamId === awayId) return Number(seriesItem.market?.awayWinPct ?? null);
  return null;
}

function computeSeriesWinProbabilityFromGamePct(teamWins, opponentWins, teamGamePct) {
  if (!Number.isFinite(teamWins) || !Number.isFinite(opponentWins)) return null;
  if (teamWins >= 4) return 100;
  if (opponentWins >= 4) return 0;

  const probability = Math.max(0.05, Math.min(0.95, Number(teamGamePct ?? 50) / 100));
  const teamNeeded = 4 - teamWins;
  const opponentNeeded = 4 - opponentWins;
  let seriesWinProbability = 0;

  for (let remainingGames = teamNeeded; remainingGames <= teamNeeded + opponentNeeded - 1; remainingGames += 1) {
    const opponentWinsBeforeClincher = remainingGames - teamNeeded;
    if (opponentWinsBeforeClincher < 0 || opponentWinsBeforeClincher >= opponentNeeded) continue;
    seriesWinProbability +=
      combination(remainingGames - 1, teamNeeded - 1) *
      probability ** teamNeeded *
      (1 - probability) ** opponentWinsBeforeClincher;
  }

  return Math.max(1, Math.min(99, Math.round(seriesWinProbability * 100)));
}

function inferGameWinPctFromSeriesOdds(teamWins, opponentWins, targetSeriesPct) {
  const target = Number(targetSeriesPct);
  if (!Number.isFinite(target)) return null;
  const normalizedTarget = Math.max(0.01, Math.min(0.99, target / 100));
  let low = 0.05;
  let high = 0.95;

  for (let index = 0; index < 30; index += 1) {
    const mid = (low + high) / 2;
    const midSeriesPct = computeSeriesWinProbabilityFromGamePct(teamWins, opponentWins, mid * 100) / 100;
    if (midSeriesPct < normalizedTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return ((low + high) / 2) * 100;
}

function probabilityToLogit(probabilityPct) {
  const probability = Math.max(0.01, Math.min(0.99, Number(probabilityPct ?? 50) / 100));
  return Math.log(probability / (1 - probability));
}

function logitToProbability(logit) {
  const odds = Math.exp(logit);
  return (odds / (1 + odds)) * 100;
}

function buildRemainingVenueSequence(homeWins, awayWins) {
  const schedule = [true, true, false, false, true, false, true];
  const nextGameIndex = Math.max(0, Math.min(schedule.length, homeWins + awayWins));
  return schedule.slice(nextGameIndex);
}

function computeSeriesWinProbabilityWithSchedule(homeWins, awayWins, homeGameProbabilities, index = 0) {
  if (homeWins >= 4) return 1;
  if (awayWins >= 4) return 0;
  if (index >= homeGameProbabilities.length) return 0;

  const probability = Math.max(0.01, Math.min(0.99, Number(homeGameProbabilities[index] ?? 50) / 100));
  return (
    probability * computeSeriesWinProbabilityWithSchedule(homeWins + 1, awayWins, homeGameProbabilities, index + 1) +
    (1 - probability) * computeSeriesWinProbabilityWithSchedule(homeWins, awayWins + 1, homeGameProbabilities, index + 1)
  );
}

function computeSeriesWinProbabilityFromSchedule(seriesItem, homeWins, awayWins, referenceGame = null) {
  if (!referenceGame) return null;

  const seriesHomeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const marketSeriesHomePct =
    seriesHomeId === referenceGame.homeTeamId
      ? Number(referenceGame.marketHomeWinPct ?? null)
      : seriesHomeId === referenceGame.awayTeamId
        ? Number(referenceGame.marketAwayWinPct ?? null)
        : null;

  if (!Number.isFinite(marketSeriesHomePct)) return null;

  const seriesHomeIsCurrentVenueHome = seriesHomeId === referenceGame.homeTeamId;
  const homeCourtLogitEdge = 0.28;
  const currentLogit = probabilityToLogit(marketSeriesHomePct);
  const neutralLogit = currentLogit - (seriesHomeIsCurrentVenueHome ? homeCourtLogitEdge : -homeCourtLogitEdge);
  const remainingVenueSequence = buildRemainingVenueSequence(homeWins, awayWins);
  const homeGameProbabilities = remainingVenueSequence.map((seriesHomeVenue) =>
    logitToProbability(neutralLogit + (seriesHomeVenue ? homeCourtLogitEdge : -homeCourtLogitEdge))
  );

  return Math.max(
    1,
    Math.min(
      99,
      Math.round(computeSeriesWinProbabilityWithSchedule(homeWins, awayWins, homeGameProbabilities) * 100)
    )
  );
}

function buildGameOverviewRows(seriesItem, game, simulationRows, poolImpactStats, poolImpactRank, totalTodaySeries) {
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeRow = simulationRows.find((row) => row.label.startsWith(homeAbbr)) ?? null;
  const awayRow = simulationRows.find((row) => row.label.startsWith(awayAbbr)) ?? null;
  const userSwing = homeRow?.winProbability != null && awayRow?.winProbability != null
    ? Math.abs(Number(homeRow.winProbability) - Number(awayRow.winProbability))
    : 0;

  return [
    { label: "Current series", value: buildSeriesWinLabel(seriesItem, null, game) },
    { label: `${homeAbbr} wins game`, value: buildSeriesWinLabel(seriesItem, homeId, game) },
    { label: `${awayAbbr} wins game`, value: buildSeriesWinLabel(seriesItem, awayId, game) },
    { label: "Your impact", value: `${impactLabel(userSwing)} · ${userSwing.toFixed(1)} pts` },
    {
      label: "Pool impact",
      value: `${impactLabel(poolImpactStats.averageSwing)} · #${poolImpactRank} of ${Math.max(totalTodaySeries, 1)}`,
    },
  ];
}

function buildPoolImpactNote(seriesItem, needRows, poolImpactStats, poolImpactRank, totalTodaySeries) {
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const homeCity = teamNarrativeName(homeAbbr, seriesItem, "city");
  const awayCity = teamNarrativeName(awayAbbr, seriesItem, "city");
  const topRows = poolImpactStats.topRows ?? [];
  const majorRows = (needRows ?? []).filter((row) => Math.abs(Number(row.winSwing ?? 0)) >= 10);
  const significantRows = (needRows ?? []).filter((row) => Math.abs(Number(row.winSwing ?? 0)) >= 5);
  const topNames = topRows.map((row) => row.name).join(", ");
  const sideCounts = poolImpactStats.sideCounts ?? {};
  const homeCount = sideCounts[homeAbbr] ?? 0;
  const awayCount = sideCounts[awayAbbr] ?? 0;
  const leadingSide = homeCount === awayCount ? null : homeCount > awayCount ? homeAbbr : awayAbbr;
  const leadingCity = leadingSide ? teamNarrativeName(leadingSide, seriesItem, "city") : null;
  const leadingCount = leadingSide ? sideCounts[leadingSide] : 0;
  const narrativeState = buildSeriesNarrativeState(seriesItem, 0, Number(poolImpactStats.averageSwing ?? 0));
  const rankPhrase = totalTodaySeries > 1
    ? `It ranks #${poolImpactRank} among today's ${totalTodaySeries} games by average room swing.`
    : "It is today's only room-wide swing point.";

  if (!topRows.length) {
    return {
      title: chooseVariant([
        `${homeAbbr}-${awayAbbr} has a light room-wide read right now`,
        `${homeAbbr}-${awayAbbr} is still quiet at the pool level`,
        `${homeAbbr}-${awayAbbr} is not pulling the room hard yet`,
      ], ...narrativeSeed(seriesItem, "pool-impact-empty-title")),
      body: chooseVariant([
        `The simulator is not finding much separation across the room yet. ${rankPhrase}`,
        `${rankPhrase} At the moment, the room is not splitting sharply enough here for this matchup to create a strong public pressure point.`,
        `${rankPhrase} The current simulator read is still relatively soft, which makes this more of a watch item than a room-shaping result right now.`,
      ], ...narrativeSeed(seriesItem, "pool-impact-empty-body")),
    };
  }

  if (poolImpactStats.averageSwing < 1.5 && significantRows.length === 0) {
    return {
      title: chooseVariant([
        `${homeAbbr}-${awayAbbr} is mostly background noise for the room`,
        `${homeAbbr}-${awayAbbr} is more watchlist than pressure point`,
        `${homeAbbr}-${awayAbbr} is not bending the pool very hard`,
      ], ...narrativeSeed(seriesItem, "pool-impact-light-title")),
      body: chooseVariant([
        `${rankPhrase} The simulator is not finding a meaningful pool-wide swing here yet: the average visible board moves only ${poolImpactStats.averageSwing} points, and no entry clears a 5-point swing. This can still matter for basketball, but in the pool it is more watchlist than pressure point.`,
        `${rankPhrase} The average visible board moves only ${poolImpactStats.averageSwing} points here, and nobody clears a 5-point swing. In pool terms, that keeps this matchup in the background tier for now.`,
        `${rankPhrase} There is still basketball intrigue here, but the simulator is not seeing real room-wide heat yet. With an average swing of only ${poolImpactStats.averageSwing} points, this remains a fairly quiet pool result.`,
      ], ...narrativeSeed(seriesItem, "pool-impact-light-body")),
    };
  }

  const title = chooseVariant([
    `${homeAbbr}-${awayAbbr} matters most to ${topRows[0].name}`,
    `${homeAbbr}-${awayAbbr} has its loudest room pressure near ${topRows[0].name}`,
    `${homeAbbr}-${awayAbbr} is not evenly weighted across the room`,
  ], ...narrativeSeed(seriesItem, "pool-impact-title"));

  const alignmentSentence = leadingSide
    ? `${leadingCount} of ${needRows.length} visible boards have their stronger simulator side on ${leadingCity}.`
    : `The room is split almost evenly between ${homeCity} and ${awayCity}, which makes the matchup more divisive than directional.`;

  const swingSentence = majorRows.length
    ? `${majorRows.length} ${majorRows.length === 1 ? "entry has" : "entries have"} a very significant 10-plus-point swing, led by ${majorRows.slice(0, 2).map((row) => row.name).join(" and ")}.`
    : significantRows.length
      ? `${significantRows.length} ${significantRows.length === 1 ? "entry has" : "entries have"} a significant 5-plus-point swing, led by ${significantRows.slice(0, 2).map((row) => row.name).join(" and ")}.`
      : `The swings are present but not especially sharp; nobody clears a 5-point pool-win move.`;
  const sideSentence = [homeAbbr, awayAbbr].map((side) => {
    const rows = significantRows.filter((row) => row.preferred === side);
    if (!rows.length) return null;
    return `${rows.length} significant ${side} ${rows.length === 1 ? "need" : "needs"}`;
  }).filter(Boolean).join("; ");

  return {
    title,
    body: `${rankPhrase} ${narrativeState.stageSentence} ${swingSentence} ${alignmentSentence}${sideSentence ? ` In side terms: ${sideSentence}.` : ""} The table below shows who is actually exposed, not just who has a team ranked higher.`,
  };
}

function formatSwing(value) {
  if (value == null) return "—";
  if (value === 0) return "Even";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`;
}

const TEAM_NARRATIVE_NICKNAMES = {
  BOS: "the Cs",
  CLE: "the Cavs",
  DET: "the Pistons",
  NYK: "the Knicks",
  ORL: "the Magic",
  PHI: "the Sixers",
  TOR: "the Raptors",
  ATL: "the Hawks",
  OKC: "the Thunder",
  LAL: "the Lakers",
  HOU: "the Rockets",
  SAS: "the Spurs",
  DEN: "the Nuggets",
  MIN: "the Wolves",
  POR: "the Blazers",
  PHX: "the Suns",
};

function articleForWord(word) {
  if (!word) return "a";
  return /^[AEIOU]/i.test(word) ? "an" : "a";
}

function teamFromAbbr(abbreviation, seriesItem) {
  const home = seriesItem?.homeTeam;
  const away = seriesItem?.awayTeam;
  if (home?.abbreviation === abbreviation) return home;
  if (away?.abbreviation === abbreviation) return away;
  return { abbreviation, city: abbreviation, name: abbreviation };
}

function teamNarrativeName(teamOrAbbr, seriesItem, variant = "club") {
  const team = typeof teamOrAbbr === "string" ? teamFromAbbr(teamOrAbbr, seriesItem) : teamOrAbbr;
  if (!team) return "that side";
  if (variant === "city") return team.city ?? team.abbreviation ?? "that side";
  if (variant === "nickname") return TEAM_NARRATIVE_NICKNAMES[team.abbreviation] ?? `the ${team.name ?? team.abbreviation}`;
  if (variant === "full") return `${team.city ?? ""} ${team.name ?? team.abbreviation}`.trim();
  return team.name ? `the ${team.name}` : team.abbreviation ?? "that side";
}

function teamResultPhrase(teamOrAbbr, seriesItem) {
  const team = typeof teamOrAbbr === "string" ? teamFromAbbr(teamOrAbbr, seriesItem) : teamOrAbbr;
  const city = team?.city ?? team?.abbreviation ?? "that team";
  return `${articleForWord(city)} ${city} result`;
}

function narrativeSeed(seriesItem, ...parts) {
  return [seriesItem?.id, seriesItem?.homeTeamId, seriesItem?.awayTeamId, ...parts].filter(Boolean);
}

function buildSeriesNarrativeState(seriesItem, userSwing = 0, poolSwing = 0) {
  const homeWins = Number(seriesItem?.wins?.home ?? 0);
  const awayWins = Number(seriesItem?.wins?.away ?? 0);
  const leaderWins = Math.max(homeWins, awayWins);
  const gamesPlayed = homeWins + awayWins;
  const leverageTier = userSwing >= 8 || poolSwing >= 8 ? "high" : userSwing >= 4 || poolSwing >= 4 ? "medium" : "low";
  const seriesStage = leaderWins >= 3 ? "late" : gamesPlayed >= 3 ? "middle" : "early";
  const stageSentence = seriesStage === "late"
    ? "The series is deep enough now that every result starts to close off one path and amplify another."
    : seriesStage === "middle"
      ? "This is the stretch where the series stops feeling abstract and starts bending the pool in visible ways."
      : "It is still early enough for this to feel more like shape-setting than final sorting.";

  return {
    leverageTier,
    seriesStage,
    stageSentence,
  };
}

function getBranchOutcomePreference(seriesItem, branchSimulationBySeriesId, memberId, fallbackAssignments = {}) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const branchPair = branchSimulationBySeriesId?.[seriesItem.id] ?? null;
  const homeBranch = branchPair?.[homeId]?.members?.[memberId] ?? null;
  const awayBranch = branchPair?.[awayId]?.members?.[memberId] ?? null;
  const homeValue = Number(fallbackAssignments?.[homeId] ?? 0);
  const awayValue = Number(fallbackAssignments?.[awayId] ?? 0);
  const rawPreferred = homeValue === awayValue ? null : homeValue > awayValue ? homeAbbr : awayAbbr;
  const homeWin = Number(homeBranch?.winProbability ?? 0);
  const awayWin = Number(awayBranch?.winProbability ?? 0);
  const winGap = Math.abs(homeWin - awayWin);
  const simulationPreferred = winGap >= 0.2 ? homeWin > awayWin ? homeAbbr : awayAbbr : null;
  const preferred = simulationPreferred ?? rawPreferred;
  const preferredBranch = preferred === homeAbbr ? homeBranch : preferred === awayAbbr ? awayBranch : null;
  const oppositeBranch = preferred === homeAbbr ? awayBranch : preferred === awayAbbr ? homeBranch : null;

  return {
    homeAbbr,
    awayAbbr,
    homeBranch,
    awayBranch,
    homeValue,
    awayValue,
    rawPreferred,
    simulationPreferred,
    preferred,
    preferredBranch,
    oppositeBranch,
    conflict: Boolean(rawPreferred && simulationPreferred && rawPreferred !== simulationPreferred),
    winSwing: preferredBranch && oppositeBranch
      ? Number((Number(preferredBranch.winProbability ?? 0) - Number(oppositeBranch.winProbability ?? 0)).toFixed(1))
      : 0,
    pointsSwing: preferredBranch && oppositeBranch
      ? Number((Number(preferredBranch.expectedPoints ?? 0) - Number(oppositeBranch.expectedPoints ?? 0)).toFixed(1))
      : 0,
    placeSwing: preferredBranch && oppositeBranch
      ? Number((Number(oppositeBranch.expectedPlace ?? 0) - Number(preferredBranch.expectedPlace ?? 0)).toFixed(1))
      : 0,
  };
}

function buildNeedRows(seriesItem, memberList, allAssignmentsByUser, currentUserId, series, selectionById, branchSimulationBySeriesId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
  const standings = buildTeamValueStandings(memberList, allAssignmentsByUser, series);
  const standingsById = Object.fromEntries(standings.map((member) => [member.id, member]));
  const roomHomeAvg = averageAssignment(allAssignmentsByUser, homeId);
  const roomAwayAvg = averageAssignment(allAssignmentsByUser, awayId);
  const roomPreferred = roomHomeAvg === roomAwayAvg ? null : roomHomeAvg > roomAwayAvg ? homeAbbr : awayAbbr;
  const roomGap = Math.abs(roomHomeAvg - roomAwayAvg);
  const homeExpected = Number(selectionById?.[homeId]?.expectedPoints ?? 0);
  const awayExpected = Number(selectionById?.[awayId]?.expectedPoints ?? 0);
  const futureGap = Math.abs(homeExpected - awayExpected);
  const leaderWins = Math.max(Number(seriesItem.wins?.home ?? 0), Number(seriesItem.wins?.away ?? 0));
  const seriesLeader =
    Number(seriesItem.wins?.home ?? 0) === Number(seriesItem.wins?.away ?? 0)
      ? null
      : Number(seriesItem.wins?.home ?? 0) > Number(seriesItem.wins?.away ?? 0)
        ? homeAbbr
        : awayAbbr;

  return memberList
    .map((member) => {
      const assignments = allAssignmentsByUser?.[member.id] ?? {};
      const homeValue = Number(assignments?.[homeId] ?? 0);
      const awayValue = Number(assignments?.[awayId] ?? 0);
      const gap = Math.abs(homeValue - awayValue);
      const branchPreference = getBranchOutcomePreference(seriesItem, branchSimulationBySeriesId, member.id, assignments);
      const preferred = branchPreference.preferred ?? (homeValue === awayValue ? "Balanced" : homeValue > awayValue ? homeAbbr : awayAbbr);
      const standing = standingsById[member.id] ?? null;
      const place = Number(standing?.place ?? 99);
      const trailingPack = place > 3;
      const preferredMatchesRoom = preferred !== "Balanced" && roomPreferred && preferred === roomPreferred;
      const preferredOpposesRoom = preferred !== "Balanced" && roomPreferred && preferred !== roomPreferred;
      const preferredIsLeader = preferred !== "Balanced" && seriesLeader && preferred === seriesLeader;
      const placeSwing = branchPreference.placeSwing;
      const winSwing = branchPreference.winSwing;
      const pointsSwing = branchPreference.pointsSwing;

      let need = "Watch";
      if (gap === 0 && futureGap <= 1 && Math.abs(winSwing) < 1.5 && Math.abs(placeSwing) < 0.5) {
        need = "Watch";
      } else if (branchPreference.conflict && Math.abs(winSwing) >= 3) {
        need = "Major pivot";
      } else if (Math.abs(winSwing) >= 6 || Math.abs(placeSwing) >= 1.5) {
        need = "Major pivot";
      } else if (leaderWins >= 3 && (gap >= 3 || Math.abs(winSwing) >= 3)) {
        need = preferredIsLeader ? "Closing pressure" : "Comeback path";
      } else if (preferredOpposesRoom && (gap >= 4 || winSwing >= 3 || placeSwing >= 0.8)) {
        need = trailingPack ? "Differentiate" : "Leverage";
      } else if (preferredMatchesRoom && (gap >= 4 || pointsSwing >= 2)) {
        need = place === 1 ? "Protect lead" : "Hold serve";
      } else if (futureGap >= 4 && (gap <= 3 || winSwing >= 2)) {
        need = "Future setup";
      } else if (gap >= 3 || Math.abs(winSwing) >= 2 || Math.abs(pointsSwing) >= 1.5) {
        need = roomGap >= 4 ? "Room swing" : "Meaningful";
      }

      return {
        id: member.id,
        name: formatMemberName(member, currentUserId),
        preferred,
        gap,
        strength: need,
        rawPreferred: branchPreference.rawPreferred,
        simulationPreferred: branchPreference.simulationPreferred,
        winSwing: Number(winSwing.toFixed(1)),
        placeSwing: Number(placeSwing.toFixed(1)),
      };
    })
    .sort((a, b) => b.winSwing - a.winSwing || b.gap - a.gap || a.name.localeCompare(b.name));
}

function averageAssignment(allAssignmentsByUser, teamId) {
  const values = Object.values(allAssignmentsByUser ?? {})
    .map((assignments) => Number(assignments?.[teamId] ?? 0))
    .filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRootingContextNote(seriesItem, allAssignmentsByUser, currentUserId, branchSimulationBySeriesId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;

  const currentAssignments = allAssignmentsByUser?.[currentUserId] ?? {};
  const yourHomeValue = Number(currentAssignments?.[homeId] ?? 0);
  const yourAwayValue = Number(currentAssignments?.[awayId] ?? 0);
  const roomHomeAvg = averageAssignment(allAssignmentsByUser, homeId);
  const roomAwayAvg = averageAssignment(allAssignmentsByUser, awayId);

  const yourPreferred = yourHomeValue === yourAwayValue ? null : yourHomeValue > yourAwayValue ? homeAbbr : awayAbbr;
  const roomPreferred = roomHomeAvg === roomAwayAvg ? null : roomHomeAvg > roomAwayAvg ? homeAbbr : awayAbbr;
  const yourGap = Math.abs(yourHomeValue - yourAwayValue);
  const roomGap = Math.abs(roomHomeAvg - roomAwayAvg);
  const branchPreference = getBranchOutcomePreference(seriesItem, branchSimulationBySeriesId, currentUserId, currentAssignments);
  const rootSide = branchPreference.preferred ?? yourPreferred;
  const lighterSide = yourPreferred === homeAbbr ? awayAbbr : homeAbbr;
  const placeSwing = branchPreference.placeSwing;
  const winSwing = branchPreference.winSwing;
  const narrativeState = buildSeriesNarrativeState(seriesItem, Math.abs(winSwing), Math.abs(placeSwing));

  if (yourGap === 0 && roomGap === 0) {
    return {
      title: chooseVariant([
        `${homeAbbr}-${awayAbbr} is mostly a watchlist game for the room`,
        `${homeAbbr}-${awayAbbr} is more texture than pressure right now`,
        `${homeAbbr}-${awayAbbr} is not carrying a hard room lean yet`,
      ], ...narrativeSeed(seriesItem, currentUserId, "balanced-title")),
      body: chooseVariant([
        `Neither your board nor the average room board is leaning hard here, so this matchup is more about keeping track of the bracket than about protecting one major exposure. ${narrativeState.stageSentence} The useful question is whether today creates a stronger future-round path than it creates a same-day swing.`,
        `This is a lower-temperature spot. Your board is close to balanced, the room is close to balanced, and the real value is watching whether one branch starts to matter more after the result lands. ${narrativeState.stageSentence}`,
        `There is not a giant same-day rooting signal here. The better read is to treat this as a bracket-shape game: useful to watch, but not one where your board is obviously begging for one side. ${narrativeState.stageSentence}`,
      ], ...narrativeSeed(seriesItem, currentUserId, "balanced-body")),
    };
  }

  if (branchPreference.conflict) {
    const rootClub = teamNarrativeName(rootSide, seriesItem, "club");
    const rootNickname = teamNarrativeName(rootSide, seriesItem, "nickname");
    const rootCity = teamNarrativeName(rootSide, seriesItem, "city");
    const rawClub = teamNarrativeName(yourPreferred, seriesItem, "club");
    const rawCity = teamNarrativeName(yourPreferred, seriesItem, "city");
    const swingMagnitude = Math.abs(winSwing);
    return {
      title: chooseVariant([
        `${rootCity} is the room-relative rooting side, even though you ranked ${rawCity} higher`,
        `${rootCity} is the leverage answer, even with ${rawCity} higher on your board`,
        `Your raw board says ${rawCity}, but the pool-equity read says ${rootCity}`,
        `${rootCity} is the sharper result once the room is part of the equation`,
      ], ...narrativeSeed(seriesItem, currentUserId, "context-conflict-title")),
      body: swingMagnitude >= 8
        ? chooseVariant([
          `${rawClub} are the cleaner immediate-points side because you ranked them above ${rootClub}. But this is not only a points question. ${narrativeState.stageSentence} The room is heavier on ${rawCity} than you are, and your unusual leverage is on ${rootNickname}; the branch sim says ${teamResultPhrase(rootSide, seriesItem)} improves your pool win probability by ${Math.abs(winSwing).toFixed(1)} points versus the other side. For you in this matchup, that is ${rootCity}.`,
          `This is the big-pivot version of the tension. ${rawCity} is the better instant-points side, but the field is more exposed there than you are. ${narrativeState.seriesStage === "late" ? "At this point in the series, that divergence gets louder." : narrativeState.stageSentence} Your cleaner separation is tied to ${rootNickname}, and the branch sim makes that loud: ${Math.abs(winSwing).toFixed(1)} pool-win points toward ${rootCity}.`,
          `On the surface, ${rawCity} look like the easy answer because you ranked them higher. Underneath, the room dynamics bend it the other way. ${narrativeState.stageSentence} The field has more to lose on ${rawCity} than your board does, while your cleaner leverage sits with ${rootNickname}; the branch sim prices that edge at ${Math.abs(winSwing).toFixed(1)} pool-win points. For you in this matchup, that is ${rootCity}.`,
        ], ...narrativeSeed(seriesItem, currentUserId, "context-conflict-large-body"))
        : chooseVariant([
          `${rawClub} are the cleaner immediate-points side because you ranked them above ${rootClub}. The longer-view edge is thinner, but it points the other way: your best room-relative separation is on ${rootNickname}. ${narrativeState.stageSentence} For you in this matchup, that is ${rootCity}.`,
          `On pure points, the first answer is ${rawCity}. On pool equity, it is not. Because your board is less exposed to ${rawCity} than the room is, ${rootCity} becomes the sharper separation side even if the margin is not huge. ${narrativeState.stageSentence} For you in this matchup, that is ${rootCity}.`,
          `${rawCity} still win the quick points argument on your board. The broader pool argument is different. Because the room is more concentrated there than you are, the cleaner upside sits with ${rootNickname}. ${narrativeState.stageSentence} For you in this matchup, that is ${rootCity}.`,
        ], ...narrativeSeed(seriesItem, currentUserId, "context-conflict-modest-body")),
    };
  }

  if (yourPreferred && roomPreferred && yourPreferred === roomPreferred) {
    const preferredClub = teamNarrativeName(yourPreferred, seriesItem, "club");
    const preferredCity = teamNarrativeName(yourPreferred, seriesItem, "city");
    const lighterClub = teamNarrativeName(lighterSide, seriesItem, "club");
    if (yourGap > roomGap + 1) {
      return {
        title: chooseVariant([
          `${preferredCity} helps you, but it is still a relative game`,
          `${preferredCity} is consensus-friendly, with a little extra juice for you`,
          `${preferredCity} helps the room, but your board is louder there`,
          `${preferredCity} is a shared side, but you are carrying the bigger version`,
        ], ...narrativeSeed(seriesItem, currentUserId, "aligned-user-heavy-title")),
        body: chooseVariant([
          `${preferredCity} is not a secret side for the room, but your board is carrying more of it than the average entry. ${narrativeState.stageSentence} That means a win by ${preferredClub} helps you a little more than it helps most people, while a win by ${lighterClub} cuts more directly against your board than it does against the field.`,
          `This is not contrarian, but it is not neutral either. The field is with ${preferredCity}, and you are even more invested than the field. That makes a win by ${preferredClub} useful, while a ${teamResultPhrase(lighterSide, seriesItem)} stings your board more than it stings the average entry.`,
          `${preferredCity} is a shared rooting side, but your board has more weight there than the room average. That means this result is partly protection and partly upside; not a full breakaway, but not empty chalk either.`,
          `The room and your board are lined up on ${preferredCity}, but you are leaning further into it than most entries are. That makes the result helpful in two ways: it protects a side you already like, and it nudges you a bit ahead of the people who are lighter there.`,
        ], ...narrativeSeed(seriesItem, currentUserId, "aligned-user-heavy-body")),
      };
    }

    if (roomGap > yourGap + 1) {
      return {
        title: chooseVariant([
          `${preferredCity} is more defensive than explosive for you`,
          `${preferredCity} is mostly a hold-serve result for your board`,
          `${preferredCity} keeps you aligned, but does not create much daylight`,
          `${preferredCity} is good for you, just not especially loud for you`,
        ], ...narrativeSeed(seriesItem, currentUserId, "aligned-room-heavy-title")),
        body: chooseVariant([
          `You and the room are on the same side, but the room is leaning harder into ${preferredCity} than you are. ${narrativeState.stageSentence} That means a win by ${preferredClub} is more about staying in line with the field than creating separation, while ${lighterClub} winning would damage the room a little more than it damages your board.`,
          `The field has more riding on ${preferredCity} than you do. So while a win by ${preferredClub} still helps your points, it is not the cleanest way to gain ground. The upset path would clip the room a bit harder than it clips your board.`,
          `This is a defensive lean. You do want ${preferredCity}, but mostly because the room wants them too. The more interesting twist is that ${lighterClub} winning would be messier for the field than for your specific board.`,
          `${preferredCity} still cashes for you, but it is doing more public work than private work. The room has the heavier exposure there, so your real edge is that the wrong result would bruise the field a little more than it bruises you.`,
        ], ...narrativeSeed(seriesItem, currentUserId, "aligned-room-heavy-body")),
      };
    }

    return {
      title: chooseVariant([
        `${preferredCity} is the room lean, but not a big separation game`,
        `${preferredCity} is the clean side, not the loud side`,
        `${preferredCity} keeps the board orderly more than it breaks it open`,
        `${preferredCity} matters here more as maintenance than as leverage`,
      ], ...narrativeSeed(seriesItem, currentUserId, "aligned-even-title")),
      body: chooseVariant([
        `You and the room are mostly aligned here, and your exposure is close to the room average. ${narrativeState.stageSentence} That means the main value today is not a giant standings swing; it is avoiding an upset that would scramble the next layer of the bracket and create new pressure elsewhere.`,
        `This is one of those games where the correct side can still be a quiet side. ${preferredCity} helps you, but it helps enough of the room that the bigger value is keeping the board from getting weird.`,
        `There is not much hidden leverage here. Your board and the field are priced similarly, so this matchup is more about keeping the bracket stable than springing a surprise in the standings.`,
        `Nothing about this setup screams separation. Your board and the room are carrying nearly the same shape, so the practical value is preserving bracket order more than inventing a jump in the standings.`,
      ], ...narrativeSeed(seriesItem, currentUserId, "aligned-even-body")),
    };
  }

  if (yourPreferred && roomPreferred && yourPreferred !== roomPreferred) {
    const preferredClub = teamNarrativeName(yourPreferred, seriesItem, "club");
    const roomClub = teamNarrativeName(roomPreferred, seriesItem, "club");
    const preferredCity = teamNarrativeName(yourPreferred, seriesItem, "city");
    const roomCity = teamNarrativeName(roomPreferred, seriesItem, "city");
    return {
      title: chooseVariant([
        `${preferredCity} is a real leverage side for your board`,
        `${preferredCity} is where your board splits from the room`,
        `${preferredCity} gives you a cleaner contrarian lane`,
        `${preferredCity} is the result that actually creates daylight for you`,
      ], ...narrativeSeed(seriesItem, currentUserId, "opposed-title")),
      body: chooseVariant([
        `Your board and the room are pointed in different directions here, and the branch sim treats that as real leverage rather than a cosmetic disagreement. ${narrativeState.stageSentence} If ${preferredClub} come through, the result moves your expected place by ${Math.abs(placeSwing).toFixed(1)} spots and your pool win probability by ${Math.abs(winSwing).toFixed(1)} points.`,
        `Your board and the field are not telling the same story. You have more reason to want ${preferredCity}; the room is more comfortable with ${roomCity}. That gives this game real separation value if ${preferredClub} come through.`,
        `This is a true split read. ${preferredCity} is not just your favorite side; it is the side that pushes against the room's lean toward ${roomCity}. That is why the branch sim treats it as leverage rather than ordinary rooting.`,
        `There is an actual board split here, not just a stylistic one. The room is tilted toward ${roomCity}, while your cleaner equity path runs through ${preferredCity}. That is why this matchup feels live even before the game starts moving.`,
      ], ...narrativeSeed(seriesItem, currentUserId, "opposed-body")),
    };
  }

  if (yourPreferred && !roomPreferred) {
    const preferredClub = teamNarrativeName(yourPreferred, seriesItem, "club");
    const lighterClub = teamNarrativeName(lighterSide, seriesItem, "club");
    return {
      title: chooseVariant([
        `${yourPreferred} matters more to you than it does to the room`,
        `${yourPreferred} is mostly your story, not the room's`,
        `${yourPreferred} is a private board swing more than a public one`,
      ], ...narrativeSeed(seriesItem, currentUserId, "user-only-title")),
      body: chooseVariant([
        `The field is relatively balanced, but your board is not. That makes ${preferredClub} less of a public consensus result and more of a private board result for you. If ${lighterClub} win instead, it does not necessarily wreck the room, but it hits your own construction more directly than it hits most other boards.`,
        `This is one of the cleaner examples of a result that matters more inside your board than across the whole pool. The room is fairly split, but your own setup has more riding on ${preferredClub} than the average entry does.`,
        `${preferredClub} are doing more personal work than room-wide work here. If they win, your board benefits in a way the pool at large does not fully share. If ${lighterClub} win, the damage is more concentrated on you than on the field.`,
      ], ...narrativeSeed(seriesItem, currentUserId, "user-only-body")),
    };
  }

  const roomClub = teamNarrativeName(roomPreferred ?? homeAbbr, seriesItem, "club");
  return {
    title: chooseVariant([
      `${roomPreferred ?? homeAbbr} is the room's clearer side, but you are more balanced`,
      `${roomPreferred ?? homeAbbr} matters more to the field than it does to you`,
      `${roomPreferred ?? homeAbbr} is the public side, while your board stays lighter`,
    ], ...narrativeSeed(seriesItem, currentUserId, "room-only-title")),
    body: chooseVariant([
      `Your board is relatively even here, which means this matchup is less about cashing your own heavy exposure and more about understanding what helps the field. If ${roomClub} win, the average board benefits more than yours does. If the other side wins, it does more to disrupt the field than to damage your own setup.`,
      `This is more of a room-reading game than a personal rooting game. The field has a clearer preference than your board does, so the important question is not what you are protecting, but what outcome pushes the average entry around.`,
      `You are relatively balanced in a matchup where the pool is not. That makes ${roomClub} the public side and leaves you in the more observational seat: the wrong result does not hammer your card first, but it can still reshape the room around you.`,
    ], ...narrativeSeed(seriesItem, currentUserId, "room-only-body")),
  };
}

function TodayBoardImplicationsReport({
  todayGames,
  series,
  implicationRows,
  memberList,
  allAssignmentsByUser,
  currentUserId,
  selectionRows,
  simulationTeamEntries,
  expandedAnalysisId,
}) {
  const now = useMemo(() => new Date(), []);
  const [scenarioPerspectiveId, setScenarioPerspectiveId] = useState(currentUserId ?? memberList[0]?.id ?? "");
  const [scenarioSort, setScenarioSort] = useState({ key: "winProb", direction: "desc" });
  const [needSortBySeriesId, setNeedSortBySeriesId] = useState({});
  const implicationById = useMemo(
    () => Object.fromEntries(implicationRows.map((row) => [row.id, row])),
    [implicationRows]
  );
  const selectionById = useMemo(
    () => Object.fromEntries(selectionRows.map((row) => [row.id, row])),
    [selectionRows]
  );
  const todaySeries = useMemo(() => {
    const byPair = Object.fromEntries(
      series.map((seriesItem) => {
        const key = [
          seriesItem.homeTeam?.id ?? seriesItem.homeTeamId,
          seriesItem.awayTeam?.id ?? seriesItem.awayTeamId,
        ].sort().join("|");
        return [key, seriesItem];
      })
    );

    return todayGames
      .filter((game) => {
        if (game.status === "in_progress") return true;
        if (!game.tipAt) return false;
        const tipDate = new Date(game.tipAt);
        return !Number.isNaN(tipDate.getTime()) && sameCalendarDay(tipDate, now);
      })
      .map((game) => {
        const key = [game.homeTeamId, game.awayTeamId].sort().join("|");
        const seriesItem = byPair[key];
        if (!seriesItem) return null;
        return {
          game,
          seriesItem,
          implication: implicationById[seriesItem.id] ?? null,
        };
      })
      .filter(Boolean);
  }, [todayGames, series, implicationById, now]);

  useEffect(() => {
    if (scenarioPerspectiveId) return;
    if (currentUserId) {
      setScenarioPerspectiveId(currentUserId);
      return;
    }
    if (memberList[0]?.id) {
      setScenarioPerspectiveId(memberList[0].id);
    }
  }, [currentUserId, memberList, scenarioPerspectiveId]);

  const scenarioPerspectiveMember = useMemo(
    () => memberList.find((member) => member.id === scenarioPerspectiveId) ?? memberList.find((member) => member.id === currentUserId) ?? memberList[0] ?? null,
    [currentUserId, memberList, scenarioPerspectiveId]
  );
  const scenarioPerspectiveLabel = scenarioPerspectiveMember ? buildPerspectiveName(scenarioPerspectiveMember, currentUserId) : "You";

  const tomorrowScenarioRows = useMemo(
    () => buildTomorrowScenarioRows(todaySeries, memberList, allAssignmentsByUser, series, currentUserId, simulationTeamEntries, scenarioPerspectiveMember?.id ?? currentUserId),
    [todaySeries, memberList, allAssignmentsByUser, series, currentUserId, simulationTeamEntries, scenarioPerspectiveMember]
  );
  const sortedTomorrowScenarioRows = useMemo(
    () => sortScenarioRows(tomorrowScenarioRows, scenarioSort),
    [tomorrowScenarioRows, scenarioSort]
  );
  const branchSimulationBySeriesId = useMemo(
    () => buildBranchSimulationBySeries(todaySeries.map((entry) => entry.seriesItem), memberList, allAssignmentsByUser, series, simulationTeamEntries),
    [todaySeries, memberList, allAssignmentsByUser, series, simulationTeamEntries]
  );
  const poolImpactBySeriesId = useMemo(
    () => Object.fromEntries(
      todaySeries.map(({ seriesItem }) => [
        seriesItem.id,
        buildPoolImpactStats(seriesItem, memberList, branchSimulationBySeriesId, currentUserId),
      ])
    ),
    [todaySeries, memberList, branchSimulationBySeriesId, currentUserId]
  );
  const poolImpactRankBySeriesId = useMemo(() => {
    const sorted = Object.entries(poolImpactBySeriesId)
      .sort(([, left], [, right]) => right.averageSwing - left.averageSwing);
    return Object.fromEntries(sorted.map(([seriesId], index) => [seriesId, index + 1]));
  }, [poolImpactBySeriesId]);

  if (!todaySeries.length) {
    return (
      <section className="panel nba-reports-hero nba-report-detail-hero nba-briefing-desk-card">
        <div>
          <span className="label">Today&apos;s Briefing</span>
          <h2>Nothing tips today</h2>
          <p className="subtle">This desk sharpens into a true daily briefing when the slate is live. Today there are no active game implications to break down.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="nba-dashboard-list">
      <section className="panel nba-reports-hero nba-report-detail-hero nba-briefing-desk-card">
        <div>
          <span className="label">Today&apos;s Briefing</span>
          <h2>Today&apos;s briefing desk</h2>
          <p className="subtle">A today-specific read of the {todaySeries.length} games on tap: the key intel for each matchup, the deeper board implications underneath, and the room-shape outcomes that matter by tomorrow morning.</p>
        </div>
      </section>

      {todaySeries.map(({ game, seriesItem, implication }) => {
        const needRows = buildNeedRows(seriesItem, memberList, allAssignmentsByUser, currentUserId, series, selectionById, branchSimulationBySeriesId);
        const activeNeedSort = needSortBySeriesId[seriesItem.id] ?? { key: "winSwing", direction: "desc" };
        const sortedNeedRows = sortNeedRows(needRows, activeNeedSort);
        const rootingContext = buildRootingContextNote(seriesItem, allAssignmentsByUser, currentUserId, branchSimulationBySeriesId);
        const simulationRows = buildSimulationSwingRows(seriesItem, branchSimulationBySeriesId, currentUserId);
        const poolImpactStats = poolImpactBySeriesId[seriesItem.id] ?? buildPoolImpactStats(seriesItem, memberList, branchSimulationBySeriesId, currentUserId);
        const poolImpactRank = poolImpactRankBySeriesId[seriesItem.id] ?? todaySeries.length;
        const overviewRows = buildGameOverviewRows(
          seriesItem,
          game,
          simulationRows,
          poolImpactStats,
          poolImpactRank,
          todaySeries.length
        );
        const poolImpactNote = buildPoolImpactNote(seriesItem, needRows, poolImpactStats, poolImpactRank, todaySeries.length);
        const gameHomeAbbr = game.homeAbbreviation ?? seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
        const gameAwayAbbr = game.awayAbbreviation ?? seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
        const analysisAnchorId = `analysis-${seriesItem.id}`;

        return (
          <article
            className="detail-card inset-card nba-briefing-game-card"
            key={seriesItem.id}
            id={analysisAnchorId}
            style={buildMatchupAccentStyle(seriesItem)}
          >
            <div className="panel-header">
              <div>
                <span className="micro-label">Today at {formatTipTime(game.tipAt)}</span>
                <h3>{gameAwayAbbr} at {gameHomeAbbr}</h3>
                <p className="subtle">{formatSeriesStatus(seriesItem)}</p>
              </div>
            </div>
            <div className="nba-report-metric-wrap">
              <div className="nba-report-metric-table" role="table" aria-label="Tonight game summary">
                <div className="nba-report-metric-row nba-report-metric-row-head" role="row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <span className="nba-report-metric-cell" role="columnheader">Tip</span>
                  <span className="nba-report-metric-cell" role="columnheader">Current line</span>
                  <span className="nba-report-metric-cell" role="columnheader">ESPN Matchup Predictor</span>
                  <span className="nba-report-metric-cell" role="columnheader">Board lean</span>
                </div>
                <div className="nba-report-metric-row" role="row" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                  <strong className="nba-report-metric-cell nba-report-metric-value" role="cell">{formatTipTime(game.tipAt)}</strong>
                  <strong className="nba-report-metric-cell nba-report-metric-value" role="cell">{buildCurrentLineLabel(game)}</strong>
                  <strong className="nba-report-metric-cell nba-report-metric-value" role="cell">{buildPredictorLabel(game)}</strong>
                  <strong className="nba-report-metric-cell nba-report-metric-value" role="cell">{implication?.preferredTeam ?? "Balanced"}</strong>
                </div>
              </div>
            </div>
            <details
              className="detail-card inset-card nba-report-game-details nba-briefing-deep-card"
              open={expandedAnalysisId === analysisAnchorId ? true : undefined}
            >
              <summary>
                <span className="nba-report-game-details-label">
                  <span className="nba-report-game-details-toggle" aria-hidden="true">+</span>
                  <span className="micro-label">Detailed Analysis</span>
                </span>
              </summary>
              <div className="nba-report-game-details-body">
                <article className="detail-card inset-card nba-briefing-table-card">
                  <span className="micro-label">Game importance</span>
                  <div className="leaderboard-table nba-dashboard-leaderboard-table">
                    <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                      {overviewRows.map((row) => (
                        <span key={row.label}>{row.label}</span>
                      ))}
                    </div>
                    <div className="leaderboard-row nba-dashboard-leaderboard-row" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                      {overviewRows.map((row) => (
                        <span key={row.label}>{row.value}</span>
                      ))}
                    </div>
                  </div>
                </article>

                <article className="detail-card inset-card nba-briefing-narrative-card">
                  <span className="micro-label">Your board read</span>
                  <strong>{rootingContext.title}</strong>
                  <p>{rootingContext.body}</p>
                </article>

                <article className="detail-card inset-card nba-briefing-table-card">
                  <span className="micro-label">Simulation swing</span>
                  <div className="leaderboard-table nba-dashboard-leaderboard-table">
                    <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "1fr 0.75fr 0.75fr 0.75fr" }}>
                      <span>Outcome</span>
                      <span>Final pts</span>
                      <span>Pool win%</span>
                      <span>Win% swing</span>
                    </div>
                    {simulationRows.map((row) => (
                      <div className="leaderboard-row nba-dashboard-leaderboard-row" key={`${seriesItem.id}-${row.label}`} style={{ gridTemplateColumns: "1fr 0.75fr 0.75fr 0.75fr" }}>
                        <span>{row.label}</span>
                        <span>{row.expectedPoints ?? "—"}</span>
                        <span>{row.winProbability != null ? `${row.winProbability}%` : "—"}</span>
                        <span>{formatSwing(row.winProbabilitySwing)}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="detail-card inset-card nba-briefing-narrative-card">
                  <span className="micro-label">Pool-wide pressure</span>
                  <strong>{poolImpactNote.title}</strong>
                  <p>{poolImpactNote.body}</p>
                </article>

                <article className="detail-card inset-card nba-briefing-table-card">
                  <span className="micro-label">Who needs what today</span>
                  <div className="leaderboard-table nba-dashboard-leaderboard-table">
                    <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "minmax(0,1.2fr) 0.7fr 0.5fr 0.7fr 0.7fr" }}>
                      <span>Player</span>
                      <button
                        type="button"
                        className="nba-inline-sort"
                        onClick={() => setNeedSortBySeriesId((current) => ({
                          ...current,
                          [seriesItem.id]: nextScenarioSortState(current[seriesItem.id] ?? { key: "winSwing", direction: "desc" }, "preferred", "asc"),
                        }))}
                      >
                        {renderScenarioSortLabel(activeNeedSort, "preferred", "Side")}
                      </button>
                      <span>Gap</span>
                      <button
                        type="button"
                        className="nba-inline-sort"
                        onClick={() => setNeedSortBySeriesId((current) => ({
                          ...current,
                          [seriesItem.id]: nextScenarioSortState(current[seriesItem.id] ?? { key: "winSwing", direction: "desc" }, "winSwing", "desc"),
                        }))}
                      >
                        {renderScenarioSortLabel(activeNeedSort, "winSwing", "Swing")}
                      </button>
                      <span>Need</span>
                    </div>
                    {sortedNeedRows.map((row) => (
                      <div className={`leaderboard-row nba-dashboard-leaderboard-row ${row.id === currentUserId ? "is-current" : ""}`} key={`${seriesItem.id}-${row.id}`} style={{ gridTemplateColumns: "minmax(0,1.2fr) 0.7fr 0.5fr 0.7fr 0.7fr" }}>
                        <span>{row.name}</span>
                        <span>{row.preferred}</span>
                        <span>{row.gap}</span>
                        <span>{formatSwing(row.winSwing)}</span>
                        <span>{row.strength}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </details>
          </article>
        );
      })}

      <article className="detail-card inset-card nba-briefing-scenarios-card">
        <div className="panel-header">
          <div>
            <span className="micro-label">Tomorrow morning scenarios</span>
            <h3>How the room looks if today breaks different ways</h3>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <label className="micro-label" htmlFor="scenario-perspective-select">Perspective</label>
            <select
              id="scenario-perspective-select"
              className="input"
              value={scenarioPerspectiveMember?.id ?? ""}
              onChange={(event) => setScenarioPerspectiveId(event.target.value)}
            >
              {memberList.map((member) => (
                <option key={member.id} value={member.id}>
                  {buildPerspectiveName(member, currentUserId)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="leaderboard-table nba-dashboard-leaderboard-table">
          <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "1.4fr 0.5fr 0.5fr 0.6fr 1.6fr" }}>
            <button type="button" className="nba-inline-sort" onClick={() => setScenarioSort((current) => nextScenarioSortState(current, "label", "asc"))}>
              {renderScenarioSortLabel(scenarioSort, "label", "Winners")}
            </button>
            <button type="button" className="nba-inline-sort" onClick={() => setScenarioSort((current) => nextScenarioSortState(current, "place", "asc"))}>
              {renderScenarioSortLabel(scenarioSort, "place", `${scenarioPerspectiveLabel} place`)}
            </button>
            <button type="button" className="nba-inline-sort" onClick={() => setScenarioSort((current) => nextScenarioSortState(current, "points", "desc"))}>
              {renderScenarioSortLabel(scenarioSort, "points", `${scenarioPerspectiveLabel} pts`)}
            </button>
            <button type="button" className="nba-inline-sort" onClick={() => setScenarioSort((current) => nextScenarioSortState(current, "winProb", "desc"))}>
              {renderScenarioSortLabel(scenarioSort, "winProb", `${scenarioPerspectiveLabel} win%`)}
            </button>
            <span>Projected top three</span>
          </div>
          {sortedTomorrowScenarioRows.map((row) => (
            <div className="leaderboard-row nba-dashboard-leaderboard-row" key={row.key} style={{ gridTemplateColumns: "1.4fr 0.5fr 0.5fr 0.6fr 1.6fr" }}>
              <span>{row.label}</span>
              <span>{row.perspectivePlace ? ordinal(row.perspectivePlace) : "—"}</span>
              <span>{row.perspectivePoints}</span>
              <span>{row.perspectiveWinProb}%</span>
              <span>{row.leaders.join(" · ")}</span>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function ReportSectionBrowser({ sections, reportLabel, reportTitle, reportBody, reportCue }) {
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
      <section className="panel nba-reports-hero nba-report-browser-hero nba-report-browser-hero-compact">
        <div className="nba-report-browser-copy nba-report-browser-copy-compact">
          <span className="label">{reportLabel}</span>
          <h2>{reportTitle}</h2>
          <p className="subtle">
            {reportBody}
            {reportCue ? ` ${reportCue}` : ""}
          </p>
          <div className="nba-report-browser-actions">
            <label className="nba-report-browser-select-wrap">
              <span className="micro-label">Jump to section</span>
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
          </div>
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
      ? `${topRisk?.teamLabel ?? "Your priciest slot"} is still one of the clearest places where the board may be asking too much from a slot, while ${topUpside?.teamLabel ?? "your cheapest upside team"} is the best example of a team that may deserve a little more respect. This page is about getting the assignments right before lock, not chasing every last decimal.`
      : "This page is about assignment discipline before lock: where a slot may be too aggressive, where the board still sees cheap upside, and which teams are probably fine where they are.",
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

function SlotFitColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats, roundOneSeriesByTeamId }) {
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
        <DecisionCallout reportKey="slot-fits" row={row} />
        <ReportMetricsTable metrics={buildMetricPairs("slot-fits", row)} ariaLabel="Best slot fit metrics" />
        <ScoringPathMatrix row={row} seriesItem={roundOneSeriesByTeamId[row.id]} />
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
            title="Where are your strongest slots carrying the heaviest burden?"
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
    />
  );
}

function StrategicMoveColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats, roundOneSeriesByTeamId }) {
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
                  <DecisionCallout reportKey="strategic-moves" row={row} />
                  <ReportMetricsTable metrics={buildMetricPairs("strategic-moves", row)} ariaLabel="Strategic move metrics" />
                  <ScoringPathMatrix row={row} seriesItem={roundOneSeriesByTeamId[row.id]} />
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
    />
  );
}

function ModelGapColumns({ rows, reportLabel, reportTitle, reportBody, reportCue, summaryStats, roundOneSeriesByTeamId }) {
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
        <DecisionCallout reportKey="model-gaps" row={row} />
        <ReportMetricsTable metrics={buildMetricPairs("model-gaps", row)} ariaLabel="Market versus model metrics" />
        <ScoringPathMatrix row={row} seriesItem={roundOneSeriesByTeamId[row.id]} />
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
            description="These are the teams where the model is more optimistic than the market read. They are often the more interesting pre-lock second looks."
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
            title="Where is the market more confident?"
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
    />
  );
}

export default function TeamValueReportDetailView() {
  const { reportKey } = useParams();
  const location = useLocation();
  const { profile } = useAuth();
  const { memberList } = usePool();
  const { seriesByRound, teamsById, series } = usePlayoffData();
  const playoffTeams = getRoundOneTeamsFromData(seriesByRound, teamsById);
  const { allAssignmentsByUser, syncedUserIds } = useTeamValueBoard(playoffTeams);
  const { games: todayGames } = useEspnTodayGames();
  const syncedUserIdSet = useMemo(() => new Set(syncedUserIds), [syncedUserIds]);
  const reportMembers = useMemo(
    () => memberList.filter((member) => syncedUserIdSet.has(member.id)),
    [memberList, syncedUserIdSet]
  );
  const reportState = buildTeamValueReports({
    profileId: profile?.id,
    memberList: reportMembers,
    allAssignmentsByUser,
    seriesByRound,
    teamsById,
    series,
  });
  const report = reportState.reports[reportKey];
  const roundOneSeriesByTeamId = useMemo(() => {
    const map = {};
    for (const seriesItem of seriesByRound.round_1 ?? []) {
      const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
      const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
      if (homeId) map[homeId] = seriesItem;
      if (awayId) map[awayId] = seriesItem;
    }
    return map;
  }, [seriesByRound]);

  if (!report || !reportState.visibleReportKeys.includes(reportKey)) {
    return (
      <div className="report-back-shell">
        <a className="back-link" href="/dashboard">← Back to Dashboard</a>
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
  const groupedInstruction = buildDetailInstruction(report.key);
  const groupedReport = ["slot-fits", "strategic-moves", "model-gaps"].includes(report.key);
  const customHeroReport = report.key === "board-implications";
  const selectionRows = useMemo(
    () => buildTeamSelectionRows(playoffTeams, seriesByRound, allAssignmentsByUser, profile?.id, reportMembers.length),
    [playoffTeams, seriesByRound, allAssignmentsByUser, profile?.id, reportMembers.length]
  );
  const implicationRows = reportState.reports["board-implications"]?.rows ?? [];
  const expandedAnalysisId = location.hash?.replace(/^#/, "") ?? "";

  return (
    <div className="report-back-shell">
      <a className="back-link" href="/dashboard">← Back to Dashboard</a>

      {!groupedReport && !customHeroReport ? (
        <section className="panel nba-reports-hero nba-report-detail-hero">
          <div>
            <span className="label">{report.label}</span>
            <h2>{report.title}</h2>
            <p className="subtle">
              {reportBody}
              {voiceFrame.cue ? ` ${voiceFrame.cue}` : ""}
            </p>
          </div>
        </section>
      ) : null}

      <section className="simple-shell">
        {report.key === "slot-fits" ? (
          <SlotFitColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={groupedInstruction}
            reportCue=""
            summaryStats={summaryStats}
            roundOneSeriesByTeamId={roundOneSeriesByTeamId}
          />
        ) : report.key === "strategic-moves" ? (
          <StrategicMoveColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={groupedInstruction}
            reportCue=""
            summaryStats={summaryStats}
            roundOneSeriesByTeamId={roundOneSeriesByTeamId}
          />
        ) : report.key === "model-gaps" ? (
          <ModelGapColumns
            rows={report.rows}
            reportLabel={report.label}
            reportTitle={report.title}
            reportBody={groupedInstruction}
            reportCue=""
            summaryStats={summaryStats}
            roundOneSeriesByTeamId={roundOneSeriesByTeamId}
          />
        ) : report.key === "board-implications" ? (
          <TodayBoardImplicationsReport
            todayGames={todayGames}
            series={series}
            implicationRows={implicationRows}
            memberList={reportMembers}
            allAssignmentsByUser={allAssignmentsByUser}
            currentUserId={profile?.id}
            selectionRows={selectionRows}
            simulationTeamEntries={playoffTeams}
            expandedAnalysisId={expandedAnalysisId}
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
                <DecisionCallout reportKey={report.key} row={row} />
                <ReportMetricsTable metrics={buildMetricPairs(report.key, row)} ariaLabel={`${report.title} metrics`} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
