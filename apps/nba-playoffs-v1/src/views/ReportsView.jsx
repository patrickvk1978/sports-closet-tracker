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

function winnerLabel(series, winnerTeamId, games) {
  if (!winnerTeamId) return "No pick";
  const team = winnerTeamId === series.homeTeam.id ? series.homeTeam : series.awayTeam;
  return `${team.abbreviation} in ${games}`;
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
    const title = boothLine(
      [series.id, pick.winnerTeamId, "prelock-rooting-title"],
      [
        `Watch ${pickedTeam.abbreviation} through the public signals`,
        `${pickedTeam.abbreviation} is a board-shape result right now`,
        `${pickedTeam.abbreviation} is more signal than scoreboard at the moment`,
      ]
    );
    const body = chooseVariant(
      [series.id, pick.winnerTeamId, "prelock-rooting-body"],
      [
        `${pickedTeam.city} is still a meaningful result for your card, but before lock the useful read is market, model, and bracket path rather than where the room has landed.`,
        `${pickedTeam.city} matters because it changes how your board is priced, not because there is any public room split to chase yet. This is a market-model-bracket question first.`,
        `${pickedTeam.abbreviation} is one of those pre-lock spots where the smart work is outside the pool: price, projection, and bracket path. The room can wait until the picks go public.`,
      ]
    );
    return {
      title,
      body,
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

function differenceLabel(currentUserPick, opponentPick, series) {
  if (!currentUserPick && !opponentPick) return "Neither side has picked yet";
  if (!currentUserPick) return "Only your opponent has picked";
  if (!opponentPick) return "Only you have picked";

  const sameWinner = currentUserPick.winnerTeamId === opponentPick.winnerTeamId;
  if (!sameWinner) return "Different winner";
  if (currentUserPick.games !== opponentPick.games) return `Same winner, different length`;
  return `Same pick`;
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
          `${pickedTeam.city} is one of the spots where public market and model inputs say your board can still gain or lose a lot of shape before the round becomes public.`,
          `${pickedTeam.city} is still attached to real pre-lock tension. The useful question is whether this is the right spot for your risk before the room becomes visible.`,
          `${pickedTeam.abbreviation} is not just a pick here. It is one of the places where outside signals can still reshape how aggressive your card really is.`,
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

function buildHeadToHeadSummary(selectedOpponent, currentStanding, opponentStanding, differingSeriesCount) {
  if (!selectedOpponent || !currentStanding || !opponentStanding) return null;
  const pointGap = currentStanding.summary.totalPoints - opponentStanding.summary.totalPoints;

  if (differingSeriesCount === 0) {
    return chooseVariant(
      [selectedOpponent.id, "headtohead-even"],
      [
        `You and ${selectedOpponent.name} are effectively traveling together right now. There are no active-round separation points yet.`,
        `Right now you and ${selectedOpponent.name} are riding the same rail. There is no active-round daylight between the two cards yet.`,
        `${selectedOpponent.name} is basically your bracket twin at the moment. Nothing in the active round is creating separation yet.`,
      ]
    );
  }

  if (pointGap > 0) {
    return chooseVariant(
      [selectedOpponent.id, pointGap, differingSeriesCount, "headtohead-lead"],
      [
        `You lead ${selectedOpponent.name} by ${pointGap} point${pointGap === 1 ? "" : "s"}, and ${differingSeriesCount} active series can still change that.`,
        `You have ${selectedOpponent.name} by ${pointGap} right now, but ${differingSeriesCount} active series are still live enough to shake that lead.`,
        `The edge is yours for now: ${pointGap} point${pointGap === 1 ? "" : "s"} over ${selectedOpponent.name}, with ${differingSeriesCount} live chances for the script to flip.`,
      ]
    );
  }

  if (pointGap < 0) {
    return chooseVariant(
      [selectedOpponent.id, pointGap, differingSeriesCount, "headtohead-trail"],
      [
        `${selectedOpponent.name} leads you by ${Math.abs(pointGap)} point${Math.abs(pointGap) === 1 ? "" : "s"}, with ${differingSeriesCount} active series still available to flip the matchup.`,
        `You are chasing ${selectedOpponent.name} by ${Math.abs(pointGap)}, and ${differingSeriesCount} active series still have enough air in them to turn the matchup.`,
        `${selectedOpponent.name} has the scoreboard edge for now, but ${differingSeriesCount} live series still leave room for this matchup to swing back.`,
      ]
    );
  }

  return chooseVariant(
    [selectedOpponent.id, differingSeriesCount, "headtohead-tied"],
    [
      `You and ${selectedOpponent.name} are level on points, but ${differingSeriesCount} active series still separate the two cards.`,
      `You and ${selectedOpponent.name} are dead even on points, with ${differingSeriesCount} live series still deciding who actually has the cleaner path.`,
      `The scoreboard says tie, but the cards are not identical. ${differingSeriesCount} active series are still holding the real tension in this matchup.`,
    ]
  );
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
          "Today is still about the bracket settling, not just your picks",
          "The board is still moving under your feet",
          "This is still a seeding-and-signals day more than a standings day",
        ]
      ),
      body: coachLine(
        [currentRound.key, "scenario-body"],
        [
          `The most useful read right now is which finale-day results and Play-In paths will reshape Round 1 before the Saturday, April 18, 2026 lock.`,
          `The best use of these reports right now is not reading them evenly. It is figuring out which late bracket developments actually force you to revisit your Round 1 card before Saturday, April 18, 2026.`,
          `This is the coaching lane of the app right now: which seed outcomes and Play-In paths really change the card, and which ones are just noise with good graphics.`,
        ]
      ),
      stats: [
        { label: "Open series", value: incompleteCount },
        { label: "Current place", value: placeLabel },
        { label: "Round win odds", value: formatPct(winOdds) },
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
        { label: "Current place", value: placeLabel },
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

function buildReportsHeroState(reportsSummary, { showScenarioCard, scenarioRows, currentRound, currentStanding }) {
  if (showScenarioCard) {
    return {
      headline: chooseVariant(
        [currentRound.key, "hero-scenario-headline"],
        [
          "This is the pre-lock decision desk for the board that is still settling.",
          "The reports are in coaching mode until the bracket stops moving.",
          "Pre-lock, this page should narrow your attention, not widen it.",
        ]
      ),
      body: scenarioRows[0]
        ? chooseVariant(
            [scenarioRows[0].title, currentRound.key, "hero-scenario-body"],
            [
              `${scenarioRows[0].title} is one of the clearest bracket-moving developments right now. The useful job here is not reading every report evenly. It is figuring out which seeding and Play-In outcomes actually change what you need to pick in ${currentRound.label}.`,
              `${scenarioRows[0].title} is the kind of development that deserves a second look because it can change the shape of ${currentRound.label}. This page is here to help you sort signal from noise before lock.`,
              `${scenarioRows[0].title} is one of the better examples of what matters right now: not everything that moves the bracket deserves a reaction, only the shifts that actually alter your card for ${currentRound.label}.`,
            ]
          )
        : chooseVariant(
            [currentRound.key, "hero-scenario-fallback"],
            [
              `The board is still moving before ${currentRound.label} locks, so the most useful reports right now are the ones that help you react to seeding and probability changes rather than final scored outcomes.`,
              `Before ${currentRound.label} locks, the real job is reacting to the bracket honestly. These reports are most useful when they help you revisit the few things that actually changed.`,
              `This page should behave like a sideline headset before lock: tell you what changed, what matters, and what can safely be ignored until the bracket is final.`,
            ]
          ),
      stats: [
        { label: "First report", value: "Scenario watch" },
        { label: "High-signal check", value: "Win odds" },
        { label: "Decision window", value: "Pre-lock" },
      ],
    };
  }

  return reportsSummary;
}

function ReportPreviewPanel({ heading, title, children, to, ctaLabel = "Open full report", control }) {
  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <span className="label">{heading}</span>
          <h2>{title}</h2>
        </div>
        {control ?? null}
      </div>
      <div className="nba-dashboard-list">
        {children}
        <div className="nba-report-actions">
          <Link className="secondary-button" to={to}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </article>
  );
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
  const canViewPoolSignals = areRoundPicksPublic(activeRoundSeries, currentRound.key, settings);
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
      .sort((a, b) => b.leverageScore - a.leverageScore)
      .slice(0, 4);
  }, [activeRoundSeries, allPicksByUser, canViewPoolSignals, memberList, picksBySeriesId]);

  const selectedOpponent = opponents.find((member) => member.id === selectedOpponentId) ?? null;
  const opponentPicks = selectedOpponent ? allPicksByUser[selectedOpponent.id] ?? {} : {};

  const headToHeadRows = useMemo(() => {
    if (!canViewPoolSignals) return [];
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
  }, [activeRoundSeries, allPicksByUser, canViewPoolSignals, memberList, opponentPicks, picksBySeriesId, selectedOpponent]);

  const exposureRows = useMemo(() => {
    if (!canViewPoolSignals) return [];
    return activeRoundSeries.map((seriesItem) => {
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
    }).sort((a, b) => Math.max(b.homePct, b.awayPct) - Math.max(a.homePct, a.awayPct));
  }, [activeRoundSeries, allPicksByUser, canViewPoolSignals, memberList]);

  const currentStandingIndex = standings.findIndex((member) => member.id === profile?.id);
  const leader = standings[0] ?? null;
  const currentStanding = currentStandingIndex >= 0 ? standings[currentStandingIndex] : null;
  const pointsBack = leader && currentStanding ? leader.summary.totalPoints - currentStanding.summary.totalPoints : 0;
  const opponentStanding = selectedOpponent ? standings.find((entry) => entry.id === selectedOpponent.id) ?? null : null;
  const headToHeadSummary = buildHeadToHeadSummary(selectedOpponent, currentStanding, opponentStanding, headToHeadRows.length);
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
  const heroState = buildReportsHeroState(reportsSummary, {
    showScenarioCard,
    scenarioRows,
    currentRound,
    currentStanding,
  });

  const swingRows = useMemo(() => {
    return activeRoundSeries
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
      .sort((a, b) => b.swingScore - a.swingScore)
      .slice(0, 3);
  }, [activeRoundSeries, allPicksByUser, canViewPoolSignals, currentStandingIndex, memberList, picksBySeriesId]);
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
            ? chooseVariant(
                [seriesItem.id, "prob-open-title"],
                [
                  `This series is still pure variance for your odds`,
                  `Your odds are still unusually exposed here`,
                  `This matchup is still one of the unresolved drivers of your odds`,
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
      .sort((a, b) => b.leverage - a.leverage)
      .slice(0, 3);
  }, [activeRoundSeries, allPicksByUser, canViewPoolSignals, memberList, picksBySeriesId]);

  const reportOptions = useMemo(() => {
    const options = [];

    if (showScenarioCard) {
      options.push({
        key: "scenarios",
        label: "Scenario watch",
        title: "What can still move before Round 1 locks?",
        to: "/reports/scenarios",
        children: (
          <>
            {scenarioRows.map((item) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.sourced}</p>
                  <p>{item.likelyImpact}</p>
                </div>
              </div>
            ))}
            <p className="subtle">Sourced through {SCENARIO_WATCH_DATE}. Matchup and market implications are local product inference.</p>
          </>
        ),
      });
    }

    options.push({
      key: "rooting",
      label: "Rooting guide",
      title: "What should you care about most?",
      to: "/reports/rooting",
      children: (
        <>
          {rootingRows.slice(0, 2).map((row) => (
            <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
              <div>
                <strong>{row.note.title}</strong>
                <p>{row.matchup} · {row.status}</p>
                <p>{row.note.body}</p>
              </div>
            </div>
          ))}
        </>
      ),
    });

    options.push({
      key: "win-odds",
      label: "Win odds",
      title: "What is driving your current-round probability?",
      to: "/reports/win-odds",
      children: (
        <>
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
        </>
      ),
    });

    options.push({
      key: "swing",
      label: "Swing spots",
      title: "Which series can move your standing?",
      to: "/reports/swing",
      children: (
        <>
          {swingRows.slice(0, 2).map((row) => (
            <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
              <div>
                <strong>{row.title}</strong>
                <p>{row.matchup}</p>
                <p>{row.body}</p>
              </div>
            </div>
          ))}
        </>
      ),
    });

    if (canViewPoolSignals) {
      options.push({
        key: "head-to-head",
        label: "Head to head",
        title: "How do you differ from one opponent?",
        to: selectedOpponent ? `/reports/opponent/${selectedOpponent.id}` : "/reports",
        ctaLabel: selectedOpponent ? "Open matchup report" : "Need another entry first",
        control: selectedOpponent ? (
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
        ) : null,
        children: !selectedOpponent ? (
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
          </>
        ),
      });

      options.push({
        key: "exposure",
        label: "Pool exposure",
        title: "Where is the room concentrated?",
        to: "/reports/exposure",
        children: (
          <>
            {exposureRows.slice(0, 2).map((row) => (
              <div className="nba-dashboard-row nba-dashboard-row-stacked" key={row.id}>
                <div>
                  <strong>{row.title}</strong>
                  <p>{row.matchup} · Consensus: {row.consensusTeam}</p>
                  <p>{row.body}</p>
                  <p>{row.homePct}% on the home side · {row.awayPct}% on the away side · Most common length: {row.leadingGames ? `${row.leadingGames} games` : "No lean yet"} · Open cards: {row.noPickCount}</p>
                </div>
              </div>
            ))}
          </>
        ),
      });
    }

    if (!showScenarioCard) {
      options.push({
        key: "outlook",
        label: "Position outlook",
        title: "What does your standing mean?",
        to: "/reports/outlook",
        children: (
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
        ),
      });
    }

    return options;
  }, [
    canViewPoolSignals,
    currentMember?.name,
    currentStanding,
    currentStandingIndex,
    exposureRows,
    headToHeadRows,
    headToHeadSummary,
    leader?.name,
    opponents,
    pointsBack,
    probabilityRows,
    rootingRows,
    scenarioRows,
    selectedOpponent,
    selectedOpponentId,
    series,
    settings,
    showScenarioCard,
    swingRows,
  ]);
  const [selectedReportKey, setSelectedReportKey] = useState(reportOptions[0]?.key ?? "");

  useEffect(() => {
    if (!reportOptions.length) {
      setSelectedReportKey("");
      return;
    }

    if (!reportOptions.some((option) => option.key === selectedReportKey)) {
      setSelectedReportKey(reportOptions[0].key);
    }
  }, [reportOptions, selectedReportKey]);

  const selectedReportIndex = reportOptions.findIndex((option) => option.key === selectedReportKey);
  const activeReport = selectedReportIndex >= 0 ? reportOptions[selectedReportIndex] : reportOptions[0] ?? null;

  return (
    <div className="nba-shell">
      {activeReport ? (
        <section className="nba-report-browser">
          <section className="panel nba-reports-hero nba-report-browser-hero">
            <div className="nba-report-browser-copy">
              <span className="label">Reports</span>
              <h2>{heroState.headline}</h2>
              <p className="subtle">{heroState.body}</p>
              <div className="nba-report-browser-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedReportKey(reportOptions[Math.max(selectedReportIndex - 1, 0)].key)}
                  disabled={selectedReportIndex <= 0}
                >
                  Previous
                </button>
                <label className="nba-report-browser-select-wrap">
                  <span className="micro-label">Choose report</span>
                  <select
                    className="nba-report-browser-select"
                    value={activeReport.key}
                    onChange={(event) => setSelectedReportKey(event.target.value)}
                  >
                    {reportOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setSelectedReportKey(reportOptions[Math.min(selectedReportIndex + 1, reportOptions.length - 1)].key)}
                  disabled={selectedReportIndex === reportOptions.length - 1}
                >
                  Next
                </button>
              </div>
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

          <section className="nba-dashboard-grid nba-reports-grid nba-reports-grid-single">
            <ReportPreviewPanel
              heading={activeReport.label}
              title={activeReport.title}
              to={activeReport.to}
              ctaLabel={activeReport.ctaLabel}
              control={activeReport.control}
            >
              {activeReport.children}
            </ReportPreviewPanel>
          </section>
        </section>
      ) : null}

    </div>
  );
}
