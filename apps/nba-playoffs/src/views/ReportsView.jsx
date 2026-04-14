import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { summarizePickScores, summarizeSeriesMarket } from "../lib/seriesPickem";

function formatPct(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.round(safe)}%`;
}

function ordinal(value) {
  if (!Number.isFinite(value)) return "";
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function winnerLabel(series, winnerTeamId, games) {
  if (!winnerTeamId) return "No pick";
  const team = winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  return `${team.abbreviation} in ${games}`;
}

function buildRootingNote(series, pick, marketSummary) {
  if (!pick) {
    return {
      title: `Make your ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} pick`,
      body: "You have not picked this series yet, so this is the clearest place to lock in value before the room moves around you.",
    };
  }

  const pickedTeam = pick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  const otherTeam = pick.winnerTeamId === series.homeTeam.id ? series.awayTeam : series.homeTeam;
  const againstField = marketSummary.consensusWinnerTeamId && marketSummary.consensusWinnerTeamId !== pick.winnerTeamId;

  if (againstField) {
    return {
      title: `You need ${pickedTeam.abbreviation} more than the room does`,
      body: `${pickedTeam.city} is your leverage side here. Most of the pool is leaning ${otherTeam.abbreviation}, so a ${pickedTeam.abbreviation} win would help you make up ground fast.`,
    };
  }

  if (marketSummary.consensusWinnerTeamId === pick.winnerTeamId) {
    return {
      title: `${pickedTeam.abbreviation} is defensive rooting for you`,
      body: `You are with the room on this series, so ${pickedTeam.abbreviation} winning is more about protecting position than creating separation.`,
    };
  }

  return {
    title: `Watch ${pickedTeam.abbreviation} for your own path`,
    body: `${pickedTeam.city} is still a meaningful result for your card even though the room has not settled strongly on either side yet.`,
  };
}

function differenceLabel(currentUserPick, opponentPick, series) {
  if (!currentUserPick && !opponentPick) return "Neither side has picked yet";
  if (!currentUserPick) return "Only your opponent has picked";
  if (!opponentPick) return "Only you have picked";

  const sameWinner = currentUserPick.winnerTeamId === opponentPick.winnerTeamId;
  if (!sameWinner) return "Different winner";
  if (currentUserPick.games !== opponentPick.games) return `Same winner, different length`;
  return `Same pick`;
}

function buildSwingSummary(series, yourPick, marketSummary, currentStandingIndex, poolSize) {
  if (!yourPick) {
    return {
      title: `Unmade pick is the biggest swing here`,
      body: `You are still open on ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation}. Until you pick a side, this series is pure uncertainty for your position.`,
    };
  }

  const pickedTeam = yourPick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  const roomPct = yourPick.winnerTeamId === series.homeTeam.id ? marketSummary.homePct : marketSummary.awayPct;
  const place = currentStandingIndex >= 0 ? currentStandingIndex + 1 : null;

  if (roomPct <= 35) {
    return {
      title: `${pickedTeam.abbreviation} is your upside swing`,
      body: `${formatPct(roomPct)} of the room is with ${pickedTeam.abbreviation}, so this is one of your clearest ways to gain from ${place ? ordinal(place) : "your current position"}.`,
    };
  }

  if (roomPct >= 65) {
    return {
      title: `${pickedTeam.abbreviation} is mostly about holding serve`,
      body: `${formatPct(roomPct)} of the pool is already on your side here. That makes this series more about not losing ground than about creating separation.`,
    };
  }

  return {
    title: `${pickedTeam.abbreviation} is a live middle-ground swing`,
    body: `${formatPct(roomPct)} of the pool agrees with you, so this series can still move your standing without being a full contrarian bet. ${poolSize > 2 ? "A clean result here can matter more than it looks." : ""}`,
  };
}

function buildHeadToHeadSummary(selectedOpponent, currentStanding, opponentStanding, differingSeriesCount) {
  if (!selectedOpponent || !currentStanding || !opponentStanding) return null;
  const pointGap = currentStanding.summary.totalPoints - opponentStanding.summary.totalPoints;

  if (differingSeriesCount === 0) {
    return `You and ${selectedOpponent.name} are effectively traveling together right now. There are no active-round separation points yet.`;
  }

  if (pointGap > 0) {
    return `You lead ${selectedOpponent.name} by ${pointGap} point${pointGap === 1 ? "" : "s"}, and ${differingSeriesCount} active series can still change that.`;
  }

  if (pointGap < 0) {
    return `${selectedOpponent.name} leads you by ${Math.abs(pointGap)} point${Math.abs(pointGap) === 1 ? "" : "s"}, with ${differingSeriesCount} active series still available to flip the matchup.`;
  }

  return `You and ${selectedOpponent.name} are level on points, but ${differingSeriesCount} active series still separate the two cards.`;
}

export default function ReportsView() {
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { series, currentRound, seriesByRound, featuredSeries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const {
    picksBySeriesId,
    allPicksByUser,
  } = useSeriesPickem(series);
  const currentMember = memberList.find((member) => member.id === profile?.id) ?? null;
  const opponents = memberList.filter((member) => member.id !== profile?.id);
  const [selectedOpponentId, setSelectedOpponentId] = useState("");

  useEffect(() => {
    if (!opponents.length) {
      setSelectedOpponentId("");
      return;
    }
    if (!selectedOpponentId || !opponents.some((member) => member.id === selectedOpponentId)) {
      setSelectedOpponentId(opponents[0].id);
    }
  }, [opponents, selectedOpponentId]);

  const standings = useMemo(() => {
    return memberList
      .map((member) => ({
        ...member,
        summary: summarizePickScores(allPicksByUser[member.id] ?? {}, series, settings),
      }))
      .sort((a, b) => b.summary.totalPoints - a.summary.totalPoints || b.summary.exact - a.summary.exact || a.name.localeCompare(b.name));
  }, [allPicksByUser, memberList, series, settings]);

  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const rootingRows = useMemo(() => {
    return activeRoundSeries
      .map((seriesItem) => {
        const pick = picksBySeriesId[seriesItem.id];
        const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
        const note = buildRootingNote(seriesItem, pick, marketSummary);
        const pickedShare = !pick
          ? 0
          : pick.winnerTeamId === seriesItem.homeTeam.id
            ? marketSummary.homePct
            : marketSummary.awayPct;
        const leverageScore =
          (pick ? 0 : 40) +
          Math.abs(50 - pickedShare) +
          Math.abs((seriesItem.market.homeWinPct ?? 50) - (seriesItem.model.homeWinPct ?? 50));

        return {
          id: seriesItem.id,
          matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
          note,
          leverageScore,
          pickedShare,
          status: pick
            ? `${pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam.abbreviation : seriesItem.awayTeam.abbreviation} in ${pick.games}`
            : "No pick entered",
        };
      })
      .sort((a, b) => b.leverageScore - a.leverageScore)
      .slice(0, 4);
  }, [activeRoundSeries, allPicksByUser, memberList, picksBySeriesId]);

  const selectedOpponent = opponents.find((member) => member.id === selectedOpponentId) ?? null;
  const opponentPicks = selectedOpponent ? allPicksByUser[selectedOpponent.id] ?? {} : {};

  const headToHeadRows = useMemo(() => {
    if (!selectedOpponent) return [];
    return activeRoundSeries
      .map((seriesItem) => {
        const yourPick = picksBySeriesId[seriesItem.id] ?? null;
        const theirPick = opponentPicks[seriesItem.id] ?? null;
        const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
        return {
          id: seriesItem.id,
          matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
          label: differenceLabel(yourPick, theirPick, seriesItem),
          yourPick: winnerLabel(seriesItem, yourPick?.winnerTeamId, yourPick?.games),
          theirPick: winnerLabel(seriesItem, theirPick?.winnerTeamId, theirPick?.games),
          roomLean:
            marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
              ? `${seriesItem.homeTeam.abbreviation} ${marketSummary.homePct}%`
              : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
                ? `${seriesItem.awayTeam.abbreviation} ${marketSummary.awayPct}%`
                : "Room split",
        };
      })
      .filter((row) => row.label !== "Same pick");
  }, [activeRoundSeries, allPicksByUser, memberList, opponentPicks, picksBySeriesId, selectedOpponent]);

  const exposureRows = useMemo(() => {
    return activeRoundSeries.map((seriesItem) => {
      const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
      const consensusTeam =
        marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
          ? seriesItem.homeTeam.abbreviation
          : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
            ? seriesItem.awayTeam.abbreviation
            : "Split";

      return {
        id: seriesItem.id,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        consensusTeam,
        homePct: marketSummary.homePct,
        awayPct: marketSummary.awayPct,
        leadingGames: marketSummary.leadingGames,
      };
    }).sort((a, b) => Math.max(b.homePct, b.awayPct) - Math.max(a.homePct, a.awayPct));
  }, [activeRoundSeries, allPicksByUser, memberList]);

  const currentStandingIndex = standings.findIndex((member) => member.id === profile?.id);
  const leader = standings[0] ?? null;
  const currentStanding = currentStandingIndex >= 0 ? standings[currentStandingIndex] : null;
  const pointsBack = leader && currentStanding ? leader.summary.totalPoints - currentStanding.summary.totalPoints : 0;
  const opponentStanding = selectedOpponent ? standings.find((entry) => entry.id === selectedOpponent.id) ?? null : null;
  const headToHeadSummary = buildHeadToHeadSummary(selectedOpponent, currentStanding, opponentStanding, headToHeadRows.length);
  const contrarianCount = rootingRows.filter((row) => row.pickedShare <= 35 && row.status !== "No pick entered").length;
  const incompleteCount = activeRoundSeries.filter((seriesItem) => !picksBySeriesId[seriesItem.id]?.winnerTeamId).length;

  const swingRows = useMemo(() => {
    return activeRoundSeries
      .map((seriesItem) => {
        const pick = picksBySeriesId[seriesItem.id] ?? null;
        const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
        const swing = buildSwingSummary(seriesItem, pick, marketSummary, currentStandingIndex, memberList.length);
        const pickedShare = !pick
          ? 0
          : pick.winnerTeamId === seriesItem.homeTeam.id
            ? marketSummary.homePct
            : marketSummary.awayPct;

        return {
          id: seriesItem.id,
          matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
          title: swing.title,
          body: swing.body,
          swingScore: (pick ? Math.abs(50 - pickedShare) : 45) + Math.abs((seriesItem.model.homeWinPct ?? 50) - (seriesItem.market.homeWinPct ?? 50)),
        };
      })
      .sort((a, b) => b.swingScore - a.swingScore)
      .slice(0, 3);
  }, [activeRoundSeries, allPicksByUser, currentStandingIndex, memberList, picksBySeriesId]);

  return (
    <div className="nba-shell">
      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Reports</span>
          <h2>Pool intelligence for the current playoff picture</h2>
          <p className="subtle">
            This is where we pull the most useful interpretation out of the pool: what you should root for,
            where you differ from the room, and which series can still swing position.
          </p>
        </div>
        <div className="nba-stat-grid">
          <div className="nba-stat-card">
            <span className="micro-label">Current round</span>
            <strong>{currentRound.label}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Featured series</span>
            <strong>{featuredSeries.length || activeRoundSeries.length}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Your place</span>
            <strong>{currentStandingIndex >= 0 ? `#${currentStandingIndex + 1}` : "TBD"}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Points back</span>
            <strong>{leader && currentStanding ? pointsBack : 0}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Contrarian picks</span>
            <strong>{contrarianCount}</strong>
          </div>
          <div className="nba-stat-card">
            <span className="micro-label">Open series</span>
            <strong>{incompleteCount}</strong>
          </div>
        </div>
      </section>

      <section className="nba-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Rooting guide</span>
              <h2>What should you care about most?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {rootingRows.map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.note.title}</strong>
                  <p>{row.matchup} · {row.status}</p>
                  <p>{row.note.body}</p>
                  <div className="nba-report-actions">
                    <Link className="secondary-button" to={`/reports/series/${row.id}`}>
                      Open series report
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Head to head</span>
              <h2>How do you differ from one opponent?</h2>
            </div>
            {selectedOpponent ? (
              <select
                className="nav-select"
                value={selectedOpponentId}
                onChange={(event) => setSelectedOpponentId(event.target.value)}
                aria-label="Select opponent"
              >
                {opponents.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="nba-dashboard-list">
            {!selectedOpponent ? (
              <p className="subtle">Add another member to the pool to unlock head-to-head comparisons.</p>
            ) : (
              <>
                <div className="nba-reports-summary">
                  <div className="detail-card inset-card">
                    <span className="micro-label">You</span>
                    <p>{currentMember?.name ?? "You"} · {currentStanding?.summary.totalPoints ?? 0} pts</p>
                  </div>
                  <div className="detail-card inset-card">
                    <span className="micro-label">{selectedOpponent.name}</span>
                    <p>{selectedOpponent.summary?.totalPoints ?? summarizePickScores(opponentPicks, series, settings).totalPoints} pts</p>
                  </div>
                </div>
                {headToHeadSummary ? <p className="subtle">{headToHeadSummary}</p> : null}
                {headToHeadRows.length ? headToHeadRows.map((row) => (
                  <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                    <div>
                      <strong>{row.matchup}</strong>
                      <p>{row.label}</p>
                      <p>You: {row.yourPick} · {selectedOpponent.name}: {row.theirPick}</p>
                      <p>Room lean: {row.roomLean}</p>
                      <div className="nba-report-actions">
                        <Link className="secondary-button" to={`/reports/opponent/${selectedOpponent.id}`}>
                          Open matchup report
                        </Link>
                      </div>
                    </div>
                  </div>
                )) : <p className="subtle">You and {selectedOpponent.name} are aligned on the current round so far.</p>}
              </>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Pool exposure</span>
              <h2>Where is the room concentrated?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {exposureRows.map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.matchup}</strong>
                  <p>Consensus: {row.consensusTeam}</p>
                  <p>{row.homePct}% on the home side · {row.awayPct}% on the away side · Most common length: {row.leadingGames ? `${row.leadingGames} games` : "No lean yet"}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="nba-dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Swing spots</span>
              <h2>Which series can move your standing?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {swingRows.map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.matchup}</p>
                  <p>{row.body}</p>
                  <div className="nba-report-actions">
                    <Link className="secondary-button" to={`/reports/series/${row.id}`}>
                      Open series report
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Position outlook</span>
              <h2>What does your standing mean?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{currentStandingIndex >= 0 ? `You are currently ${ordinal(currentStandingIndex + 1)}` : "Standing still forming"}</strong>
                <p>
                  {pointsBack > 0
                    ? `You are ${pointsBack} point${pointsBack === 1 ? "" : "s"} behind ${leader?.name ?? "the leader"}, so contrarian hits matter more than safe consensus wins right now.`
                    : pointsBack === 0 && leader
                      ? `You are level with the top of the pool, so the biggest risk now is getting caught on the room's chalk while someone else hits a live swing.`
                      : "Once more picks and results come in, this section will tell a cleaner story about what you need next."}
                </p>
              </div>
            </div>
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{incompleteCount > 0 ? `${incompleteCount} active series still need your pick` : "Your current round card is filled in"}</strong>
                <p>
                  {incompleteCount > 0
                    ? "The cleanest way to improve your outlook right now is simply to remove open spots from your card before the room settles."
                    : "With the round filled out, the reports become more about leverage and less about housekeeping."}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Best edges</span>
              <h2>Where your card is usefully different</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {rootingRows.filter((row) => row.pickedShare <= 40 && row.status !== "No pick entered").length ? (
              rootingRows
                .filter((row) => row.pickedShare <= 40 && row.status !== "No pick entered")
                .map((row) => (
                  <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${row.id}-edge`}>
                    <div>
                      <strong>{row.matchup}</strong>
                      <p>{row.status}</p>
                      <p>Only {formatPct(row.pickedShare)} of the room is currently with you here.</p>
                    </div>
                  </div>
                ))
            ) : (
              <p className="subtle">You are not especially contrarian in the current round yet. Most of your live card is moving with the room.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Position outlook</span>
            <h2>Where the pool stands right now</h2>
          </div>
        </div>
        <div className="nba-standings-table">
          {standings.map((entry, index) => (
            <div className="nba-standings-row" key={entry.id}>
              <div className="nba-standings-rank">{index + 1}</div>
              <div className="nba-standings-name">
                <strong>{entry.name}</strong>
                <span>{entry.roleLabel}</span>
              </div>
              <div className="nba-standings-metrics">
                <span>{entry.summary.totalPoints} pts</span>
                <span>{entry.summary.exact} exact</span>
                <span>{entry.summary.close + entry.summary.near} close</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
