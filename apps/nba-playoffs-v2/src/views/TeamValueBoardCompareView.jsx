import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PLAYOFF_SERIES } from "../data/playoffData";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { usePool } from "../hooks/usePool";
import { useTeamValueBoard } from "../hooks/useTeamValueBoard";
import { getRoundOneTeamsFromData } from "../lib/teamValuePreview";
import {
  buildBoardComparisonPressureRows,
  buildBoardComparisonRows,
  buildBoardComparisonSummary,
} from "../lib/teamValueBoardCompare";
import { getTeamValuePhase } from "../lib/teamValueReports";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

function formatName(member) {
  return member?.displayName ?? member?.name ?? "Unknown";
}

function formatCompareName(member, currentUserId) {
  if (!member) return "Unknown";
  return member.id === currentUserId ? "You" : formatName(member);
}

function resolveDisplayTeams(series, fallbackSeries, teamsById) {
  const currentHomeId = series?.homeTeam?.id ?? series?.homeTeamId ?? null;
  const currentAwayId = series?.awayTeam?.id ?? series?.awayTeamId ?? null;
  const currentHomeTeam =
    series?.homeTeam ?? (currentHomeId ? teamsById?.[currentHomeId] ?? null : null);
  const currentAwayTeam =
    series?.awayTeam ?? (currentAwayId ? teamsById?.[currentAwayId] ?? null : null);

  if (currentHomeId && currentAwayId && currentHomeId !== currentAwayId) {
    return {
      homeTeam: currentHomeTeam,
      awayTeam: currentAwayTeam,
    };
  }

  const fallbackHomeId = fallbackSeries?.homeTeamId ?? currentHomeId;
  const fallbackAwayId = fallbackSeries?.awayTeamId ?? currentAwayId;
  return {
    homeTeam: fallbackHomeId ? teamsById?.[fallbackHomeId] ?? currentHomeTeam ?? null : currentHomeTeam,
    awayTeam: fallbackAwayId ? teamsById?.[fallbackAwayId] ?? currentAwayTeam ?? null : currentAwayTeam,
  };
}

function getSeriesLabel(series, fallbackSeries, teamsById) {
  const { homeTeam, awayTeam } = resolveDisplayTeams(series, fallbackSeries, teamsById);
  return `${homeTeam?.abbreviation ?? series?.homeTeamId ?? "TBD"} vs ${awayTeam?.abbreviation ?? series?.awayTeamId ?? "TBD"}`;
}

function buildPressureCopy(item, leftMember, rightMember, currentUserId, seriesLabel, displayTeams) {
  if (!item) return null;
  const leftName = formatName(leftMember);
  const rightName = formatName(rightMember);
  const leftIsCurrent = leftMember?.id === currentUserId;
  const rightIsCurrent = rightMember?.id === currentUserId;
  const leftFavoredAbbr =
    item.leftNet === 0
      ? null
      : item.leftNet > 0
        ? displayTeams?.homeTeam?.abbreviation ?? item.series.homeTeam?.abbreviation
        : displayTeams?.awayTeam?.abbreviation ?? item.series.awayTeam?.abbreviation;
  const rightFavoredAbbr =
    item.rightNet === 0
      ? null
      : item.rightNet > 0
        ? displayTeams?.homeTeam?.abbreviation ?? item.series.homeTeam?.abbreviation
        : displayTeams?.awayTeam?.abbreviation ?? item.series.awayTeam?.abbreviation;

  if (item.swing > 0 && leftFavoredAbbr) {
    return {
      label: leftIsCurrent ? "Best rooting edge for you" : `Best rooting edge for ${leftName}`,
      headline: `${leftFavoredAbbr} is the strongest swing toward ${leftIsCurrent ? "you" : leftName}.`,
      body: `${leftName} is ${item.swingMagnitude} slots heavier here than ${rightName}. If ${leftFavoredAbbr} keeps winning, this is one of the clearest ways for ${leftIsCurrent ? "you" : leftName} to separate.`,
      seriesLabel,
    };
  }

  if (item.swing < 0 && rightFavoredAbbr) {
    const targetLabel = rightIsCurrent ? "you" : rightName;
    const defenderLabel = leftIsCurrent ? "you" : leftName;
    return {
      label: leftIsCurrent ? "Biggest pressure point against you" : `Pressure point for ${rightName}`,
      headline: `${rightFavoredAbbr} is the cleanest route for ${targetLabel}.`,
      body: `${rightName} is ${item.swingMagnitude} slots heavier here than ${leftName}. If ${rightFavoredAbbr} keeps winning, it puts the most direct pressure on ${defenderLabel}.`,
      seriesLabel,
    };
  }

  return {
    label: "Most balanced swing",
    headline: `${seriesLabel} is closer to neutral.`,
    body: `${leftName} and ${rightName} are carrying this series in a similar way, so it matters less as a direct head-to-head swing.`,
    seriesLabel,
  };
}

