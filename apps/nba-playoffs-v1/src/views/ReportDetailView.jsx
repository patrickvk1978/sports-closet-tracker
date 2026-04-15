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

function hashSeed(value) {
  return Array.from(String(value ?? "")).reduce((total, char, index) => {
    return total + char.charCodeAt(0) * (index + 1);
  }, 0);
}

function chooseVariant(seedParts, variants) {
  const seed = seedParts.reduce((total, part) => total + hashSeed(part), 0);
  return variants[Math.abs(seed) % variants.length];
}

function coachLine(seedParts, variants) {
  return chooseVariant(["coach", ...seedParts], variants);
}

function boothLine(seedParts, variants) {
  return chooseVariant(["booth", ...seedParts], variants);
}

function colorLine(seedParts, variants) {
  return chooseVariant(["color", ...seedParts], variants);
}

function buildRootingNote(series, pick, marketSummary, canViewPoolSignals) {
  if (!pick) {
    return {
      title: chooseVariant(
        [series.id, "unpicked-rooting-title"],
        [
          `Make your ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} pick`,
          `${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation} is still open on your card`,
          `This matchup still needs your call`,
        ]
      ),
      body: coachLine(
        [series.id, "unpicked-rooting-body"],
        [
          "You have not picked this series yet, so this is the clearest place to lock in value before the room moves around you.",
          "Before this becomes a rooting story, it is still a board-building job. This matchup is one of the cleanest places to finish the card with intention.",
          "There is no leverage to harvest here until you actually choose a side. Get this one on the board and the rest of the rooting map gets easier to trust.",
        ]
      ),
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
        title: boothLine(
          [series.id, pick.winnerTeamId, "gap-title"],
          [
            `${pickedTeam.abbreviation} sits in the sharpest signal split here`,
            `${pickedTeam.abbreviation} is living in a real outside-signal disagreement`,
            `${pickedTeam.abbreviation} is one of the true split-screen teams on the board`,
          ]
        ),
        body: chooseVariant(
          [series.id, pick.winnerTeamId, "gap-body"],
          [
            `${pickedTeam.city} is not just a team to cheer for. It is part of one of the bigger public-signal disagreements on the board: market says ${marketLean}, model says ${modelLean}.`,
            `${pickedTeam.city} is tied to one of the cleaner market-model gaps on the board. That makes this a review spot, not just a rooting spot: market says ${marketLean}, model says ${modelLean}.`,
            `${pickedTeam.abbreviation} is not ordinary pre-lock noise. This is one of the places where the desk has two different stories in its ears: market says ${marketLean}, model says ${modelLean}.`,
          ]
        ),
      };
    }

    if (pickedTeamFavoredByModel && !pickedTeamFavoredByMarket) {
      return {
        title: boothLine(
          [series.id, pick.winnerTeamId, "model-title"],
          [
            `${pickedTeam.abbreviation} is a model-backed gamble`,
            `${pickedTeam.abbreviation} gets more love from the model than the market`,
            `${pickedTeam.abbreviation} is one of the nerdier green lights on the board`,
          ]
        ),
        body: chooseVariant(
          [series.id, pick.winnerTeamId, "model-body"],
          [
            `${pickedTeam.city} is not carrying hidden room leverage yet, but it is one of the spots where the model is giving you more permission than the public market price is.`,
            `${pickedTeam.city} is one of the clearer examples of the model being more comfortable than the market. That does not make it free, but it does make it worth respecting.`,
            `${pickedTeam.abbreviation} is getting a nod from the numbers even if the price board is less enthusiastic. That is the kind of disagreement worth noting before lock.`,
          ]
        ),
      };
    }

    if (pickedTeamFavoredByMarket && pickedTeamFavoredByModel) {
      return {
        title: boothLine(
          [series.id, pick.winnerTeamId, "steady-title"],
          [
            `${pickedTeam.abbreviation} is steady-card rooting`,
            `${pickedTeam.abbreviation} is one of your cleaner foundation pieces`,
            `${pickedTeam.abbreviation} looks more sturdy than flashy`,
          ]
        ),
        body: chooseVariant(
          [series.id, pick.winnerTeamId, "steady-body"],
          [
            `${pickedTeam.city} is one of the cleaner hold positions on your board. The useful question here is less “is this bold enough?” and more “does this let you be bold somewhere that matters more?”`,
            `${pickedTeam.city} is one of the steadier calls on your sheet. You do not need every slot to be a stunt double if this one is helping support the rest of the card.`,
            `${pickedTeam.abbreviation} is the type of slot the color analyst usually calls “boring in a healthy way.” If this one is solid, it buys you freedom elsewhere.`,
          ]
        ),
      };
    }

    return {
      title: boothLine(
        [series.id, pick.winnerTeamId, "prelock-rooting-title"],
        [
          `Watch ${pickedTeam.abbreviation} through the public signals`,
          `${pickedTeam.abbreviation} is a board-shape result right now`,
          `${pickedTeam.abbreviation} is more signal than scoreboard at the moment`,
        ]
      ),
      body: chooseVariant(
        [series.id, pick.winnerTeamId, "prelock-rooting-body"],
        [
          `${pickedTeam.city} is still meaningful for your card, but before lock the useful read is market, model, and bracket path rather than where the room has landed.`,
          `${pickedTeam.city} matters because it changes how your board is priced, not because there is any public room split to chase yet. This is a market-model-bracket question first.`,
          `${pickedTeam.abbreviation} is one of those pre-lock spots where the smart work is outside the pool: price, projection, and bracket path. The room can wait until the picks go public.`,
        ]
      ),
    };
  }
  const againstField = marketSummary.consensusWinnerTeamId && marketSummary.consensusWinnerTeamId !== pick.winnerTeamId;

  if (againstField) {
    return {
      title: boothLine(
        [series.id, pick.winnerTeamId, "against-field-title"],
        [
          `You need ${pickedTeam.abbreviation} more than the room does`,
          `${pickedTeam.abbreviation} is one of your real separator roots`,
          `${pickedTeam.abbreviation} is where your card can make noise`,
        ]
      ),
      body: chooseVariant(
        [series.id, pick.winnerTeamId, "against-field-body"],
        [
          `${pickedTeam.city} is your leverage side here. Most of the pool is leaning ${otherTeam.abbreviation}, so a ${pickedTeam.abbreviation} win would help you make up ground fast.`,
          `${pickedTeam.city} is one of the cleaner swing roots on your sheet. The room is heavier on ${otherTeam.abbreviation}, so this is not subtle upside if it breaks your way.`,
          `${pickedTeam.abbreviation} is the sort of result that gets the booth a little louder. The field is leaning ${otherTeam.abbreviation}, so this one can create daylight fast.`,
        ]
      ),
    };
  }

  if (marketSummary.consensusWinnerTeamId === pick.winnerTeamId) {
    return {
      title: boothLine(
        [series.id, pick.winnerTeamId, "consensus-title"],
        [
          `${pickedTeam.abbreviation} is defensive rooting for you`,
          `${pickedTeam.abbreviation} is more floor than ceiling here`,
          `${pickedTeam.abbreviation} is a hold-serve result`,
        ]
      ),
      body: chooseVariant(
        [series.id, pick.winnerTeamId, "consensus-body"],
        [
          `You are with the room on this series, so ${pickedTeam.abbreviation} winning is more about protecting position than creating separation.`,
          `${pickedTeam.abbreviation} is one of the spots where you mostly want to avoid losing ground. Useful result, not exactly parade-route material.`,
          `The pool is largely on your side here, so ${pickedTeam.abbreviation} is about staying steady more than landing a haymaker.`,
        ]
      ),
    };
  }

  return {
    title: boothLine(
      [series.id, pick.winnerTeamId, "neutral-title"],
      [
        `Watch ${pickedTeam.abbreviation} for your own path`,
        `${pickedTeam.abbreviation} is a quieter but real root`,
        `${pickedTeam.abbreviation} still matters plenty to your card`,
      ]
    ),
    body: chooseVariant(
      [series.id, pick.winnerTeamId, "neutral-body"],
      [
        `${pickedTeam.city} is still a meaningful result for your card even though the room has not settled strongly on either side yet.`,
        `${pickedTeam.city} is not a full-pool stampede result, but it is still one of the outcomes that shapes how your card feels if it lands.`,
        `${pickedTeam.abbreviation} is one of the less theatrical spots on the board, which is exactly why it can still matter without everyone shouting about it.`,
      ]
    ),
  };
}

