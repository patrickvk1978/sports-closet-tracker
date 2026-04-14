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
  canViewPoolSignals = false,
  picksLoading = false,
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
      const pickedShare = !pick || !canViewPoolSignals
        ? 0
        : pick.winnerTeamId === series.homeTeam.id
          ? pool.homePct
          : pool.awayPct;
      const marketHome = series.market.homeWinPct ?? 50;
      const modelHome = series.model.homeWinPct ?? 50;
      const marketModelGap = Math.abs(marketHome - modelHome);
      const modelFavorite = modelHome >= (series.model.awayWinPct ?? 50) ? series.homeTeam : series.awayTeam;
      const marketFavorite = marketHome >= (series.market.awayWinPct ?? 50) ? series.homeTeam : series.awayTeam;
      const againstRoom = canViewPoolSignals && Boolean(pool.consensusWinnerTeamId && pick?.winnerTeamId && pool.consensusWinnerTeamId !== pick.winnerTeamId);
      const followsModel = Boolean(pick?.winnerTeamId && pick.winnerTeamId === modelFavorite.id);
      const fadesMarket = Boolean(pick?.winnerTeamId && pick.winnerTeamId !== marketFavorite.id);
      const confidence = Math.max(series.market.homeWinPct ?? 50, series.market.awayWinPct ?? 50);

      return {
        series,
        pick,
        yourTeam,
        pool,
        pickedShare,
        againstRoom,
        followsModel,
        fadesMarket,
        confidence,
        marketModelGap,
        score: (pick ? 0 : 36) + (againstRoom ? 18 : 0) + Math.abs(50 - pickedShare) + marketModelGap,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const openPickCount = Object.values(picksBySeriesId).filter((pick) => pick?.winnerTeamId).length;
  const totalSeriesCount = activeRoundSeries.length || featuredSeries.length || 0;
  const completedShare = totalSeriesCount > 0 ? openPickCount / totalSeriesCount : 0;
  const shouldLeadWithScenario = scenarioItems.length > 0 && (isQuietPrePlayoffBoard || openPickCount === 0);

  if (picksLoading) {
    return null;
  }

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
      const mostUnsettled = ranked.find((entry) => !entry.pick) ?? ranked[0];
      return {
        eyebrow: "What matters right now",
        headline: mostUnsettled?.pick
          ? `${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} is the matchup worth revisiting first.`
          : "The Play-In is less about drama now and more about mispricing your board.",
        body: mostUnsettled?.pick
          ? `Your card is mostly filled in, but ${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} still carries one of the widest market-model gaps on the board. That is a better use of your attention than rereading settled favorites.`
          : "The useful job this week is not just watching the bracket settle. It is finding the one or two series where a Play-In path or pricing shift should actually move your pick.",
        actionLabel: mostUnsettled?.pick ? "Open reports" : "Review bracket",
        actionPath: mostUnsettled?.pick ? "/reports" : "/bracket",
        support: "Round 1 selections lock on Saturday, April 18, 2026. The best use of this window is tightening the handful of series that still have real movement in them.",
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

  if (openPickCount === 0 && totalSeriesCount > 0) {
    return {
      eyebrow: "Start with your card",
      headline: `You have not started ${currentRound.label} yet.`,
      body: "The best first move is not opening every report. It is getting your first few series onto the board so the app can stop talking in generalities and start helping with your actual decisions.",
      actionLabel: "Start picking",
      actionPath: "/series",
      support: "Once you have a few live picks in place, this card can get much more specific about where you are exposed, where the market disagrees, and what deserves another look.",
    };
  }

  if (completedShare > 0 && completedShare < 1 && !top.pick) {
    return {
      eyebrow: "Finish the board",
      headline: `${matchup} is still the main thing between you and a usable read.`,
      body: `${placeLabel} You have started the round, which is good. But until the remaining open series are filled in, the best use of the dashboard is helping you get to a complete card, not pretending your position is fully formed yet.`,
      actionLabel: "Finish this round",
      actionPath: "/series",
      support: "Complete the card first. Then the reports become much more about judgment and much less about housekeeping.",
    };
  }

  if (completedShare === 1 && !canViewPoolSignals && top.marketModelGap < 10 && top.confidence < 66) {
    return {
      eyebrow: "Board review",
      headline: "Your card is in. Now narrow it to the two series worth reopening.",
      body: `${placeLabel} You do not need another full lap through every matchup. The useful job now is finding the one or two series where your confidence still depends on a real market-model question rather than habit.`,
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: "That is the right pre-lock rhythm: finish the board, then revisit only the handful of series that can still change it.",
    };
  }

  if (!top.pick) {
    const leanGap = `${formatLean(top.series, top.series.market)} market, ${formatLean(top.series, top.series.model)} model`;
    return {
      eyebrow: "What matters right now",
      headline: `${matchup} is still the decision holding your card back.`,
      body: `${placeLabel} This is the cleanest unresolved series in ${currentRound.label}, and it is not just a blank cell. It is one of the matchups where outside signals can still tell you something useful: ${leanGap}.`,
      actionLabel: "Make that pick",
      actionPath: "/series",
      support: "Finish the open series first, then go back for the higher-level strategy reads. This is still the fastest way to improve the board.",
    };
  }

  if (canViewPoolSignals && top.againstRoom && top.yourTeam) {
    return {
      eyebrow: "What matters right now",
      headline: `${top.yourTeam.abbreviation} is your clearest swing right now.`,
      body: `${placeLabel} Only ${Math.round(top.pickedShare)}% of the room is with you here, so ${top.yourTeam.abbreviation} gives you your best separation path. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: "This is the type of leverage note the app should keep surfacing as live state and probabilities update.",
    };
  }

  if (!canViewPoolSignals && top.fadesMarket && top.yourTeam) {
    return {
      eyebrow: "What matters right now",
      headline: `${top.yourTeam.abbreviation} is the boldest line on your card right now.`,
      body: `${placeLabel} You are fading the market favorite in ${matchup}, which makes this less about what the room is doing and more about whether the model and path are giving you enough reason to stay there.`,
      actionLabel: "Check market vs model",
      actionPath: "/reports/probabilities",
      support: "Pre-lock, the best tension to study is not room exposure. It is where your card is leaning away from the public price for a real reason.",
    };
  }

  if (!canViewPoolSignals && top.marketModelGap >= 10) {
    return {
      eyebrow: "What matters right now",
      headline: `${matchup} is where the outside signals disagree most.`,
      body: `${placeLabel} The market and model are not reading this series the same way, which makes it the most useful place to pressure-test your card before lock rather than just confirming the obvious favorites.`,
      actionLabel: "Open win odds",
      actionPath: "/reports/probabilities",
      support: "This is the kind of disagreement that should change a pick only if you can explain why. If not, it is still your best candidate for a last serious review.",
    };
  }

  if (top.confidence >= 66 && top.yourTeam) {
    return {
      eyebrow: "What matters right now",
      headline: `${top.yourTeam.abbreviation} looks like a hold, not a hero play.`,
      body: `${placeLabel} The public signals are fairly aligned on ${matchup}, so the useful question here is not whether to invent drama. It is whether this is one of the series where staying disciplined protects the rest of your card.`,
      actionLabel: "Open swing spots",
      actionPath: "/reports/swing",
      support: "Not every series needs a flourish. Some are just there to keep the board intact while you decide where the real leverage belongs.",
    };
  }

  return {
    eyebrow: "What matters right now",
    headline: `${matchup} is more about pressure-testing your logic than chasing a headline.`,
    body: `${placeLabel} This series is not screaming for a move, but it is still the best place to ask whether your pick is supported by the market, the model, and the bracket path instead of just habit.`,
    actionLabel: "See full reports",
    actionPath: "/reports",
    support: "That is often the real pre-lock job: not finding five dramatic moves, but finding the one or two places where your reasoning still needs to be sharpened.",
  };
}
