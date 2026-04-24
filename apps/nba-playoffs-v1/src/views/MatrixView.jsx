import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { isSeriesPickPublic } from "../lib/pickVisibility";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

function formatVisibilityTime(value) {
  if (!value) return "when Game 1 tips";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "when Game 1 tips";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

function getPickedTeam(seriesItem, pick) {
  if (!pick?.winnerTeamId) return null;
  return pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
}

function formatPick(seriesItem, pick) {
  if (!pick?.winnerTeamId) return "No pick";
  const team = getPickedTeam(seriesItem, pick);
  return `${team.abbreviation} in ${pick.games}`;
}

export default function MatrixView() {
  const { pool, memberList, settingsForPool } = usePool();
  const settings = settingsForPool(pool);
  const { rounds, series, currentRound, seriesByRound } = usePlayoffData();
  const { allPicksByUser } = useSeriesPickem(series);
  const currentRoundIndex = rounds.findIndex((round) => round.key === currentRound.key);
  const roundOptions = useMemo(
    () =>
      rounds.map((round, index) => {
        const roundSeries = seriesByRound[round.key] ?? [];
        const publicCount = roundSeries.filter((seriesItem) => isSeriesPickPublic(seriesItem, settings)).length;
        return {
          ...round,
          publicCount,
          enabled: publicCount > 0 || index === currentRoundIndex,
        };
      }),
    [currentRoundIndex, rounds, seriesByRound, settings]
  );
  const [selectedRoundKey, setSelectedRoundKey] = useState(currentRound.key);

  useEffect(() => {
    const selectedOption = roundOptions.find((round) => round.key === selectedRoundKey);
    if (!selectedOption?.enabled) {
      setSelectedRoundKey(currentRound.key);
    }
  }, [currentRound.key, roundOptions, selectedRoundKey]);

  const activeRoundKey = roundOptions.find((round) => round.key === selectedRoundKey)?.enabled
    ? selectedRoundKey
    : currentRound.key;
  const activeRound = roundOptions.find((round) => round.key === activeRoundKey) ?? roundOptions[0] ?? currentRound;
  const activeSeries = seriesByRound[activeRoundKey] ?? [];
  const publicSeries = activeSeries.filter((seriesItem) => isSeriesPickPublic(seriesItem, settings));
  const canViewMatrix = publicSeries.length > 0;
  const currentMember = memberList.find((member) => member.isCurrentUser) ?? memberList[0] ?? null;
  const orderedMembers = currentMember
    ? [currentMember, ...memberList.filter((member) => member.id !== currentMember.id)]
    : memberList;

  const formatMemberHeader = (member) => (member?.isCurrentUser ? "You" : member?.name ?? "Pool");

  return (
    <div className="nba-shell">
      <section className="panel nba-matrix-panel">
        <div className="panel-header nba-matrix-header">
          <div className="nba-matrix-title-row">
            <h2>Picks Matrix</h2>
            <label className="nba-matrix-round-pill">
              <select
                className="nba-matrix-round-select"
                aria-label="Choose matrix round"
                value={activeRoundKey}
                onChange={(event) => setSelectedRoundKey(event.target.value)}
              >
                {roundOptions.map((round) => (
                  <option key={round.key} value={round.key} disabled={!round.enabled}>
                    {round.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="nba-report-actions">
            <Link className="secondary-button" to="/standings">
              Open Standings
            </Link>
            <Link className="secondary-button" to="/series">
              Open Series Board
            </Link>
          </div>
        </div>

        {!canViewMatrix ? (
          <div className="detail-card inset-card nba-matrix-empty-state">
            <p>
              {activeRound.key === currentRound.key
                ? "This round opens row by row as each series tips. Once Game 1 begins, that matchup becomes public here."
                : "This round is still sealed. Once those series tip, the room opens here one matchup at a time."}
            </p>
          </div>
        ) : (
          <div className="nba-standings-table-shell">
            <table className="nba-standings-table-expanded nba-matrix-table">
              <thead>
                <tr>
                  <th>Series</th>
                  {orderedMembers.map((member) => (
                    <th key={member.id} className={member.isCurrentUser ? "is-current-member" : ""}>
                      {formatMemberHeader(member)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSeries.map((seriesItem) => (
                  <tr key={seriesItem.id} className={isSeriesPickPublic(seriesItem, settings) ? "is-public-series" : "is-hidden-series"}>
                    <td>
                      <div
                        className="nba-standings-name-cell nba-matrix-series-cell has-matchup-palette"
                        style={{
                          "--matchup-primary": getTeamPalette("nba", seriesItem.homeTeam)?.primary ?? "#efe1c9",
                          "--matchup-secondary": getTeamPalette("nba", seriesItem.awayTeam)?.primary ?? "#d8c2a1",
                          "--matchup-home-accent": getTeamPalette("nba", seriesItem.homeTeam)?.secondary ?? "#f7e9cf",
                          "--matchup-away-accent": getTeamPalette("nba", seriesItem.awayTeam)?.secondary ?? "#f0dcc0",
                        }}
                      >
                        <strong>{seriesItem.homeTeam.abbreviation} vs {seriesItem.awayTeam.abbreviation}</strong>
                        {!isSeriesPickPublic(seriesItem, settings) ? (
                          <span className="tooltip-wrap">
                            <em className="nba-matrix-visibility-pill is-hidden">
                              Hidden until tip
                            </em>
                            <span className="tooltip-bubble">
                              {`Opens ${formatVisibilityTime(seriesItem.schedule?.lockAt)}.`}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {orderedMembers.map((member) => {
                      const pick = allPicksByUser[member.id]?.[seriesItem.id] ?? null;
                      const isPublic = isSeriesPickPublic(seriesItem, settings);
                      const showPick = member.isCurrentUser || isPublic;
                      const pickedTeam = showPick ? getPickedTeam(seriesItem, pick) : null;
                      const palette = pickedTeam ? getTeamPalette("nba", pickedTeam) : null;
                      return (
                        <td key={`${seriesItem.id}-${member.id}`} className={member.isCurrentUser ? "is-current-member" : ""}>
                          <div
                            className={`nba-matrix-cell ${showPick ? "is-public" : "is-hidden"} ${
                              showPick && palette
                                ? "has-team-palette"
                                : showPick && pick?.winnerTeamId
                                  ? "nba-matrix-cell-no-pick"
                                  : "nba-matrix-cell-neutral"
                            } ${member.isCurrentUser && palette ? "is-self-palette" : ""}`}
                            style={palette ? {
                              "--cell-primary": palette.primary,
                              "--cell-primary-dark": palette.primaryDark,
                              "--cell-secondary": palette.secondary,
                              "--cell-text": palette.text,
                              "--cell-border": palette.border,
                            } : undefined}
                          >
                            <strong>{showPick ? formatPick(seriesItem, pick) : "Hidden"}</strong>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