function buildSwingSummary(series, yourPick, marketSummary, currentStandingIndex, poolSize, canViewPoolSignals) {
  if (!yourPick) {
    return {
      title: chooseVariant(
        [series.id, "unpicked-swing-title"],
        [
          `Unmade pick is the biggest swing here`,
          `Your biggest swing is still the undecided side`,
          `This series is still all volatility until you pick it`,
        ]
      ),
      body: coachLine(
        [series.id, "unpicked-swing-body"],
        [
          `You are still open on ${series.homeTeam.abbreviation}-${series.awayTeam.abbreviation}. Until you pick a side, this series is pure uncertainty for your position.`,
          `There is no need to overcomplicate this one yet: an unmade pick is still the loudest source of variance on your board.`,
          `Before the room can matter here, you need to matter here. Pick a side, then worry about whether it is a swing or a shield.`,
        ]
      ),
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
        title: boothLine(
          [series.id, yourPick.winnerTeamId, "pressure-title"],
          [
            `${pickedTeam.abbreviation} is a real pre-lock pressure point`,
            `${pickedTeam.abbreviation} is one of the board's louder decision spots`,
            `${pickedTeam.abbreviation} is carrying real signal tension`,
          ]
        ),
        body: chooseVariant(
          [series.id, yourPick.winnerTeamId, "pressure-body"],
          [
            `${pickedTeam.city} is attached to one of the larger market-model gaps on the board, so this is a better place to spend your attention than a series where every outside signal already agrees.`,
            `${pickedTeam.city} is sitting in a bigger market-model disagreement, which makes it more useful than the tidy series where every signal is already marching in step.`,
            `${pickedTeam.abbreviation} is one of the spots where the app should earn its keep. There is enough signal disagreement here to justify a real second look.`,
          ]
        ),
      };
    }

    if (confidence >= 66) {
      return {
        title: boothLine(
          [series.id, yourPick.winnerTeamId, "protection-title"],
          [
            `${pickedTeam.abbreviation} looks more like protection than upside`,
            `${pickedTeam.abbreviation} is behaving like a floor play`,
            `${pickedTeam.abbreviation} is one of the steadier price-board spots`,
          ]
        ),
        body: chooseVariant(
          [series.id, yourPick.winnerTeamId, "protection-body"],
          [
            `${pickedTeam.city} is tied to one of the steadier public prices in the round. That makes this series more useful as a foundation piece while you decide where the actual swing spots belong.`,
            `${pickedTeam.city} is attached to one of the calmer prices on the board, so this is more about structural support than upside hunting.`,
            `${pickedTeam.abbreviation} is one of the steadier footing spots. Not every series has to bring fireworks if this one is helping the rest of the card breathe.`,
          ]
        ),
      };
    }

    return {
      title: boothLine(
        [series.id, yourPick.winnerTeamId, "prelock-swing-title"],
        [
          `${pickedTeam.abbreviation} is still a live leverage call`,
          `${pickedTeam.abbreviation} is one of the live pressure points`,
          `${pickedTeam.abbreviation} is still worth a second board check`,
        ]
      ),
      body: chooseVariant(
        [series.id, yourPick.winnerTeamId, "prelock-swing-body"],
        [
          `${pickedTeam.city} is one of the spots where public market and model inputs still disagree enough to change how the round can feel if you get it right. Market says ${marketLean}; model says ${modelLean}.`,
          `${pickedTeam.city} is still one of the more useful spots to revisit because the outside signals are not done arguing. Market says ${marketLean}; model says ${modelLean}.`,
          `${pickedTeam.abbreviation} still carries enough signal tension to matter before lock. This is not just a pick; it is a stance between what the price says and what the model says.`,
        ]
      ),
    };
  }
  const roomPct = yourPick.winnerTeamId === series.homeTeam.id ? marketSummary.homePct : marketSummary.awayPct;
  const place = currentStandingIndex >= 0 ? currentStandingIndex + 1 : null;

  if (roomPct <= 35) {
    return {
      title: boothLine(
        [series.id, yourPick.winnerTeamId, "low-room-title"],
        [
          `${pickedTeam.abbreviation} is your upside swing`,
          `${pickedTeam.abbreviation} is one of your cleanest gain spots`,
          `${pickedTeam.abbreviation} is where the card can jump`,
        ]
      ),
      body: chooseVariant(
        [series.id, yourPick.winnerTeamId, "low-room-body"],
        [
          `${formatPct(roomPct)} of the room is with ${pickedTeam.abbreviation}, so this is one of your clearest ways to gain from ${place ? ordinal(place) : "your current position"}.`,
          `Only ${formatPct(roomPct)} of the pool is with ${pickedTeam.abbreviation}. That makes this one of the faster ways for your card to move if you are chasing from ${place ? ordinal(place) : "here"}.`,
          `${pickedTeam.abbreviation} is living on the lighter side of the room at ${formatPct(roomPct)}. If you want actual lift instead of polite progress, this is the sort of series that does it.`,
        ]
      ),
    };
  }

  if (roomPct >= 65) {
    return {
      title: boothLine(
        [series.id, yourPick.winnerTeamId, "high-room-title"],
        [
          `${pickedTeam.abbreviation} is mostly about holding serve`,
          `${pickedTeam.abbreviation} is a protection result`,
          `${pickedTeam.abbreviation} is where you keep the floor under you`,
        ]
      ),
      body: chooseVariant(
        [series.id, yourPick.winnerTeamId, "high-room-body"],
        [
          `${formatPct(roomPct)} of the pool is already on your side here. That makes this series more about not losing ground than about creating separation.`,
          `${formatPct(roomPct)} of the room already agrees with you, so this is one of the scoreboard spots where you mostly want no drama.`,
          `${pickedTeam.abbreviation} is carrying a lot of shared company at ${formatPct(roomPct)}. Useful result, but the color analyst is not exactly standing on the table for it.`,
        ]
      ),
    };
  }

  return {
    title: boothLine(
      [series.id, yourPick.winnerTeamId, "mid-room-title"],
      [
        `${pickedTeam.abbreviation} is a live middle-ground swing`,
        `${pickedTeam.abbreviation} is not pure chalk or pure contrarian`,
        `${pickedTeam.abbreviation} is sitting in the useful middle`,
      ]
    ),
    body: chooseVariant(
      [series.id, yourPick.winnerTeamId, "mid-room-body"],
      [
        `${formatPct(roomPct)} of the pool agrees with you, so this series can still move your standing without being a full contrarian bet. ${poolSize > 2 ? "A clean result here can matter more than it looks." : ""}`,
        `${formatPct(roomPct)} of the room is with you here. That puts this series in the useful middle tier: not a moonshot, not a shrug, still a place where the standings can bend.`,
        `${pickedTeam.abbreviation} sits in the middle band at ${formatPct(roomPct)}. That usually means less noise than a true fade, but still enough motion to matter if the rest of the board is tight.`,
      ]
    ),
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
      headline: chooseVariant(
        [currentRound.key, "scenario-headline"],
        [
          "The board is still settling before the real decisions lock.",
          "This is still a board-shape day more than a scorekeeping day.",
          "The bracket is not done talking yet.",
        ]
      ),
      body: coachLine(
        [currentRound.key, "scenario-body"],
        [
          `The highest-signal work right now is not scoreboard watching. It is figuring out which Play-In outcomes and price moves actually change what you need to do in ${currentRound.label}.`,
          `The most useful work here is narrowing the field of concern. Which Play-In outcomes and price shifts actually force a rethink in ${currentRound.label}, and which ones just feel important because they are loud?`,
          `This page is in coaching mode right now. The job is to figure out which late bracket developments deserve a reaction before ${currentRound.label}, not to treat every update like a five-alarm fire.`,
        ]
      ),
      stats: [
        { label: "Decision window", value: "Pre-lock" },
        { label: "Open series", value: incompleteCount },
        { label: "Watch first", value: "Scenario shifts" },
      ],
    };
  }

  if (incompleteCount > 0) {
    return {
      headline: chooseVariant(
        [currentRound.key, incompleteCount, "open-headline"],
        [
          `${incompleteCount} ${incompleteCount === 1 ? "series still needs your pick" : "series still need your picks"}`,
          `Your card still has ${incompleteCount} open ${incompleteCount === 1 ? "series" : "series"}`,
          `${incompleteCount} unresolved ${incompleteCount === 1 ? "spot is" : "spots are"} still driving the story`,
        ]
      ),
      body: coachLine(
        [currentRound.key, incompleteCount, "open-body"],
        [
          `Your report story is still mostly about getting fully set for ${currentRound.label}. Once the board is filled in, the leverage picture will sharpen fast.`,
          `Before these reports can become clean leverage reads, they still need to help you finish the card. Get set for ${currentRound.label}, then the true separation spots will come into focus.`,
          `The board is not asking for heroics yet. It is asking for completion. Finish the ${currentRound.label} card, then decide where the actual swing belongs.`,
        ]
      ),
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Decision window", value: currentRound.label },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (pointsBack <= 2) {
    return {
      headline: chooseVariant(
        [placeLabel, pointsBack, "close-headline"],
        [
          `You are within one series of the lead`,
          `The lead is still one good call away`,
          `You are close enough that one real swing can matter`,
        ]
      ),
      body: boothLine(
        [placeLabel, pointsBack, "close-body"],
        [
          `From ${placeLabel}, your reports are mostly about protecting good ground while finding one or two spots that can still create separation.`,
          `From ${placeLabel}, the trick is not getting louder. It is finding the one or two results that actually create daylight without blowing up a solid card.`,
          `You are close enough that the booth does not need five bold takes. It needs one or two honest leverage spots and a lot of good discipline.`,
        ]
      ),
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  if (contrarianCount > 0) {
    return {
      headline: chooseVariant(
        [contrarianCount, placeLabel, "contrarian-headline"],
        [
          `${contrarianCount} contrarian ${contrarianCount === 1 ? "call is" : "calls are"} carrying your upside`,
          `${contrarianCount} lighter-side ${contrarianCount === 1 ? "pick is" : "picks are"} doing the heavy lifting`,
          `Your upside is riding on ${contrarianCount} ${contrarianCount === 1 ? "different look" : "different looks"}`,
        ]
      ),
      body: boothLine(
        [contrarianCount, placeLabel, "contrarian-body"],
        [
          `You are chasing from ${placeLabel}, and your clearest path is through the series where you differ meaningfully from the room.`,
          `From ${placeLabel}, your card probably does not climb by being a slightly nicer version of the consensus. The real path is through the places where you are willing to be different.`,
          `The color seat would call these your live wires. From ${placeLabel}, the series where you are off the room matter more than the ones where everyone is nodding together.`,
        ]
      ),
      stats: [
        { label: "Points back", value: pointsBack },
        { label: "Contrarian picks", value: contrarianCount },
        { label: "Round win odds", value: formatPct(winOdds) },
      ],
    };
  }

  return {
    headline: chooseVariant(
      [placeLabel, "aligned-headline"],
      [
        `Your board is mostly aligned with the room`,
        `This is more of a discipline card than a rebellion card`,
        `You are living closer to consensus than to chaos`,
      ]
    ),
    body: chooseVariant(
      [placeLabel, "aligned-body"],
      [
        `From ${placeLabel}, this report set is less about one huge swing and more about where market, model, and pool consensus start to diverge.`,
        `From ${placeLabel}, the useful work is quieter: find the subtle splits between market, model, and room rather than hunting for a headline upset just to feel alive.`,
        `This is the kind of card where the gains are usually smaller and smarter. Look for the places where outside signals and pool consensus are not saying quite the same thing.`,
      ]
    ),
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
        ? coachLine(
            [currentRound.key, "detail-scenarios-prelock"],
            [
              `This page is here to narrow your attention, not widen it. The useful question is which remaining bracket developments actually change the first-round board before ${currentRound.label} locks.`,
              `The coaching version of this page is simple: which remaining bracket developments actually force a decision before ${currentRound.label}, and which ones are just good TV?`,
              `This page should help you ignore most of the noise. What matters now is which remaining seed shifts really change the first-round board before ${currentRound.label} locks.`,
            ]
          )
        : boothLine(
            [currentRound.key, "detail-scenarios-post"],
            [
              `The major seeding chaos has mostly settled. What still matters now is how the Play-In and late price movement alter the edges of the board.`,
              `Most of the bracket drama is no longer the story. The useful part now is how the final Play-In and late movement reshape the margins of the board.`,
              `The bracket has stopped screaming. What is left is the subtler stuff: the Play-In path and the price movement that still change the edges of the card.`,
            ]
          ),
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
        ? coachLine(
            [currentRound.key, incompleteCount, "detail-rooting-open"],
            [
              `Before this becomes a pure rooting map, it is still partly a pick-completion tool. The first thing to care about is which unresolved series you still need to settle.`,
              `This page is not pure scoreboard therapy yet. First it has to help you finish the unresolved series that are still shaping the card.`,
              `The rooting map is only half-born while the board is still open. Settle the unresolved series first, then the real emotional geography will show itself.`,
            ]
          )
        : boothLine(
            [currentRound.key, "detail-rooting-closed"],
            [
              `This page is about separating the results that simply protect your position from the ones that can actually create movement for your card.`,
              `Not every result deserves the same volume. This page is here to separate “nice” wins from the ones that actually move your card.`,
              `This is the booth lane of the report set: which outcomes are just maintenance, and which ones really change the game for your card.`,
            ]
          ),
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
      body: boothLine(
        [currentRound.key, "detail-exposure"],
        [
          `This is the room-context page. It is most useful for spotting where consensus is already strong and where the pool is still leaving room for different paths to matter.`,
          `This page is less about who is “right” and more about where the room is already packed together versus where it is still giving multiple outcomes room to breathe.`,
          `Think of this one as the crowd-noise page: where everyone is piling up, where the room is still split, and where your card may be sharing more company than you thought.`,
        ]
      ),
      stats: [
        { label: "Most concentrated", value: topExposure?.matchup ?? "Still forming" },
        { label: "Top room share", value: formatPct(topShare) },
        { label: "Open series", value: incompleteCount },
      ],
    };
  }

  if (reportKey === "swing") {
    return {
      body: boothLine(
        [currentRound.key, "detail-swing"],
        [
          `This page is about movement, not just correctness. It is trying to isolate the few series that can actually change your place rather than merely confirm what the room already expects.`,
          `The useful swings are not just the scary ones. They are the series that can actually bend your place instead of simply validating what the room already thinks.`,
          `This is where the play-by-play voice should get a little louder. Not because every series is huge, but because a few of them really can move the standings.`,
        ]
      ),
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
        ? coachLine(
            [currentRound.key, incompleteCount, "detail-odds-open"],
            [
              `This page is still partly hypothetical because your round is not fully locked in. The useful read is where market, model, and your unfinished card are creating the biggest probability swings.`,
              `This page is still wearing a little scaffolding because the round is not fully locked. Use it to spot the probability drivers, not to pretend everything is already settled.`,
              `The odds here are still conditional while your card is open. The job is to identify which unfinished choices are creating the biggest probability swings.`,
            ]
          )
        : boothLine(
            [currentRound.key, "detail-odds-closed"],
            [
              `This page turns the unresolved series into a first-pass probability map so you can see which results are driving your current-round path most. `,
              `This page is the cleaner odds map: which series are actually driving your round, and which ones look important only because they have a logo and a number.`,
              `This is the probability board with the volume turned up just enough. It is here to show which results really steer your round, not to decorate every series equally.`,
            ]
          ),
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
        ? coachLine(
            [currentRound.key, incompleteCount, "detail-outlook-open"],
            [
              `This page is still mostly about readiness. Before lock, your “position” is less about rank than about whether your card is complete and where your biggest leverage calls still sit.`,
              `Before lock, “outlook” is really about process more than scoreboard. Are you set, where are the live leverage calls, and what still deserves another look?`,
              `The honest pre-lock version of outlook is not about place. It is about whether your card is ready and where the biggest tension still lives.`,
            ]
          )
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
      const topShare = Math.max(marketSummary.homePct, marketSummary.awayPct);
      const noPickCount = marketSummary.noPickCount ?? 0;
      const title =
        topShare >= 75
          ? boothLine(
              [seriesItem.id, consensusTeam, topShare, "exposure-heavy-title"],
              [
                `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is one of the room's chalkier spots`,
                `${consensusTeam} is pulling the room into a heavy lane here`,
                `This is one of the places the room is crowding together`,
              ]
            )
          : topShare >= 60
            ? boothLine(
                [seriesItem.id, consensusTeam, topShare, "exposure-medium-title"],
                [
                  `${consensusTeam} has a real room lean here`,
                  `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is not a split vote anymore`,
                  `The room has started to stack toward ${consensusTeam} here`,
                ]
              )
            : boothLine(
                [seriesItem.id, "exposure-split-title"],
                [
                  `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is still relatively open`,
                  `This series is one of the lighter-consensus spots`,
                  `The room has not packed itself into one side here`,
                ]
              );
      const body =
        topShare >= 75
          ? `${boothLine(
              [
                `${topShare}% of the room is on ${consensusTeam}, so this is more of a crowd result than a leverage result right now.`,
                `At ${topShare}% on ${consensusTeam}, this is one of the cleaner “do not lose touch with the pack” series.`,
                `${consensusTeam} is carrying ${topShare}% of the room here. If you are with it, this is mostly about holding serve; if you are off it, this is one of the louder fades on the board.`,
              ],
              seriesItem.id,
              consensusTeam,
              topShare,
              "exposure-heavy-body"
            )} ${colorLine(
              [
                `This is where the room starts to look like a parade route.`,
                `You can hear the collective footsteps here.`,
                `This one comes with a little crowd noise built in.`,
              ],
              seriesItem.id,
              consensusTeam,
              topShare,
              "exposure-heavy-color"
            )}`
          : topShare >= 60
            ? `${boothLine(
                [
                  `${topShare}% of the room is leaning ${consensusTeam}, which is enough to matter without turning the series into pure chalk.`,
                  `${consensusTeam} has the room edge at ${topShare}%, so this one still has shape even if it is not a full stampede.`,
                  `The room is clearly leaning ${consensusTeam} at ${topShare}%, but there is still enough space here for a different outcome to sting.`,
                ],
                seriesItem.id,
                consensusTeam,
                topShare,
                "exposure-medium-body"
              )} ${colorLine(
                [
                  `Not a mob. Definitely a crowd.`,
                  `This is where the room is nodding in the same direction, not chanting yet.`,
                  `Plenty of company here, just not full choir practice.`,
                ],
                seriesItem.id,
                consensusTeam,
                topShare,
                "exposure-medium-color"
              )}`
            : `${boothLine(
                [
                  `Neither side has built a dominant room share yet, so this is still one of the better places for the standings to branch later.`,
                  `The room is still relatively loose here, which makes this a better branching series than the ones already carrying consensus freight.`,
                  `This is one of the cleaner “multiple paths are still alive” matchups on the page.`,
                ],
                seriesItem.id,
                topShare,
                "exposure-split-body"
              )} ${colorLine(
                [
                  `Still some open air in this one.`,
                  `No traffic jam yet.`,
                  `The room has not poured the concrete here.`,
                ],
                seriesItem.id,
                topShare,
                "exposure-split-color"
              )}`;

      return {
        id: seriesItem.id,
        matchup: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
        title,
        body,
        consensusTeam,
        homePct: marketSummary.homePct,
        awayPct: marketSummary.awayPct,
        leadingGames: marketSummary.leadingGames,
        noPickCount,
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
          ? chooseVariant(
              [seriesItem.id, "prob-open-title"],
              [
                "This series is still pure variance for your odds",
                "Your odds are still unusually exposed here",
                "This matchup is still one of the unresolved drivers of your odds",
              ]
            )
          : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
            ? boothLine(
                [seriesItem.id, yourTeam.abbreviation, "prob-contrarian-title"],
                [
                  `${yourTeam.abbreviation} is your clearest odds swing`,
                  `${yourTeam.abbreviation} is one of the sharper probability movers`,
                  `${yourTeam.abbreviation} is where your odds can actually jump`,
                ]
              )
            : boothLine(
                [seriesItem.id, yourTeam?.abbreviation ?? "series", "prob-defensive-title"],
                [
                  `${yourTeam?.abbreviation ?? "This series"} is mostly defensive for your odds`,
                  `${yourTeam?.abbreviation ?? "This series"} is more floor than ceiling for your odds`,
                  `${yourTeam?.abbreviation ?? "This series"} is mostly a protect-the-position result`,
                ]
              ),
        body: !yourPick
          ? coachLine(
              [seriesItem.id, "prob-open-body"],
              [
                "You have not picked this series yet, so your current-round win odds are unusually exposed here.",
                "Until you choose a side, this matchup is carrying more uncertainty for your current-round odds than it should.",
                "This is one of the cleaner examples of unfinished work showing up directly in your probability picture.",
              ]
            )
          : !canViewPoolSignals
            ? chooseVariant(
                [seriesItem.id, "prob-prelock-body"],
                [
                  "Before lock, this is best read as a public-signals swing: market and model say this series can still change your path more than it first appears.",
                  "Pre-lock, this is still an outside-signals story. Market and model both say this series matters more to your path than a casual glance would suggest.",
                  "This is one of the better pre-lock spots to respect the signal board: market and model still think this matchup can move your round meaningfully.",
                ]
              )
            : roomTeam && yourTeam && roomTeam.id !== yourTeam.id
              ? chooseVariant(
                  [seriesItem.id, yourTeam.abbreviation, pickedPct, "prob-contrarian-body"],
                  [
                    `Only ${formatPct(pickedPct)} of the room is with you here. If ${yourTeam.abbreviation} hits, your current-round win odds should jump more than on a consensus result.`,
                    `${formatPct(pickedPct)} of the room is riding with ${yourTeam.abbreviation}. That is light enough that a hit here should move your odds more than a standard room-aligned win.`,
                    `${yourTeam.abbreviation} is not carrying much company at ${formatPct(pickedPct)}. If this one lands, it is the sort of result that can make your odds graph wake up.`,
                  ]
                )
              : chooseVariant(
                  [seriesItem.id, yourTeam?.abbreviation ?? "series", pickedPct, "prob-defensive-body"],
                  [
                    `About ${formatPct(pickedPct)} of the pool is already with you. This result matters more for protecting position than creating separation.`,
                    `${formatPct(pickedPct)} of the room is already on your side here, so this is more about not slipping than about jumping the field.`,
                    `This is one of the results where your odds mostly want calm. With ${formatPct(pickedPct)} of the pool alongside you, it is a hold-serve outcome more than a leap outcome.`,
                  ]
                ),
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
                  <strong>{row.title}</strong>
                  <p>{row.matchup} · Consensus: {row.consensusTeam}</p>
                  <p>{row.body}</p>
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