function buildConflictCopy(item, leftMember, rightMember, seriesLabel, displayTeams) {
  if (!item) return null;
  const leftName = formatName(leftMember);
  const rightName = formatName(rightMember);
  const leftPreferred =
    item.leftNet === 0
      ? null
      : item.leftNet > 0
        ? displayTeams?.homeTeam?.abbreviation ?? item.series.homeTeam?.abbreviation
        : displayTeams?.awayTeam?.abbreviation ?? item.series.awayTeam?.abbreviation;
  const rightPreferred =
    item.rightNet === 0
      ? null
      : item.rightNet > 0
        ? displayTeams?.homeTeam?.abbreviation ?? item.series.homeTeam?.abbreviation
        : displayTeams?.awayTeam?.abbreviation ?? item.series.awayTeam?.abbreviation;

  if (!leftPreferred || !rightPreferred) {
    return null;
  }

  if (leftPreferred === rightPreferred) {
    return {
      label: "Shared swing series",
      headline: `${leftPreferred} matters to both boards.`,
      body: `${leftName} and ${rightName} are both leaning ${leftPreferred} here. The question is not the side, but which board is carrying more of that result.`,
      seriesLabel,
    };
  }

  return {
    label: "Most divided series",
    headline: `${leftPreferred} vs ${rightPreferred} is the sharpest split.`,
    body: `${leftName} is leaning ${leftPreferred} while ${rightName} is leaning ${rightPreferred}. This is the cleanest series to watch if you want to see the board disagreement play out live.`,
    seriesLabel,
  };
}

