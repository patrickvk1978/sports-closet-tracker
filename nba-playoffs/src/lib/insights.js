import { summarizeSeriesMarket } from "./seriesPickem";

const FINALE_DAY_END = new Date("2026-04-12T23:59:59-04:00");
const PLAY_IN_START = new Date("2026-04-13T00:00:00-04:00");
const ROUND_ONE_LOCK = new Date("2026-04-18T00:00:00-04:00");

export function getSeasonPhase(now = new Date()) {
  if (now <= FINALE_DAY_END) return "finale_day";
  if (now >= PLAY_IN_START && now < ROUND_ONE_LOCK) return "play_in_week";
  return "round_one_window";
}

export function formatLean(series, source, formatter = (team, pct) => `${team.abbreviation} ${pct}%`) {
  if (!series || !source) return "Waiting on matchup";
  if ((source.homeWinPct ?? 0) === (source.awayWinPct ?? 0)) return "Even";
  return source.homeWinPct >= source.awayWinPct
    ? formatter(series.homeTeam, source.homeWinPct)
    : formatter(series.awayTeam, source.awayWinPct);
}

export function buildCommentaryPreview({
  featuredSeries,
  activeRoundSeries = [],
  picksBySeriesId,
  allPicksByUser,
  memberList,
  currentRound,
  currentStanding,
  scenarioItems = [],
  scenarioDate = "",
}) {
  const seasonPhase = getSeasonPhase();
  const scenarioSourceSeries = activeRoundSeries.length ? activeRoundSeries : featuredSeries;
  const isQuietPrePlayoffBoard = scenarioSourceSeries.length > 0 && scenarioSourceSeries.every((series) => {
    const totalWins = (series.wins?.home ?? 0) + (series.wins?.away ?? 0);
    return series.status === "scheduled" && totalWins === 0;
  });
  const liveSeries = scenarioSourceSeries.filter((series) => series.status === "in_progress");
  const rankingSourceSeries = featuredSeries.length ? featuredSeries : scenarioSourceSeries;
  const ranked = rankingSourceSeries
    .map((series) => {
      const pick = picksBySeriesId[series.id] ?? null;
      const pool = summarizeSeriesMarket(allPicksByUser, memberList, series);
      const yourTeam = !pick
        ? null
        : pick.winnerTeamId === series.homeTeam.id
          ? series.homeTeam
          : series.awayTeam;
      const pickedShare = !pick
        ? 0
        : pick.winnerTeamId === series.homeTeam.id
          ? pool.homePct
          : pool.awayPct;
      const marketModelGap = Math.abs((series.market.homeWinPct ?? 50) - (series.model.homeWinPct ?? 50));
      const againstRoom = Boolean(pool.consensusWinnerTeamId && pick?.winnerTeamId && pool.consensusWinnerTeamId !== pick.winnerTeamId);

      return {
        series,
        pick,
        yourTeam,
        pool,
        pickedShare,
        againstRoom,
        marketModelGap,
        score: (pick ? 0 : 36) + (againstRoom ? 18 : 0) + Math.abs(50 - pickedShare) + marketModelGap,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const openPickCount = Object.values(picksBySeriesId).filter((pick) => pick?.winnerTeamId).length;
  const shouldLeadWithScenario = scenarioItems.length > 0 && (isQuietPrePlayoffBoard || openPickCount === 0);

  if (liveSeries.length > 0 && top) {
    return {
      eyebrow: "What matters right now",
      headline: `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation} is moving your board live.`,
      body: `${Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now. ` : ""}This is the clearest live swing on your card. Watch how the market and model shift as the game state changes, because that should shape how you think about the remaining open series before lock.`,
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: "This is where the real-time commentary layer should eventually react to live results, probability movement, and your position in the pool.",
    };
  }

  if (shouldLeadWithScenario) {
    if (seasonPhase === "play_in_week") {
      return {
        eyebrow: "What matters right now",
        headline: "The Play-In is shaping your Round 1 board now.",
        body: "The bracket may still look static, but the real work this week is reading which Play-In outcomes reroute the East and West first-round paths, then adjusting your card before the lock.",
        actionLabel: "Review bracket",
        actionPath: "/bracket",
        support: "Round 1 selections lock on Saturday, April 18, 2026. This is the window where matchup movement and probability changes should guide your final series picks.",
      };
    }

    const primaryScenario = scenarioItems[0];
    return {
      eyebrow: "What matters right now",
      headline: primaryScenario.title,
      body: `${primaryScenario.sourced} ${primaryScenario.likelyImpact}`,
      actionLabel: "Review scenario watch",
      actionPath: "/",
      support: `${primaryScenario.whyItMatters}${scenarioDate ? ` The key date here is ${scenarioDate}.` : ""} Round 1 locks on Saturday, April 18, 2026.`,
    };
  }

  if (!top) {
    return {
      eyebrow: "What matters right now",
      headline: "Your pool story will sharpen once the board fills in.",
      body: "As picks and live results settle, this space can focus on the single series most likely to change your position.",
      actionLabel: "Open series tracker",
      actionPath: "/series",
      support: "This early version is reading from your card, the room, and the probability signals already on the board.",
    };
  }

  const placeLabel = Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now.` : "";
  const matchup = `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation}`;

  if (!top.pick) {
    return {
      eyebrow: "What matters right now",
      headline: `${matchup} is still open on your card.`,
      body: `${placeLabel} This is the clearest unresolved series in ${currentRound.label}. The market leans ${formatLean(top.series, top.series.market)}, while the model sits at ${formatLean(top.series, top.series.model)}.`,
      actionLabel: "Make that pick",
      actionPath: "/series",
      support: "Right now the clearest move is to settle this series before the room and the probabilities move around you.",
    };
  }

  if (top.againstRoom && top.yourTeam) {
    return {
      eyebrow: "What matters right now",
      headline: `${top.yourTeam.abbreviation} is your clearest swing right now.`,
      body: `${placeLabel} Only ${Math.round(top.pickedShare)}% of the room is with you here, so ${top.yourTeam.abbreviation} gives you your best separation path. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: "This is the type of leverage note the app should keep surfacing as live state and probabilities update.",
    };
  }

  return {
    eyebrow: "What matters right now",
    headline: `${matchup} is more about holding position than creating it.`,
    body: `${placeLabel} You are mostly moving with the room on this one, so the interesting question is whether the market/model split creates a reason to watch more closely. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
    actionLabel: "See full reports",
    actionPath: "/reports",
    support: "For now, the important read is simple: this result is more about protecting your place than making a big leap.",
  };
}
