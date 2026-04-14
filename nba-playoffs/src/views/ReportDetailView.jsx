import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { summarizeSeriesMarket } from "../lib/seriesPickem";
import { buildCurrentRoundWinOdds, buildStandings } from "../lib/standings";
import { formatLean, getSeasonPhase } from "../lib/insights";
import { SCENARIO_WATCH_DATE, SCENARIO_WATCH_ITEMS } from "../data/scenarioWatch";
import { areRoundPicksPublic } from "../lib/pickVisibility";

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

function buildRootingNote(series, pick, marketSummary, canViewPoolSignals) {
  if (!pick) {
    return {
      title: `Make your ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} pick`,
      body: "You have not picked this series yet, so this is the clearest place to lock in value before the room moves around you.",
    };
  }

  const pickedTeam = pick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  const otherTeam = pick.winnerTeamId === series.homeTeam.id ? series.awayTeam : series.homeTeam;
  if (!canViewPoolSignals) {
    const marketLean = formatLean(series, series.market);
    const modelLean = formatLean(series, series.model);
    const marketModelGap = Math.abs((series.market.homeWinPct ?? 50) - (series.model.homeWinPct ?? 50));
    const pickedTeamFavoredByMarket = pick.winnerTeamId === series.homeTeam.id
      ? (series.market.homeWinPct ?? 50) >= (series.market.awayWinPct ?? 50)
      : (series.market.awayWinPct ?? 50) >= (series.market.homeWinPct ?? 50);
    const pickedTeamFavoredByModel = pick.winnerTeamId === series.homeTeam.id
      ? (series.model.homeWinPct ?? 50) >= (series.model.awayWinPct ?? 50)
      : (series.model.awayWinPct ?? 50) >= (series.model.homeWinPct ?? 50);

    if (marketModelGap >= 10) {
      return {
        title: `${pickedTeam.abbreviation} sits in the sharpest signal split here`,
        body: `${pickedTeam.city} is not just a team to cheer for. It is part of one of the bigger public-signal disagreements on the board: market says ${marketLean}, model says ${modelLean}.`,
      };
    }

    if (pickedTeamFavoredByModel && !pickedTeamFavoredByMarket) {
      return {
        title: `${pickedTeam.abbreviation} is a model-backed gamble`,
        body: `${pickedTeam.city} is not carrying hidden room leverage yet, but it is one of the spots where the model is giving you more permission than the public market price is.`,
      };
    }

    if (pickedTeamFavoredByMarket && pickedTeamFavoredByModel) {
      return {
        title: `${pickedTeam.abbreviation} is steady-card rooting`,
        body: `${pickedTeam.city} is one of the cleaner hold positions on your board. The useful question here is less “is this bold enough?” and more “does this let you be bold somewhere that matters more?”`,
      };
    }

    return {
      title: `Watch ${pickedTeam.abbreviation} through the public signals`,
      body: `${pickedTeam.city} is still meaningful for your card, but before lock the useful read is market, model, and bracket path rather than where the room has landed.`,
    };
  }
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

function buildSwingSummary(series, yourPick, marketSummary, currentStandingIndex, poolSize, canViewPoolSignals) {
  if (!yourPick) {
    return {
      title: `Unmade pick is the biggest swing here`,
      body: `You are still open on ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation}. Until you pick a side, this series is pure uncertainty for your position.`,
    };
  }

  const pickedTeam = yourPick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  if (!canViewPoolSignals) {
    const marketLean = formatLean(series, series.market);
    const modelLean = formatLean(series, series.model);
    const marketModelGap = Math.abs((series.market.homeWinPct ?? 50) - (series.model.homeWinPct ?? 50));
    const confidence = Math.max(series.market.homeWinPct ?? 50, series.market.awayWinPct ?? 50);

    if (marketModelGap >= 10) {
      return {
        title: `${pickedTeam.abbreviation} is a real pre-lock pressure point`,
        body: `${pickedTeam.city} is attached to one of the larger market-model gaps on the board, so this is a better place to spend your attention than a series where every outside signal already agrees.`,
      };
    }

    if (confidence >= 66) {
      return {
        title: `${pickedTeam.abbreviation} looks more like protection than upside`,
        body: `${pickedTeam.city} is tied to one of the steadier public prices in the round. That makes this series more useful as a foundation piece while you decide where the actual swing spots belong.`,
      };
    }

    return {
      title: `${pickedTeam.abbreviation} is still a live leverage call`,
      body: `${pickedTeam.city} is one of the spots where public market and model inputs still disagree enough to change how the round can feel if you get it right. Market says ${marketLean}; model says ${modelLean}.`,
    };
  }
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
      headline: "The board is still settling before the real decisions lock.",
      body: `The highest-signal work right now is not scoreboard watching. It is figuring out which Play-In outcomes and price moves actually change what you need to do in ${currentRound.label}.`,
      stats: [
        { label: "Decision window", value: "Pre-lock" },
        { label: "Open series", value: incompleteCount },
        { label: "Watch first", value: "Scenario shifts" },
      ],
    };
  }

  if (incompleteCount > 0) {
    return {
      headline: `${incompleteCount} ${incompleteCount === 1 ? "series still needs your pick" : "series still need your picks"}`,
      body: `Your report story is still mostly about getting fully set for ${currentRound.label}. Once the board is filled in, the leverage picture will sharpen fast.`,
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Decision window", value: currentRound.label },
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

function buildReportHeroState(reportKey, context) {
  const {
    reportsSummary,
    currentRound,
    currentStanding,
    incompleteCount,
    scenarioRows,
    rootingRows,
    exposureRows,
    swingRows,
    probabilityRows,
    showScenarioCard,
  } = context;

  if (reportKey === "scenarios") {
    return {
      body: showScenarioCard
        ? `This page is here to narrow your attention, not widen it. The useful question is which remaining bracket developments actually change the first-round board before ${currentRound.label} locks.`
        : `The major seeding chaos has mostly settled. What still matters now is how the Play-In and late price movement alter the edges of the board.`,
      stats: [
        { label: "Decision window", value: showScenarioCard ? "Pre-lock" : currentRound.label },
        { label: "Key watch", value: scenarioRows[0]?.title ? "Play-In paths" : "Bracket shifts" },
        { label: "Open series", value: incompleteCount },
      ],
    };
  }

  if (reportKey === "rooting") {
    return {
      body: incompleteCount > 0
        ? `Before this becomes a pure rooting map, it is still partly a pick-completion tool. The first thing to care about is which unresolved series you still need to settle.`
        : `This page is about separating the results that simply protect your position from the ones that can actually create movement for your card.`,
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Top care spot", value: rootingRows[0]?.matchup ?? "Still forming" },
        { label: "Mode", value: incompleteCount > 0 ? "Finish board" : "Rooting map" },
      ],
    };
  }

  if (reportKey === "exposure") {
    const topExposure = exposureRows[0];
    const topShare = topExposure ? Math.max(topExposure.homePct, topExposure.awayPct) : 0;
    return {
      body: `This is the room-context page. It is most useful for spotting where consensus is already strong and where the pool is still leaving room for different paths to matter.`,
      stats: [
        { label: "Most concentrated", value: topExposure?.matchup ?? "Still forming" },
        { label: "Top room share", value: formatPct(topShare) },
        { label: "Open series", value: incompleteCount },
      ],
    };
  }

  if (reportKey === "swing") {
    return {
      body: `This page is about movement, not just correctness. It is trying to isolate the few series that can actually change your place rather than merely confirm what the room already expects.`,
      stats: [
        { label: "Best swing", value: swingRows[0]?.matchup ?? "Still forming" },
        { label: "Open series", value: incompleteCount },
        { label: "Current odds", value: formatPct(currentStanding?.roundWinOdds ?? 0) },
      ],
    };
  }

  if (reportKey === "win-odds") {
    return {
      body: incompleteCount > 0
        ? `This page is still partly hypothetical because your round is not fully locked in. The useful read is where market, model, and your unfinished card are creating the biggest probability swings.`
        : `This page turns the unresolved series into a first-pass probability map so you can see which results are driving your current-round path most. `,
      stats: [
        { label: "Current odds", value: formatPct(currentStanding?.roundWinOdds ?? 0) },
        { label: "Top driver", value: probabilityRows[0]?.matchup ?? "Still forming" },
        { label: "Open series", value: incompleteCount },
      ],
    };
  }

  if (reportKey === "outlook") {
    return {
      body: incompleteCount > 0
        ? `This page is still mostly about readiness. Before lock, your “position” is less about rank than about whether your card is complete and where your biggest leverage calls still sit.`
        : reportsSummary.body,
      stats: incompleteCount > 0
        ? [
            { label: "Open series", value: incompleteCount },
            { label: "Mode", value: "Pre-lock" },
            { label: "Current odds", value: formatPct(currentStanding?.roundWinOdds ?? 0) },
          ]
        : reportsSummary.stats,
    };
  }

  return {
    body: reportsSummary.body,
    stats: reportsSummary.stats,
  };
}

const REPORT_CONFIG = {
  rooting: {
    label: "Rooting guide",
    title: "What should you care about most?",
  },
  exposure: {
    label: "Pool exposure",
    title: "Where is the room concentrated?",
  },
  swing: {
    label: "Swing spots",
    title: "Which series can move your standing?",
  },
  "win-odds": {
    label: "Win odds",
    title: "What is driving your current-round probability?",
  },
  scenarios: {
    label: "Scenario watch",
    title: "What can still move before Round 1 locks?",
  },
  outlook: {
    label: "Position outlook",
    title: "What does your standing mean?",
  },
};

export default function ReportDetailView() {
  const { reportKey } = useParams();
  const reportConfig = REPORT_CONFIG[reportKey];
  const { profile } = useAuth();
  const { pool, memberList, settingsForPool } = usePool();
  const { series, currentRound, seriesByRound } = usePlayoffData();
  const settings = settingsForPool(pool);
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);

  if (!reportConfig) {
    return (
      <div className="report-back-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
        <div className="panel">
          <h2>Report not found</h2>
        </div>
      </div>
    );
  }

  const activeRoundSeries = seriesByRound[currentRound.key] ?? [];
  const canViewPoolSignals = areRoundPicksPublic(activeRoundSeries, currentRound.key, settings);
  const currentRoundWinOdds = buildCurrentRoundWinOdds(memberList, allPicksByUser, activeRoundSeries, series, settings);
  const standings = buildStandings(memberList, allPicksByUser, series, settings).map((member) => ({
    ...member,
    roundWinOdds: currentRoundWinOdds[member.id] ?? 0,
  }));
  const currentStandingIndex = standings.findIndex((member) => member.id === profile?.id);
  const currentStanding = currentStandingIndex >= 0 ? standings[currentStandingIndex] : null;
  const leader = standings[0] ?? null;
  const pointsBack = leader && currentStanding ? leader.summary.totalPoints - currentStanding.summary.totalPoints : 0;

  const rootingRows = activeRoundSeries
    .map((seriesItem) => {
      const pick = picksBySeriesId[seriesItem.id];
      const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
      const note = buildRootingNote(seriesItem, pick, marketSummary, canViewPoolSignals);
      const pickedShare = !pick
        ? 0
        : !canViewPoolSignals
          ? 50
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
    .sort((a, b) => b.leverageScore - a.leverageScore);

  const exposureRows = (canViewPoolSignals ? activeRoundSeries : [])
    .map((seriesItem) => {
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
        noPickCount: marketSummary.noPickCount,
      };
    })
    .sort((a, b) => Math.max(b.homePct, b.awayPct) - Math.max(a.homePct, a.awayPct));

  const swingRows = activeRoundSeries
    .map((seriesItem) => {
      const pick = picksBySeriesId[seriesItem.id] ?? null;
      const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
      const swing = buildSwingSummary(seriesItem, pick, marketSummary, currentStandingIndex, memberList.length, canViewPoolSignals);
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
    .sort((a, b) => b.swingScore - a.swingScore);

  const probabilityRows = activeRoundSeries
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
          ? "This series is still pure variance for your odds"
          : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
            ? `${yourTeam.abbreviation} is your clearest odds swing`
            : `${yourTeam?.abbreviation ?? "This series"} is mostly defensive for your odds`,
        body: !yourPick
          ? "You have not picked this series yet, so your current-round win odds are unusually exposed here."
          : !canViewPoolSignals
            ? "Before lock, this is best read as a public-signals swing: market and model say this series can still change your path more than it first appears."
          : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
            ? `Only ${formatPct(pickedPct)} of the room is with you here. If ${yourTeam.abbreviation} hits, your current-round win odds should jump more than on a consensus result.`
            : `About ${formatPct(pickedPct)} of the pool is already with you. This result matters more for protecting position than creating separation.`,
        leverage: (yourPick ? Math.abs(50 - pickedPct) : 42) + Math.abs((seriesItem.market.homeWinPct ?? 50) - (seriesItem.model.homeWinPct ?? 50)),
        marketLean: formatLean(seriesItem, seriesItem.market),
        modelLean: formatLean(seriesItem, seriesItem.model),
      };
    })
    .sort((a, b) => b.leverage - a.leverage);

  const contrarianCount = canViewPoolSignals
    ? rootingRows.filter((row) => row.pickedShare <= 35 && row.status !== "No pick entered").length
    : 0;
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
  const heroState = buildReportHeroState(reportKey, {
    reportsSummary,
    currentRound,
    currentStanding,
    incompleteCount,
    scenarioRows,
    rootingRows,
    exposureRows,
    swingRows,
    probabilityRows,
    showScenarioCard,
  });

  return (
    <div className="nba-shell">
      <div className="report-back-shell">
        <Link className="back-link" to="/reports">← Back to Reports</Link>
      </div>

      <section className="panel nba-reports-hero">
        <div>
          <span className="label">{reportConfig.label}</span>
          <h2>{reportConfig.title}</h2>
          <p className="subtle">{heroState.body}</p>
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

      {reportKey === "rooting" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Rooting guide</span>
              <h2>Every active-round series, in order</h2>
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
        </section>
      ) : null}

      {reportKey === "exposure" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Pool exposure</span>
              <h2>How concentrated the room is, series by series</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {canViewPoolSignals ? exposureRows.map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.matchup}</strong>
                  <p>Consensus: {row.consensusTeam}</p>
                  <p>{row.homePct}% on the home side · {row.awayPct}% on the away side</p>
                  <p>Most common length: {row.leadingGames ? `${row.leadingGames} games` : "No lean yet"} · Open cards: {row.noPickCount}</p>
                </div>
              </div>
            )) : (
              <div className="nba-dashboard-row nba-dashboard-row-stacked">
                <div>
                  <strong>Pool exposure is private until lock</strong>
                  <p>This report opens into real room context once the round locks or games begin. Until then, stick to market, model, and bracket signals.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {reportKey === "swing" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Swing spots</span>
              <h2>The series most likely to move your position</h2>
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
        </section>
      ) : null}

      {reportKey === "win-odds" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Win odds</span>
              <h2>Where your current-round probability is coming from</h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            <div className="nba-dashboard-row nba-dashboard-row-stacked">
              <div>
                <strong>{currentStanding ? `${currentStanding.roundWinOdds}% current-round win odds` : "Current-round odds still forming"}</strong>
                <p>
                  This first-pass number simulates the unresolved series in the current round using the market probabilities already on the board.
                </p>
              </div>
            </div>
            {probabilityRows.map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.matchup}</p>
                  <p>{row.body}</p>
                  <p>Market lean: {row.marketLean} · Model lean: {row.modelLean}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {reportKey === "scenarios" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <span className="label">Scenario watch</span>
              <h2>
                {seasonPhase === "play_in_week"
                  ? "How the Play-In can reshape your first-round board"
                  : "How the final seeding chaos should shape your read"}
              </h2>
            </div>
          </div>
          <div className="nba-dashboard-list">
            {SCENARIO_WATCH_ITEMS.map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.sourced}</p>
                  <p>{item.likelyImpact}</p>
                  <p>{item.whyItMatters}</p>
                </div>
              </div>
            ))}
            <p className="subtle">
              Sourced through {SCENARIO_WATCH_DATE}. Matchup and market consequences here are local product inference meant to preview how the shared commentary layer should eventually behave.
            </p>
          </div>
        </section>
      ) : null}

      {reportKey === "outlook" ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Position outlook</span>
                <h2>How to read your spot in the pool</h2>
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
                        ? "You are level with the top of the pool, so the biggest risk now is getting caught on the room's chalk while someone else hits a live swing."
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
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <span className="label">Standings context</span>
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
        </>
      ) : null}
    </div>
  );
}
