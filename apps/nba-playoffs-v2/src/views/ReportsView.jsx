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

function winnerLabel(series, winnerTeamId, games) {
  if (!winnerTeamId) return "No pick";
  const team = winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  return `${team.abbreviation} in ${games}`;
}

function buildRootingNote(series, pick, marketSummary) {
  if (!pick) {
    return {
      title: chooseVariant([
        `Make your ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} pick`,
        `${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} still needs your call`,
        "This is still an open decision on your card",
      ], series.id, "root-open-title"),
      body: chooseVariant([
        "You have not picked this series yet, so this is the clearest place to lock in value before the room moves around you.",
        "This is still blank on your card, which makes it a better use of attention than rechecking already-settled spots.",
        "Until this series is filled in, the rest of the report has to work around an avoidable hole.",
      ], series.id, "root-open-body"),
    };
  }

  const pickedTeam = pick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  const otherTeam = pick.winnerTeamId === series.homeTeam.id ? series.awayTeam : series.homeTeam;
  const againstField = marketSummary.consensusWinnerTeamId && marketSummary.consensusWinnerTeamId !== pick.winnerTeamId;
  const pickedShare = pick.winnerTeamId === series.homeTeam.id ? marketSummary.homePct : marketSummary.awayPct;

  if (againstField) {
    return {
      title: pickedShare <= 28
        ? chooseVariant([
            `${pickedTeam.abbreviation} is one of your real separation bets`,
            `You need ${pickedTeam.abbreviation} a lot more than the room does`,
            `${pickedTeam.abbreviation} is your clearest contrarian root here`,
          ], series.id, pickedTeam.abbreviation, "root-hard-title")
        : chooseVariant([
            `You need ${pickedTeam.abbreviation} more than the room does`,
            `${pickedTeam.abbreviation} is still giving you real leverage`,
            `${pickedTeam.abbreviation} is a live swing side for you`,
          ], series.id, pickedTeam.abbreviation, "root-title"),
      body: pickedShare <= 28
        ? chooseVariant([
            `${pickedTeam.city} is a true minority position for you here. Most of the pool is leaning ${otherTeam.abbreviation}, so this result can create real movement fast.`,
            `This is not just mild disagreement. ${pickedTeam.abbreviation} sits well off the room's center, which makes this one of your cleaner upside routes.`,
            `${pickedTeam.abbreviation} is the kind of result that can actually separate your card, not just decorate it.`,
          ], series.id, pickedTeam.abbreviation, "root-hard-body")
        : chooseVariant([
            `${pickedTeam.city} is your leverage side here. Most of the pool is leaning ${otherTeam.abbreviation}, so a ${pickedTeam.abbreviation} win would help you make up ground fast.`,
            `${pickedTeam.abbreviation} is still against the room enough to matter. This is a useful swing, even if it is not your wildest one.`,
            `The room is still tilted toward ${otherTeam.abbreviation}, which gives ${pickedTeam.abbreviation} enough separation value to deserve real attention.`,
          ], series.id, pickedTeam.abbreviation, "root-body"),
    };
  }

  if (marketSummary.consensusWinnerTeamId === pick.winnerTeamId) {
    return {
      title: pickedShare >= 72
        ? chooseVariant([
            `${pickedTeam.abbreviation} is mostly a protect-the-board root`,
            `${pickedTeam.abbreviation} is defensive rooting for you`,
            `${pickedTeam.abbreviation} is about avoiding damage more than creating it`,
          ], series.id, pickedTeam.abbreviation, "defense-hard-title")
        : chooseVariant([
            `${pickedTeam.abbreviation} is more hold than swing`,
            `${pickedTeam.abbreviation} is a steadier result for you`,
            `${pickedTeam.abbreviation} is not your loudest path, but it still matters`,
          ], series.id, pickedTeam.abbreviation, "defense-title"),
      body: pickedShare >= 72
        ? chooseVariant([
            `You are very much with the room on this series, so ${pickedTeam.abbreviation} winning is more about not losing ground than creating any real separation.`,
            `${pickedTeam.abbreviation} is close to chalk for your pool, which makes this result more about stability than upside.`,
            `This is the kind of pick that keeps your board intact. The reward is mostly in avoiding a miss, not pulling away.`,
          ], series.id, pickedTeam.abbreviation, "defense-hard-body")
        : chooseVariant([
            `You are with a decent chunk of the room on this series, so ${pickedTeam.abbreviation} is more about holding your footing than springing a jump.`,
            `${pickedTeam.abbreviation} is not pure chalk, but it is still a result that protects more than it surprises.`,
            `This is one of those roots that helps more by staying on script than by creating fireworks.`,
          ], series.id, pickedTeam.abbreviation, "defense-body"),
    };
  }

  return {
    title: chooseVariant([
      `Watch ${pickedTeam.abbreviation} for your own path`,
      `${pickedTeam.abbreviation} is still a live read for your board`,
      `${pickedTeam.abbreviation} sits in the useful middle ground`,
    ], series.id, pickedTeam.abbreviation, "middle-title"),
    body: chooseVariant([
      `${pickedTeam.city} is still a meaningful result for your card even though the room has not settled strongly on either side yet.`,
      `The pool has not crowded this matchup too hard, which makes ${pickedTeam.abbreviation} a quieter but still useful swing.`,
      `${pickedTeam.abbreviation} is not giving you full contrarian juice, but it still matters because the room has not fully decided this series either.`,
    ], series.id, pickedTeam.abbreviation, "middle-body"),
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
      title: chooseVariant([
        "Unmade pick is the biggest swing here",
        "Blank card is still the main volatility here",
        "No pick means this series is all uncertainty for you",
      ], series.id, "swing-open-title"),
      body: chooseVariant([
        `You are still open on ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation}. Until you pick a side, this series is pure uncertainty for your position.`,
        `This matchup is still unresolved on your card, so the biggest movement here is still self-inflicted rather than strategic.`,
        `Before you can judge upside or defense here, you still need to decide which result you actually want attached to your board.`,
      ], series.id, "swing-open-body"),
    };
  }

  const pickedTeam = yourPick.winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  const roomPct = yourPick.winnerTeamId === series.homeTeam.id ? marketSummary.homePct : marketSummary.awayPct;
  const place = currentStandingIndex >= 0 ? currentStandingIndex + 1 : null;

  if (roomPct <= 22) {
    return {
      title: chooseVariant([
        `${pickedTeam.abbreviation} is one of your loudest upside swings`,
        `${pickedTeam.abbreviation} is a real jump-ball result for your place`,
        `${pickedTeam.abbreviation} is the kind of hit that can actually move you`,
      ], series.id, pickedTeam.abbreviation, "swing-hard-up-title"),
      body: chooseVariant([
        `Only ${formatPct(roomPct)} of the room is with ${pickedTeam.abbreviation}, so this is one of your clearest ways to make up real ground from ${place ? ordinal(place) : "where you are now"}.`,
        `${pickedTeam.abbreviation} is well off the room's center here. If this lands for you, the reward is more than cosmetic.`,
        `This is one of the rare results that can actually change the shape of your week instead of just nudging it.`,
      ], series.id, pickedTeam.abbreviation, place, "swing-hard-up-body"),
    };
  }

  if (roomPct <= 38) {
    return {
      title: chooseVariant([
        `${pickedTeam.abbreviation} is your upside swing`,
        `${pickedTeam.abbreviation} is still a live gain spot`,
        `${pickedTeam.abbreviation} gives you some real separation room`,
      ], series.id, pickedTeam.abbreviation, "swing-up-title"),
      body: chooseVariant([
        `${formatPct(roomPct)} of the room is with ${pickedTeam.abbreviation}, so this is one of your clearer ways to gain from ${place ? ordinal(place) : "your current position"}.`,
        `${pickedTeam.abbreviation} is still enough of a minority result to matter if you are trying to create movement.`,
        `This is not your most extreme leverage point, but it is still one of the series that can help you climb rather than just hold.`,
      ], series.id, pickedTeam.abbreviation, place, "swing-up-body"),
    };
  }

  if (roomPct >= 78) {
    return {
      title: chooseVariant([
        `${pickedTeam.abbreviation} is mostly about holding serve`,
        `${pickedTeam.abbreviation} is close to pure defense for you`,
        `${pickedTeam.abbreviation} is a protect-position result first`,
      ], series.id, pickedTeam.abbreviation, "swing-defense-hard-title"),
      body: chooseVariant([
        `${formatPct(roomPct)} of the pool is already on your side here. That makes this series much more about not losing ground than about creating any real separation.`,
        `${pickedTeam.abbreviation} is so close to pool consensus that the upside is thin. The value here is mostly in avoiding a leak.`,
        `When this much of the room agrees with you, the interesting part is not upside. It is the cost of being wrong.`,
      ], series.id, pickedTeam.abbreviation, "swing-defense-hard-body"),
    };
  }

  if (roomPct >= 62) {
    return {
      title: chooseVariant([
        `${pickedTeam.abbreviation} is more hold than jump`,
        `${pickedTeam.abbreviation} is leaning defensive for you`,
        `${pickedTeam.abbreviation} is steadier than explosive`,
      ], series.id, pickedTeam.abbreviation, "swing-defense-title"),
      body: chooseVariant([
        `${formatPct(roomPct)} of the pool is already with you, so this result helps more by keeping you on pace than by creating a real burst.`,
        `${pickedTeam.abbreviation} still matters, but the payoff is more about protecting your place than springing a surprise.`,
        `A lot of the room is already parked here, which means this series is useful mainly as a stability check.`,
      ], series.id, pickedTeam.abbreviation, "swing-defense-body"),
    };
  }

  return {
    title: chooseVariant([
      `${pickedTeam.abbreviation} is a live middle-ground swing`,
      `${pickedTeam.abbreviation} sits in the useful middle of the board`,
      `${pickedTeam.abbreviation} is neither chalk nor a moonshot`,
    ], series.id, pickedTeam.abbreviation, "swing-middle-title"),
    body: chooseVariant([
      `${formatPct(roomPct)} of the pool agrees with you, so this series can still move your standing without being a full contrarian bet. ${poolSize > 2 ? "A clean result here can matter more than it looks." : ""}`,
      `The room is split enough that ${pickedTeam.abbreviation} can still move your place, but not so split that it has to carry the whole card.`,
      `${pickedTeam.abbreviation} lives in that useful in-between zone: enough agreement to feel sane, enough disagreement to still matter.`,
    ], series.id, pickedTeam.abbreviation, poolSize, "swing-middle-body"),
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
      headline: chooseVariant([
        "Today is still about the bracket settling, not just your picks",
        "The board is still being shaped before it can really be judged",
        "Right now the useful job is reading the bracket movement before lock",
      ], currentRound?.key, pointsBack, "summary-scenario-head"),
      body: chooseVariant([
        "The most useful read right now is which finale-day results and Play-In paths will reshape Round 1 before the Saturday, April 18, 2026 lock.",
        "Before you over-interpret your own board, make sure the bracket inputs underneath it have actually settled.",
        "This is still a pre-lock information problem before it becomes a true strategy problem.",
      ], currentRound?.key, incompleteCount, "summary-scenario-body"),
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (incompleteCount > 0) {
    return {
      headline: chooseVariant([
        `${incompleteCount} ${incompleteCount === 1 ? "series still needs your pick" : "series still need your picks"}`,
        `Your board still has ${incompleteCount} open ${incompleteCount === 1 ? "series" : "series"}`,
        `You still have ${incompleteCount} unresolved ${incompleteCount === 1 ? "decision" : "decisions"} before the report gets sharper`,
      ], currentRound?.key, incompleteCount, "summary-open-head"),
      body: chooseVariant([
        `Your report story is still mostly about getting fully set for ${currentRound.label}. Once the board is filled in, the leverage picture will sharpen fast.`,
        "Right now the best use of the reports is helping you finish the card, not pretending the strategic read is already complete.",
        "A fuller board will immediately make these reads more actionable. Until then, the biggest edge is still housekeeping done well.",
      ], currentRound?.key, incompleteCount, "summary-open-body"),
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (pointsBack <= 2) {
    return {
      headline: chooseVariant([
        "You are within one series of the lead",
        "You are close enough that one clean swing can matter",
        "This is still a one-series race for you",
      ], placeLabel, pointsBack, "summary-close-head"),
      body: chooseVariant([
        `From ${placeLabel}, your reports are mostly about protecting good ground while finding one or two spots that can still create separation.`,
        `From ${placeLabel}, this is less about a wild comeback and more about identifying the couple of places where a clean read can still move you.`,
        "You are close enough that discipline matters as much as aggression here. One or two good swings can do plenty.",
      ], placeLabel, pointsBack, "summary-close-body"),
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (contrarianCount > 0) {
    return {
      headline: chooseVariant([
        `${contrarianCount} contrarian ${contrarianCount === 1 ? "call is" : "calls are"} carrying your upside`,
        `Your best climb is still tied to ${contrarianCount} contrarian ${contrarianCount === 1 ? "spot" : "spots"}`,
        `The card is asking your off-room ${contrarianCount === 1 ? "pick" : "picks"} to do real work`,
      ], contrarianCount, placeLabel, "summary-contrarian-head"),
      body: chooseVariant([
        `You are chasing from ${placeLabel}, and your clearest path is through the series where you differ meaningfully from the room.`,
        `From ${placeLabel}, the upside still lives mostly in the places where your board is willing to break from consensus.`,
        "If you are going to climb from here, it is probably not through the safe spots. It is through the series where your card has some nerve.",
      ], contrarianCount, placeLabel, "summary-contrarian-body"),
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Contrarian picks", value: contrarianCount },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  return {
    headline: chooseVariant([
      "Your board is mostly aligned with the room",
      "The card is not screaming for a huge rewrite",
      "This board looks steadier than dramatic right now",
    ], placeLabel, pointsBack, "summary-steady-head"),
    body: chooseVariant([
      `From ${placeLabel}, this report set is less about one huge swing and more about where market, model, and pool consensus start to diverge.`,
      "The useful work now is not inventing drama. It is finding the quieter places where the signals start to separate.",
      "This is the kind of board that benefits more from sharper pressure-testing than from forced action.",
    ], placeLabel, pointsBack, "summary-steady-body"),
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
