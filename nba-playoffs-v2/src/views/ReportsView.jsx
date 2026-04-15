import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { summarizePickScores, summarizeSeriesMarket } from "../lib/seriesPickem";
import { buildCurrentRoundWinOdds, buildStandings } from "../lib/standings";
import { formatLean, getSeasonPhase } from "../lib/insights";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";

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

function buildReportsSummary({
  currentRound,
  currentStanding,
  currentStandingIndex,
  pointsBack,
  incompleteCount,
  contrarianCount,
  showScenarioCard,
}) {
  const placeLabel = currentStandingIndex >= 0 ? ordinal(currentStandingIndex + 1) : "unplaced";
  const winOdds = currentStanding?.roundWinOdds ?? 0;

  if (showScenarioCard) {
    return {
      headline: "Today is still about the bracket settling, not just your picks",
      body: `The most useful read right now is which finale-day results and Play-In paths will reshape Round 1 before the Saturday, April 18, 2026 lock.`,
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (incompleteCount > 0) {
    return {
      headline: `${incompleteCount} ${incompleteCount === 1 ? "series still needs your pick" : "series still need your picks"}`,
      body: `Your report story is still mostly about getting fully set for ${currentRound.label}. Once the board is filled in, the leverage picture will sharpen fast.`,
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (pointsBack <= 2) {
    return {
      headline: `You are within one series of the lead`,
      body: `From ${placeLabel}, your reports are mostly about protecting good ground while finding one or two spots that can still create separation.`,
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (contrarianCount > 0) {
    return {
      headline: `${contrarianCount} contrarian ${contrarianCount === 1 ? "call is" : "calls are"} carrying your upside`,
      body: `You are chasing from ${placeLabel}, and your clearest path is through the series where you differ meaningfully from the room.`,
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Contrarian picks", value: contrarianCount },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  return {
    headline: `Your board is mostly aligned with the room`,
    body: `From ${placeLabel}, this report set is less about one huge swing and more about where market, model, and pool consensus start to diverge.`,
    stats: [
      { label: "Points back", value: pointsBack },
      { label: "Current place", value: placeLabel },
      { label: "Round win odds", value: formatPct(winOdds) },
    ],
  };
}

export default function ReportsView() {
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { series, currentRound, seriesByRound } = usePlayoffData();
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

  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const currentRoundWinOdds = useMemo(
    () => buildCurrentRoundWinOdds(memberList, allPicksByUser, activeRoundSeries, series, settings),
    [activeRoundSeries, allPicksByUser, memberList, series, settings]
  );
  const standings = useMemo(() => {
    return buildStandings(memberList, allPicksByUser, series, settings).map((member) => ({
      ...member,
      roundWinOdds: currentRoundWinOdds[member.id] ?? 0,
    }));
  }, [allPicksByUser, currentRoundWinOdds, memberList, series, settings]);
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
  const seasonPhase = getSeasonPhase();
  const isQuietPrePlayoffBoard = activeRoundSeries.length > 0 && activeRoundSeries.every((seriesItem) => {
    const totalWins = (seriesItem.wins?.home ?? 0) + (seriesItem.wins?.away ?? 0);
    return seriesItem.status === "scheduled" && totalWins === 0;
  });
  const scenarioRows = SCENARIO_WATCH_ITEMS.slice(0, 2);
  const showScenarioCard = scenarioRows.length > 0 && (
    seasonPhase === "finale_day" ||
    seasonPhase === "play_in_week" ||
    isQuietPrePlayoffBoard
  );
  const reportsSummary = buildReportsSummary({
    currentRound,
    currentStanding,
    currentStandingIndex,
    pointsBack,
    incompleteCount,
    contrarianCount,
    showScenarioCard,
  });

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
  const probabilityRows = useMemo(() => {
    return activeRoundSeries
      .map((seriesItem) => {
        const yourPick = picksBySeriesId[seriesItem.id] ?? null;
        const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
        const pickedPct = !yourPick
          ? 0
          : yourPick.winnerTeamId === seriesItem.homeTeam.id
            ? marketSummary.homePct
            : marketSummary.awayPct;
        const yourTeam = !yourPick
          ? null
          : yourPick.winnerTeamId === seriesItem.homeTeam.id
            ? seriesItem.homeTeam
            : seriesItem.awayTeam;
        const roomTeam =
          marketSummary.consensusWinnerTeamId === seriesItem.homeTeam.id
            ? seriesItem.homeTeam
            : marketSummary.consensusWinnerTeamId === seriesItem.awayTeam.id
              ? seriesItem.awayTeam
              : null;

        return {
          id: seriesItem.id,
          matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
          title: !yourPick
            ? `This series is still pure variance for your odds`
            : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
              ? `${yourTeam.abbreviation} is your clearest odds swing`
              : `${yourTeam?.abbreviation ?? "This series"} is mostly defensive for your odds`,
          body: !yourPick
            ? "You have not picked this series yet, so your current-round win odds are unusually exposed here."
            : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
              ? `Only ${formatPct(pickedPct)} of the room is with you here. If ${yourTeam.abbreviation} hits, your current-round win odds should jump more than on a consensus result.`
              : `About ${formatPct(pickedPct)} of the pool is already with you. This result matters more for protecting position than creating separation.`,
          leverage: (yourPick ? Math.abs(50 - pickedPct) : 42) + Math.abs((seriesItem.market.homeWinPct ?? 50) - (seriesItem.model.homeWinPct ?? 50)),
          marketLean: formatLean(seriesItem, seriesItem.market),
          modelLean: formatLean(seriesItem, seriesItem.model),
        };
      })
      .sort((a, b) => b.leverage - a.leverage)
      .slice(0, 3);
  }, [activeRoundSeries, allPicksByUser, memberList, picksBySeriesId]);

  return (
    <div className="nba-shell">
      <section className="panel nba-reports-hero">
        <div>
          <span className="label">Reports</span>
          <h2>{reportsSummary.headline}</h2>
          <p className="subtle">
            {reportsSummary.body}
          </p>
        </div>
        <div className="nba-stat-grid">
          {reportsSummary.stats.map((stat) => (
            <div className="nba-stat-card" key={stat.label}>
              <span className="micro-label">{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
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
            {rootingRows.slice(0, 2).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.note.title}</strong>
                  <p>{row.matchup} · {row.status}</p>
                  <p>{row.note.body}</p>
                </div>
              </div>
            ))}
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/reports/rooting">
                Open full report
              </Link>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Win odds</span>
              <h2>What is driving your current-round probability?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{currentStanding ? `${currentStanding.roundWinOdds}% current-round win odds` : "Current-round odds still forming"}</strong>
                <p>
                  This first-pass number simulates the unresolved series in the current round using the market probabilities already on the board. The same probability layer is also feeding the market/model signals across Dashboard, Series, and Bracket.
                </p>
              </div>
            </div>
            {probabilityRows.slice(0, 2).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={`${row.id}-probability`}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.matchup}</p>
                  <p>{row.body}</p>
                  <p>Market lean: {row.marketLean} · Model lean: {row.modelLean}</p>
                </div>
              </div>
            ))}
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/reports/win-odds">
                Open full report
              </Link>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Swing spots</span>
              <h2>Which series can move your standing?</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {swingRows.slice(0, 2).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.matchup}</p>
                  <p>{row.body}</p>
                </div>
              </div>
            ))}
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/reports/swing">
                Open full report
              </Link>
            </div>
          </div>
        </article>
      </section>

      <section className="nba-dashboard-grid">
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
                {headToHeadRows.length ? headToHeadRows.slice(0, 2).map((row) => (
                  <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                    <div>
                      <strong>{row.matchup}</strong>
                      <p>{row.label}</p>
                      <p>You: {row.yourPick} · {selectedOpponent.name}: {row.theirPick}</p>
                      <p>Room lean: {row.roomLean}</p>
                    </div>
                  </div>
                )) : <p className="subtle">You and {selectedOpponent.name} are aligned on the current round so far.</p>}
                <div className="nba-report-actions">
                  <Link className="secondary-button" to={`/reports/opponent/${selectedOpponent.id}`}>
                    Open matchup report
                  </Link>
                </div>
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
            {exposureRows.slice(0, 2).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.matchup}</strong>
                  <p>Consensus: {row.consensusTeam}</p>
                  <p>{row.homePct}% on the home side · {row.awayPct}% on the away side · Most common length: {row.leadingGames ? `${row.leadingGames} games` : "No lean yet"}</p>
                </div>
              </div>
            ))}
            <div className="nba-report-actions">
              <Link className="secondary-button" to="/reports/exposure">
                Open full report
              </Link>
            </div>
          </div>
        </article>

        {showScenarioCard ? (
          <article className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Scenario watch</span>
                <h2>What can still move before Round 1 locks?</h2>
              </div>
            </div>
            <div className="nba-dashboard-list">
              {scenarioRows.map((item) => (
                <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.sourced}</p>
                    <p>{item.likelyImpact}</p>
                  </div>
                </div>
              ))}
              <div className="nba-report-actions">
                <Link className="secondary-button" to="/reports/scenarios">
                  Open full report
                </Link>
              </div>
              <p className="subtle">Sourced through {SCENARIO_WATCH_DATE}. Matchup and market implications are local product inference.</p>
            </div>
          </article>
        ) : (
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
              <div className="nba-report-actions">
                <Link className="secondary-button" to="/reports/outlook">
                  Open full report
                </Link>
              </div>
            </div>
          </article>
        )}

      </section>

    </div>
  );
}
