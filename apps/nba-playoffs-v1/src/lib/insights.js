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
      eyebrow: chooseVariant(["Play-by-play", "Booth read", "Live board"], top.series.id, "live-eyebrow"),
      headline: chooseVariant([
        `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation} is moving your board live.`,
        `${top.series.homeTeam.abbreviation}-${top.series.awayTeam.abbreviation} just became the loudest thing on your card.`,
        `This is the live series actually tugging on your board right now.`,
      ], top.series.id, currentStanding?.place, "live-headline"),
      body: chooseVariant([
        `${Number.isFinite(currentStanding?.place) ? `You are ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now. ` : ""}This is the clearest live swing on your card. Watch how the market and model shift as the game state changes, because that should shape how you think about the remaining open series before lock.`,
        `${Number.isFinite(currentStanding?.place) ? `You are sitting ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"} right now. ` : ""}This is not just background noise anymore. It is the series currently putting the most tension on your board.`,
        `${Number.isFinite(currentStanding?.place) ? `From ${currentStanding.place}${currentStanding.place === 1 ? "st" : currentStanding.place === 2 ? "nd" : currentStanding.place === 3 ? "rd" : "th"}, ` : ""}this is the matchup worth the most attention because it is the one most capable of changing how the rest of the card feels in real time.`,
      ], top.series.id, currentStanding?.place, "live-body"),
      actionLabel: "Open reports",
      actionPath: "/reports",
      support: chooseVariant([
        "This is where the product should sound like a booth, not a spreadsheet.",
        "The useful live read is not the obvious score update. It is what that score is doing to your path.",
        "Live windows should feel like information with pulse, not just motion for motion's sake.",
      ], top.series.id, "live-support"),
    };
  }

  if (shouldLeadWithScenario) {
    if (seasonPhase === "play_in_week") {
      const mostUnsettled = ranked.find((entry) => !entry.pick) ?? ranked[0];
      return {
        eyebrow: chooseVariant(["Coach's note", "Board check", "Pre-lock note"], mostUnsettled?.series?.id ?? "prelock", "scenario-eyebrow"),
        headline: mostUnsettled?.pick
          ? chooseVariant([
              `${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} is the matchup worth revisiting first.`,
              `${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} is still the best second-look series on your card.`,
              `If you reopen one series first, make it ${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation}.`,
            ], mostUnsettled.series.id, "scenario-picked-head")
          : chooseVariant([
              "The Play-In is less about drama now and more about mispricing your board.",
              "The useful Play-In question now is not who survives. It is what actually deserves a board move.",
              "The bracket noise is only useful if it changes a real decision on your card.",
            ], "scenario-unpicked-head"),
        body: mostUnsettled?.pick
          ? chooseVariant([
              `Your card is mostly filled in, but ${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} still carries one of the widest market-model gaps on the board. That is a better use of your attention than rereading settled favorites.`,
              `${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} still has enough signal disagreement to justify a real second look. That is more useful than pretending every favorite needs equal attention.`,
              `Most of your card can stay where it is. ${mostUnsettled.series.homeTeam.abbreviation}-${mostUnsettled.series.awayTeam.abbreviation} is one of the few places where the inputs still justify real work.`,
            ], mostUnsettled.series.id, "scenario-picked-body")
          : chooseVariant([
              "The useful job this week is not just watching the bracket settle. It is finding the one or two series where a Play-In path or pricing shift should actually move your pick.",
              "Do not confuse movement with relevance. Only a couple of these bracket shifts should really change what you do next.",
              "The trick here is filtering the noise. Most of the board is stable enough now; a few edges still are not.",
            ], "scenario-unpicked-body"),
        actionLabel: mostUnsettled?.pick ? "Open reports" : "Review bracket",
        actionPath: mostUnsettled?.pick ? "/reports" : "/bracket",
        support: chooseVariant([
          "Round 1 selections lock on Saturday, April 18, 2026. Use that window on the handful of series that can still move, not on the whole board.",
          "Before lock, good coaching is mostly subtraction: identify the few real problems and leave the rest alone.",
          "This is the phase where discipline beats volume. Tighten the live questions and stop there.",
        ], currentRound?.key, "scenario-support"),
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

  if (openPickCount === 0 && totalSeriesCount > 0) {
    return {
      eyebrow: chooseVariant(["Coach's note", "Start here", "First move"], currentRound?.key, "open-eyebrow"),
      headline: chooseVariant([
        `You have not started ${currentRound.label} yet.`,
        `${currentRound.label} is still blank, so the card cannot help you much yet.`,
        `The board needs your first few picks before the advice can get sharp.`,
      ], currentRound?.key, "open-head"),
      body: chooseVariant([
        "The best first move is not opening every report. It is getting your first few series onto the board so the app can stop talking in generalities and start helping with your actual decisions.",
        "Start with the card, not the rabbit hole. A few real picks will unlock much more useful guidance than another lap through broad commentary.",
        "Right now the product still has to speak in generalities. Give it real picks, and it can start acting like a coach instead of a narrator.",
      ], currentRound?.key, "open-body"),
      actionLabel: "Start picking",
      actionPath: "/series",
      support: chooseVariant([
        "Once you have a few live picks in place, this card can get much more specific about where you are exposed, where the market disagrees, and what deserves another look.",
        "A partial card is already much better than an empty one. That is when the commentary starts earning its keep.",
        "The app gets smarter the moment it has a real board to react to.",
      ], currentRound?.key, "open-support"),
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
      eyebrow: chooseVariant(["Coach's note", "Board tension", "Against the tape"], top.series.id, "fade-eyebrow"),
      headline: chooseVariant([
        `${top.yourTeam.abbreviation} is the boldest line on your card right now.`,
        `${top.yourTeam.abbreviation} is where your card is really making a statement.`,
        `${top.yourTeam.abbreviation} is the place where your board is most willing to disagree.`,
      ], top.series.id, top.yourTeam.abbreviation, "fade-head"),
      body: chooseVariant([
        `${placeLabel} You are fading the market favorite in ${matchup}, which makes this less about what the room is doing and more about whether the model and path are giving you enough reason to stay there.`,
        `${placeLabel} This is not a popularity contest yet. It is a question of whether your case against the market favorite is sturdy enough to keep carrying.`,
        `${placeLabel} This is the spot where your card stops being conventional. The right question is whether the path and model support are strong enough to justify the nerve.`,
      ], top.series.id, top.yourTeam.abbreviation, "fade-body"),
      actionLabel: "Check market vs model",
      actionPath: "/reports/probabilities",
      support: chooseVariant([
        "Pre-lock, the best tension to study is not room exposure. It is where your card is leaning away from the public price for a real reason.",
        "This is good coach territory: if you can explain the fade clearly, keep it. If not, it is a candidate for cleanup.",
        "Some fades are sharp. Some are just mood. Make sure this one is the first kind.",
      ], top.series.id, "fade-support"),
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
