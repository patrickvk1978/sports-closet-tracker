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
      eyebrow: chooseVariant(["What matters right now", "Live board", "Booth read"], top.series.id, "live-eyebrow"),
      headline: chooseVariant([
        `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation} is moving your board live.`,
        `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation} just became the loudest thing on your card.`,
        `This is the live series tugging hardest on your board right now.`,
      ], top.series.id, currentStanding?.place, "live-head"),
      body: chooseVariant([
        `${Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now. ` : ""}This is the clearest live swing on your card. Watch how the market and model shift as the game state changes, because that should shape how you think about the remaining open series before lock.`,
        `${Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now. ` : ""}This is no longer background motion. It is the result putting the most tension on your board in real time.`,
        `${Number.isFinite(currentStanding?.place) ? `From ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"}, ` : ""}this is the one live matchup most capable of changing how the rest of the card feels.`,
      ], top.series.id, currentStanding?.place, "live-body"),
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: chooseVariant([
        "This is where the real-time commentary layer should react to live results, probability movement, and your position in the pool.",
        "The useful live read is not just the score. It is what that score is doing to your path.",
        "Live windows should feel like coaching with pulse, not just motion for motion's sake.",
      ], top.series.id, "live-support"),
    };
  }

  if (shouldLeadWithScenario) {
    if (seasonPhase === "play_in_week") {
      return {
        eyebrow: chooseVariant(["What matters right now", "Pre-lock note", "Board check"], currentRound?.key, "playin-eyebrow"),
        headline: chooseVariant([
          "The Play-In is shaping your Round 1 board now.",
          "The bracket is still moving underneath your board.",
          "The useful Play-In question is what should actually move your board.",
        ], currentRound?.key, "playin-head"),
        body: chooseVariant([
          "The bracket may still look static, but the real work this week is reading which Play-In outcomes reroute the East and West first-round paths, then adjusting your card before the lock.",
          "This week is less about enjoying the drama and more about identifying which outcomes should actually change a board decision before lock.",
          "Do not confuse movement with relevance. Only a few Play-In paths should really earn a board move.",
        ], currentRound?.key, "playin-body"),
        actionLabel: "Review bracket",
        actionPath: "/bracket",
        support: chooseVariant([
          "Round 1 selections lock on Saturday, April 18, 2026. This is the window where matchup movement and probability changes should guide your final series picks.",
          "Before lock, the best work is usually subtraction: identify the few live questions and leave the rest alone.",
          "This is the phase where discipline beats volume.",
        ], currentRound?.key, "playin-support"),
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
      eyebrow: chooseVariant(["What matters right now", "Board note", "Start here"], currentRound?.key, "notop-eyebrow"),
      headline: chooseVariant([
        "Your pool story will sharpen once the board fills in.",
        "The useful story starts once the card gives us something real to react to.",
        "This read gets better the moment the board stops being mostly blank.",
      ], currentRound?.key, "notop-head"),
      body: chooseVariant([
        "As picks and live results settle, this space can focus on the single series most likely to change your position.",
        "Right now this card still has to speak broadly. A fuller board lets it start pointing to the one or two places that really matter.",
        "The product can only coach what it can see. Once the card has more shape, this becomes much more useful.",
      ], currentRound?.key, "notop-body"),
      actionLabel: "Open series tracker",
      actionPath: "/series",
      support: chooseVariant([
        "This early version is reading from your card, the room, and the probability signals already on the board.",
        "A blank board makes for generic advice. A real board makes for coaching.",
        "The sharper read comes when the board gives the inputs something specific to react to.",
      ], currentRound?.key, "notop-support"),
    };
  }

  const placeLabel = Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now.` : "";
  const matchup = `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation}`;

  if (!top.pick) {
    return {
      eyebrow: chooseVariant(["What matters right now", "Open decision", "Still unresolved"], top.series.id, "unpicked-eyebrow"),
      headline: chooseVariant([
        `${matchup} is still open on your card.`,
        `${matchup} is the clearest unfinished spot on your board.`,
        `${matchup} is still the best place to spend your attention first.`,
      ], top.series.id, currentRound?.key, "unpicked-head"),
      body: chooseVariant([
        `${placeLabel} This is the clearest unresolved series in ${currentRound.label}. The market leans ${formatLean(top.series, top.series.market)}, while the model sits at ${formatLean(top.series, top.series.model)}.`,
        `${placeLabel} This is still an open decision, but at least it is an open decision with real signal behind it. Market: ${formatLean(top.series, top.series.market)}. Model: ${formatLean(top.series, top.series.model)}.`,
        `${placeLabel} If you are going to settle one unresolved series first, this is a good candidate because the outside reads are still adding something real. Market: ${formatLean(top.series, top.series.market)}. Model: ${formatLean(top.series, top.series.model)}.`,
      ], top.series.id, currentRound?.key, placeLabel, "unpicked-body"),
      actionLabel: "Make that pick",
      actionPath: "/series",
      support: chooseVariant([
        "Right now the clearest move is to settle this series before the room and the probabilities move around you.",
        "This is still a better use of time than rereading already-settled spots.",
        "The fastest path to a smarter board is still a complete board.",
      ], top.series.id, "unpicked-support"),
    };
  }

  if (top.againstRoom && top.yourTeam) {
    return {
      eyebrow: chooseVariant(["What matters right now", "Leverage check", "Against the room"], top.series.id, "against-eyebrow"),
      headline: top.pickedShare <= 25
        ? chooseVariant([
            `${top.yourTeam.abbreviation} is your loudest separation bet right now.`,
            `${top.yourTeam.abbreviation} is the place where your board is really trying to move.`,
            `${top.yourTeam.abbreviation} is your cleanest upside swing right now.`,
          ], top.series.id, top.yourTeam.abbreviation, "against-hard-head")
        : chooseVariant([
            `${top.yourTeam.abbreviation} is your clearest swing right now.`,
            `${top.yourTeam.abbreviation} is still your best path to create movement.`,
            `${top.yourTeam.abbreviation} is where your board is separating most cleanly.`,
          ], top.series.id, top.yourTeam.abbreviation, "against-head"),
      body: top.pickedShare <= 25
        ? chooseVariant([
            `${placeLabel} Only ${Math.round(top.pickedShare)}% of the room is with you here, so this is one of the rare results that can really change your place if it lands. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
            `${placeLabel} This is not just mild leverage. ${top.yourTeam.abbreviation} sits far enough off the room to actually matter if it comes through. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
            `${placeLabel} Very little of the room is with you here, which makes this a real separation result rather than a cosmetic one. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
          ], top.series.id, top.yourTeam.abbreviation, top.pickedShare, "against-hard-body")
        : chooseVariant([
            `${placeLabel} Only ${Math.round(top.pickedShare)}% of the room is with you here, so ${top.yourTeam.abbreviation} gives you your best separation path. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
            `${placeLabel} This is still your clearest room-versus-you swing, even if it is not your wildest one. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
            `${placeLabel} Enough of the pool disagrees with you here that this result can still create movement in a real way. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
          ], top.series.id, top.yourTeam.abbreviation, top.pickedShare, "against-body"),
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: chooseVariant([
        "This is the type of leverage note the app should keep surfacing as live state and probabilities update.",
        "The useful distinction is not just what matters, but what actually creates movement for your board.",
        "When the room tilts this hard, the question is whether you still trust your case enough to keep carrying it.",
      ], top.series.id, "against-support"),
    };
  }

  return {
    eyebrow: chooseVariant(["What matters right now", "Hold spot", "Steady result"], top.series.id, "default-eyebrow"),
    headline: chooseVariant([
      `${matchup} is more about holding position than creating it.`,
      `${matchup} looks steadier than explosive for your board.`,
      `${matchup} is reading more like a hold than a leap.`,
    ], top.series.id, "default-head"),
    body: chooseVariant([
      `${placeLabel} You are mostly moving with the room on this one, so the interesting question is whether the market/model split creates a reason to watch more closely. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
      `${placeLabel} This is not your loudest swing, but it is still worth pressure-testing if the market and model start pulling in different directions. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
      `${placeLabel} The room is not giving you much separation here, so the useful read is whether the outside signals are strong enough to justify a closer second look. Market lean: ${formatLean(top.series, top.series.market)}. Model lean: ${formatLean(top.series, top.series.model)}.`,
    ], top.series.id, placeLabel, "default-body"),
    actionLabel: "See full reports",
    actionPath: "/reports",
    support: chooseVariant([
      "For now, the important read is simple: this result is more about protecting your place than making a big leap.",
      "Not every useful series is dramatic. Some are just there to keep the board intact while you choose where to press.",
      "A good board usually has a few calmer spots in the right places.",
    ], top.series.id, "default-support"),
  };
}