export default function TeamValueBoardCompareView() {
  const { profile, session } = useAuth();
  const { memberList, settingsForPool, pool } = usePool();
  const { currentRound, seriesByRound, teamsById } = usePlayoffData();
  const baseSeriesById = useMemo(() => Object.fromEntries(PLAYOFF_SERIES.map((item) => [item.id, item])), []);
  const playoffTeams = useMemo(() => getRoundOneTeamsFromData(seriesByRound, teamsById), [seriesByRound, teamsById]);
  const { allAssignmentsByUser } = useTeamValueBoard(playoffTeams);
  const currentUserId = session?.user?.id ?? profile?.id ?? null;
  const phase = getTeamValuePhase(settingsForPool(pool));
  const canViewRoom = phase === "post_lock" || Boolean(profile?.is_admin);
  const [searchParams, setSearchParams] = useSearchParams();

  const leftParam = searchParams.get("left") ?? currentUserId ?? "";
  const rightParam = searchParams.get("right") ?? memberList.find((member) => member.id !== currentUserId)?.id ?? "";

  const leftMember = memberList.find((member) => member.id === leftParam) ?? memberList.find((member) => member.id === currentUserId) ?? memberList[0] ?? null;
  const rightMember = memberList.find((member) => member.id === rightParam && member.id !== leftMember?.id)
    ?? memberList.find((member) => member.id !== leftMember?.id)
    ?? null;

  useEffect(() => {
    if (!leftMember || !rightMember) return;
    const nextLeft = leftMember.id;
    const nextRight = rightMember.id;
    if (leftParam !== nextLeft || rightParam !== nextRight) {
      setSearchParams({ left: nextLeft, right: nextRight }, { replace: true });
    }
  }, [leftMember, leftParam, rightMember, rightParam, setSearchParams]);

  const leftAssignments = leftMember ? allAssignmentsByUser?.[leftMember.id] ?? {} : {};
  const rightAssignments = rightMember ? allAssignmentsByUser?.[rightMember.id] ?? {} : {};
  const rows = useMemo(
    () => buildBoardComparisonRows(playoffTeams, leftAssignments, rightAssignments),
    [leftAssignments, playoffTeams, rightAssignments]
  );
  const summary = useMemo(() => buildBoardComparisonSummary(rows), [rows]);
  const pressureRows = useMemo(
    () => buildBoardComparisonPressureRows(seriesByRound?.[currentRound?.key] ?? [], leftAssignments, rightAssignments),
    [currentRound?.key, leftAssignments, rightAssignments, seriesByRound]
  );
  const biggestPressure = pressureRows[0] ?? null;
  const bestForLeft = pressureRows.find((item) => item.swing > 0) ?? null;
  const bestForRight = pressureRows.find((item) => item.swing < 0) ?? null;
  const sharpestConflict = pressureRows.find((item) => item.conflict) ?? biggestPressure;

  function pressureLabelFor(item) {
    return getSeriesLabel(item?.series, baseSeriesById[item?.series?.id], teamsById);
  }

  function pressureDisplayTeamsFor(item) {
    return resolveDisplayTeams(item?.series, baseSeriesById[item?.series?.id], teamsById);
  }

  const pressureCards = [
    buildPressureCopy(
      bestForLeft,
      leftMember,
      rightMember,
      currentUserId,
      pressureLabelFor(bestForLeft),
      pressureDisplayTeamsFor(bestForLeft)
    ),
    buildPressureCopy(
      bestForRight,
      leftMember,
      rightMember,
      currentUserId,
      pressureLabelFor(bestForRight),
      pressureDisplayTeamsFor(bestForRight)
    ),
    buildConflictCopy(
      sharpestConflict,
      leftMember,
      rightMember,
      pressureLabelFor(sharpestConflict),
      pressureDisplayTeamsFor(sharpestConflict)
    ),
  ].filter(Boolean);

  const compareColumns = useMemo(() => {
    const leftIsCurrent = leftMember?.id === currentUserId;
    const rightIsCurrent = rightMember?.id === currentUserId;

    if (leftIsCurrent && !rightIsCurrent) {
      return [
        { key: "current", label: "You", valueFor: (row) => row.leftRank },
        { key: "other", label: formatName(rightMember), valueFor: (row) => row.rightRank },
        { key: "gap", label: "Gap", valueFor: (row) => row.gap },
      ];
    }

    if (rightIsCurrent && !leftIsCurrent) {
      return [
        { key: "current", label: "You", valueFor: (row) => row.rightRank },
        { key: "other", label: formatName(leftMember), valueFor: (row) => row.leftRank },
        { key: "gap", label: "Gap", valueFor: (row) => row.gap },
      ];
    }

    return [
      { key: "left", label: formatName(leftMember), valueFor: (row) => row.leftRank },
      { key: "right", label: formatName(rightMember), valueFor: (row) => row.rightRank },
      { key: "gap", label: "Gap", valueFor: (row) => row.gap },
    ];
  }, [currentUserId, leftMember, rightMember]);

  const compareTitle = `${formatCompareName(leftMember, currentUserId)} vs ${formatCompareName(rightMember, currentUserId)}`;

  function updateSide(side, value) {
    const nextLeft = side === "left" ? value : leftMember?.id ?? "";
    const nextRight = side === "right" ? value : rightMember?.id ?? "";
    if (!nextLeft || !nextRight || nextLeft === nextRight) return;
    setSearchParams({ left: nextLeft, right: nextRight }, { replace: true });
  }

  if (!canViewRoom) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Board Compare</span>
            <h2>Board comparisons unlock after lock</h2>
          </div>
        </div>
        <p className="subtle">Once boards are public, you’ll be able to compare any two entries side by side here.</p>
      </section>
    );
  }

  if (!leftMember || !rightMember) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Board Compare</span>
            <h2>Need at least two boards</h2>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="nba-board-compare-overview">
          <div className="nba-board-compare-leftstack">
            <article className="detail-card inset-card nba-board-compare-controls-card">
              <div className="nba-board-compare-titleblock">
                <span className="label">Board Compare</span>
                <h2>{compareTitle}</h2>
              </div>
              <div className="nba-board-compare-toolbar">
                <label className="field nba-board-compare-field">
                  <span>Left</span>
                  <select value={leftMember.id} onChange={(event) => updateSide("left", event.target.value)}>
                    {memberList.filter((member) => member.id !== rightMember.id).map((member) => (
                      <option key={member.id} value={member.id}>
                        {formatName(member)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field nba-board-compare-field">
                  <span>Right</span>
                  <select value={rightMember.id} onChange={(event) => updateSide("right", event.target.value)}>
                    {memberList.filter((member) => member.id !== leftMember.id).map((member) => (
                      <option key={member.id} value={member.id}>
                        {formatName(member)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="nba-stat-grid nba-board-compare-stats">
                <div className="nba-stat-card nba-board-compare-stat-card">
                  <span className="micro-label">Exact matches</span>
                  <strong>{summary.exactMatches}</strong>
                </div>
                <div className="nba-stat-card nba-board-compare-stat-card">
                  <span className="micro-label">Avg gap</span>
                  <strong>{summary.averageGap}</strong>
                </div>
                <div className="nba-stat-card nba-board-compare-stat-card">
                  <span className="micro-label">Biggest gap</span>
                  <strong>{summary.biggestGap}</strong>
                </div>
              </div>
            </article>

            <div className="nba-board-compare-summary">
              {pressureCards.map((card, index) => {
                const toneClass =
                  index === 0
                    ? "is-favorable"
                : index === 1
                  ? "is-pressure"
                  : "is-neutral";

            return (
            <article className={`detail-card inset-card nba-board-compare-brief ${toneClass}`} key={`${card.label}-${card.seriesLabel}`}>
              <span className="micro-label">{card.label}</span>
              <h3>{card.headline}</h3>
              <p>{card.body}</p>
              <span className="nba-board-compare-series-tag">{card.seriesLabel}</span>
            </article>
                );
              })}
            </div>

            <div className="nba-report-actions nba-board-compare-actions nba-board-compare-bottom-actions">
              <Link className="secondary-button" to="/dashboard">
                Dashboard
              </Link>
              <Link className="secondary-button" to="/board-matrix">
                Board Matrix
              </Link>
              <Link className="secondary-button" to="/reports/board-implications">
                Today's Briefing
              </Link>
            </div>
          </div>

          <article className="detail-card inset-card nba-board-compare-table-card">
            <div className="nba-board-compare-table-shell">
              <table className="nba-board-compare-table">
                <colgroup>
                  <col className="nba-board-compare-col-team" />
                  <col className="nba-board-compare-col-rank" />
                  <col className="nba-board-compare-col-rank" />
                  <col className="nba-board-compare-col-gap" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Team</th>
                    {compareColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const palette = getTeamPalette("nba", row);
                    return (
                      <tr key={row.id}>
                        <td>
                          <div
                            className="nba-board-compare-team-chip"
                            title={`${row.city} ${row.name}`}
                            style={{
                              "--matrix-primary": palette.primary,
                              "--matrix-secondary": palette.secondary,
                              "--matrix-border": palette.border,
                              "--matrix-text": palette.text,
                            }}
                        >
                          <strong>{row.abbreviation}</strong>
                          <span>#{row.seed}</span>
                        </div>
                      </td>
                      {compareColumns.map((column) => (
                        <td
                          key={`${row.id}-${column.key}`}
                          className={column.key === "gap" ? "nba-board-compare-gap" : "nba-board-compare-rank"}
                        >
                          {column.valueFor(row) ?? "—"}
                        </td>
                      ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
