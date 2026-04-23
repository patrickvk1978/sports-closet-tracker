import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { useEspnTodayGames } from "../hooks/useEspnTodayGames";
import { getDisplayRankFromValue } from "../lib/teamValueGame";
import { buildSeriesScoringPathMatrix, buildTeamSelectionRows, buildTeamValueStandingsWithOdds, getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import { buildTeamValueReports } from "../lib/teamValueReports";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

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
              `Hold it if you still trust the clinching ceiling enough to justify the slot.`,
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
              `Leave it if you still prefer the safer path and shorter route to the clincher.`,
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

function punctuateSentence(value) {
  if (!value) return "";
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
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
                Sort by outcome, points, or odds to see how this team behaves at Rank {rank}. Odds reflect the {label.toLowerCase()} view of each Round 1 path.
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
  const conference = seriesItem.conference === "west" ? "West" : "East";
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

function buildScenarioStandings(memberList, allAssignmentsByUser, series, winnersBySeriesId) {
  const simulatedSeries = series.map((seriesItem) => {
    const winnerId = winnersBySeriesId[seriesItem.id];
    return winnerId ? cloneSeriesWithSingleWinner(seriesItem, winnerId) : seriesItem;
  });
  return buildTeamValueStandingsWithOdds(memberList, allAssignmentsByUser, simulatedSeries);
}

function buildTomorrowScenarioRows(todaySeries, memberList, allAssignmentsByUser, allSeries, currentUserId) {
  if (!todaySeries.length) return [];
  const options = todaySeries.map((seriesItem) => {
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

  return combinations.map((combo) => {
    const winnersBySeriesId = Object.fromEntries(combo.map((entry) => [entry.seriesId, entry.winnerId]));
    const standings = buildScenarioStandings(memberList, allAssignmentsByUser, allSeries, winnersBySeriesId);
    const currentMember = standings.find((entry) => entry.id === currentUserId) ?? null;
    const leaders = standings.slice(0, 3).map((entry) => `${formatMemberName(entry, currentUserId)} ${entry.summary.totalPoints}`);
    return {
      key: combo.map((entry) => entry.label).join("-"),
      label: combo.map((entry) => entry.label).join(", "),
      yourPlace: currentMember?.place ?? null,
      yourPoints: currentMember?.summary.totalPoints ?? 0,
      yourWinProb: currentMember?.winProbability ?? 0,
      leaders,
    };
  });
}

function buildNeedRows(seriesItem, memberList, allAssignmentsByUser, currentUserId) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
  const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;

  return memberList
    .map((member) => {
      const assignments = allAssignmentsByUser?.[member.id] ?? {};
      const homeValue = Number(assignments?.[homeId] ?? 0);
      const awayValue = Number(assignments?.[awayId] ?? 0);
      const gap = Math.abs(homeValue - awayValue);
      const preferred = homeValue === awayValue ? "Balanced" : homeValue > awayValue ? homeAbbr : awayAbbr;
      return {
        id: member.id,
        name: formatMemberName(member, currentUserId),
        preferred,
        gap,
        strength: gap >= 6 ? "Urgent" : gap >= 3 ? "Meaningful" : gap > 0 ? "Light" : "Balanced",
      };
    })
    .sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name));
}

function buildFuturePathNote(seriesItem, selectionById, currentAssignments) {
  const homeId = seriesItem.homeTeam?.id ?? seriesItem.homeTeamId;
  const awayId = seriesItem.awayTeam?.id ?? seriesItem.awayTeamId;
  const home = selectionById[homeId];
  const away = selectionById[awayId];
  const homeValue = Number(currentAssignments?.[homeId] ?? 0);
  const awayValue = Number(currentAssignments?.[awayId] ?? 0);
  const preferred = homeValue >= awayValue ? home : away;
  const other = homeValue >= awayValue ? away : home;

  return {
    title: preferred && other
      ? `${preferred.abbreviation} opens the stronger future path for your board`
      : "Future-round path still depends on tonight",
    body: preferred && other
      ? `${preferred.abbreviation} is carrying ${preferred.expectedPoints} expected points from here versus ${other.expectedPoints} for ${other.abbreviation}. If tonight nudges this series toward ${preferred.abbreviation}, the future-round ceiling stays friendlier for you.`
      : "The real future-round question is which side still leaves you with the stronger live expected-points path after tonight settles.",
  };
}

function averageAssignment(allAssignmentsByUser, teamId) {
  const values = Object.values(allAssignmentsByUser ?? {})
    .map((assignments) => Number(assignments?.[teamId] ?? 0))
    .filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildRootingContextNote(seriesItem, allAssignmentsByUser, currentUserId) {
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
  const lighterSide = yourPreferred === homeAbbr ? awayAbbr : homeAbbr;

  if (yourGap === 0 && roomGap === 0) {
    return {
      title: `${homeAbbr}-${awayAbbr} is mostly a watchlist game for the room`,
      body: `Neither your board nor the average room board is leaning hard here, so this matchup is more about keeping track of the bracket than about protecting one major exposure. The useful question is whether tonight creates a stronger future-round path than it creates a same-night swing.`,
    };
  }

  if (yourPreferred && roomPreferred && yourPreferred === roomPreferred) {
    if (yourGap > roomGap + 1) {
      return {
        title: `${yourPreferred} helps you, but it is still a relative game`,
        body: `The room wants ${yourPreferred} too, so the interesting question is not just “does ${yourPreferred} help?” It does. The more useful read is that you are heavier on ${yourPreferred} than the average board is, which means a ${yourPreferred} win helps you a little more than it helps most people. The flip side is that an upset would cut more directly against your board than it would against the room.`,
      };
    }

    if (roomGap > yourGap + 1) {
      return {
        title: `${yourPreferred} is more defensive than explosive for you`,
        body: `You and the room are on the same side, but the room is leaning harder into ${yourPreferred} than you are. That means a ${yourPreferred} win is more about staying in line with the field than creating separation, while the other side winning would damage the room a little more than it damages your board.`,
      };
    }

    return {
      title: `${yourPreferred} is the room lean, but not a big separation game`,
      body: `You and the room are mostly aligned here, and your exposure is close to the room average. That means the main value of tonight is not a giant standings swing; it is avoiding an upset that would scramble the next layer of the bracket and create new pressure elsewhere.`,
    };
  }

  if (yourPreferred && roomPreferred && yourPreferred !== roomPreferred) {
    return {
      title: `${yourPreferred} is a real leverage side for your board`,
      body: `This is the kind of game where the obvious rooting interest is actually the right one: you are tilted toward ${yourPreferred}, while the room leans ${roomPreferred}. A ${yourPreferred} win creates separation for you immediately, and a ${roomPreferred} win helps the side the field is already carrying more confidently.`,
    };
  }

  if (yourPreferred && !roomPreferred) {
    return {
      title: `${yourPreferred} matters more to you than it does to the room`,
      body: `The field is relatively balanced, but your board is not. That makes ${yourPreferred} less of a public consensus result and more of a private board result for you. If ${lighterSide} wins instead, it does not necessarily wreck the room, but it hits your own construction more directly than it hits most other boards.`,
    };
  }

  return {
    title: `${roomPreferred ?? homeAbbr} is the room's clearer side, but you are more balanced`,
    body: `Your board is relatively even here, which means this matchup is less about cashing your own heavy exposure and more about understanding what helps the field. If the room-favored side wins, the average board benefits more than yours does. If the other side wins, it does more to disrupt the field than to damage your own setup.`,
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
  expandedAnalysisId,
}) {
  const now = useMemo(() => new Date(), []);
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

  const tomorrowScenarioRows = useMemo(
    () => buildTomorrowScenarioRows(todaySeries.map((entry) => entry.seriesItem), memberList, allAssignmentsByUser, series, currentUserId),
    [todaySeries, memberList, allAssignmentsByUser, series, currentUserId]
  );

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
        const needRows = buildNeedRows(seriesItem, memberList, allAssignmentsByUser, currentUserId);
        const futureNote = buildFuturePathNote(seriesItem, selectionById, allAssignmentsByUser?.[currentUserId] ?? {});
        const rootingContext = buildRootingContextNote(seriesItem, allAssignmentsByUser, currentUserId);
        const homeAbbr = seriesItem.homeTeam?.abbreviation ?? seriesItem.homeTeamId;
        const awayAbbr = seriesItem.awayTeam?.abbreviation ?? seriesItem.awayTeamId;
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
                <h3>{awayAbbr} at {homeAbbr}</h3>
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
                <p className="nba-briefing-analysis-copy">
                  <span className="nba-briefing-analysis-lead">
                    {punctuateSentence(implication?.headline ?? `${homeAbbr}-${awayAbbr} is on tap today.`)}
                  </span>
                  {" "}
                  <span>{implication?.body ?? "This game has direct point and leverage consequences across the room."}</span>
                </p>
                <article className="detail-card inset-card">
                  <span className="micro-label">Who needs what today</span>
                  <div className="leaderboard-table nba-dashboard-leaderboard-table">
                    <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "minmax(0,1.2fr) 0.8fr 0.6fr 0.8fr" }}>
                      <span>Player</span>
                      <span>Side</span>
                      <span>Gap</span>
                      <span>Need</span>
                    </div>
                    {needRows.map((row) => (
                      <div className={`leaderboard-row nba-dashboard-leaderboard-row ${row.id === currentUserId ? "is-current" : ""}`} key={`${seriesItem.id}-${row.id}`} style={{ gridTemplateColumns: "minmax(0,1.2fr) 0.8fr 0.6fr 0.8fr" }}>
                        <span>{row.name}</span>
                        <span>{row.preferred}</span>
                        <span>{row.gap}</span>
                        <span>{row.strength}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="detail-card inset-card">
                  <span className="micro-label">Context that matters</span>
                  <strong>{rootingContext.title}</strong>
                  <p>{rootingContext.body}</p>
                </article>

                <article className="detail-card inset-card">
                  <span className="micro-label">Future-round pressure</span>
                  <strong>{futureNote.title}</strong>
                  <p>{futureNote.body}</p>
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
            <h3>How the room looks if tonight breaks different ways</h3>
          </div>
        </div>
        <div className="leaderboard-table nba-dashboard-leaderboard-table">
          <div className="leaderboard-head nba-dashboard-leaderboard-head" style={{ gridTemplateColumns: "1.4fr 0.5fr 0.5fr 0.6fr 1.6fr" }}>
            <span>Winners</span>
            <span>Your place</span>
            <span>Your pts</span>
            <span>Win%</span>
            <span>Projected top three</span>
          </div>
          {tomorrowScenarioRows.map((row) => (
            <div className="leaderboard-row nba-dashboard-leaderboard-row" key={row.key} style={{ gridTemplateColumns: "1.4fr 0.5fr 0.5fr 0.6fr 1.6fr" }}>
              <span>{row.label}</span>
              <span>{row.yourPlace ? ordinal(row.yourPlace) : "—"}</span>
              <span>{row.yourPoints}</span>
              <span>{row.yourWinProb}%</span>
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
  const { allAssignmentsByUser } = useTeamValueBoard(playoffTeams);
  const { games: todayGames } = useEspnTodayGames();
  const reportState = buildTeamValueReports({
    profileId: profile?.id,
    memberList,
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
    () => buildTeamSelectionRows(playoffTeams, seriesByRound, allAssignmentsByUser, profile?.id, memberList.length),
    [playoffTeams, seriesByRound, allAssignmentsByUser, profile?.id, memberList.length]
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
            memberList={memberList}
            allAssignmentsByUser={allAssignmentsByUser}
            currentUserId={profile?.id}
            selectionRows={selectionRows}
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
