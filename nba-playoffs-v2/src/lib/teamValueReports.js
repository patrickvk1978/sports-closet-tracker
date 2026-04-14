import {
  buildTeamExposureRows,
  buildTeamSelectionRows,
  buildTeamValueStandingsWithOdds,
  getRoundOneTeamsFromData,
} from "./teamValuePreview";

export const TEAM_VALUE_LOCK_AT = "2026-04-18T12:00:00-04:00";

export function getTeamValuePhase(now = new Date()) {
  const lockAt = new Date(TEAM_VALUE_LOCK_AT);
  return now < lockAt ? "pre_lock" : "post_lock";
}

function ordinal(value) {
  if (!Number.isFinite(value)) return "TBD";
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function buildSummary(currentStanding, slotFitRows, fragilityRows) {
  if (!currentStanding) {
    return {
      headline: "Finish the full 16-to-1 board to unlock the stronger read.",
      body: "Once every slot is assigned, this page can explain where your value is concentrated, where you differ from the room, and which results matter most.",
      stats: [
        { label: "Current points", value: 0 },
        { label: "Live value", value: 0 },
        { label: "Win probability", value: "0%" },
      ],
    };
  }

  const topFit = slotFitRows[0];
  const topFragility = fragilityRows[0];
  return {
    headline: `${topFit?.teamLabel ?? "Your board"} is shaping the whole story right now.`,
    body: `From ${ordinal(currentStanding.place)}, your board still has ${currentStanding.liveValueRemaining} live value. The biggest question is whether your highest slots are in the right teams and whether ${topFragility?.teamLabel ?? "your top exposures"} are sturdier than they look.`,
    stats: [
      { label: "Current points", value: currentStanding.summary.totalPoints },
      { label: "Live value", value: currentStanding.liveValueRemaining },
      { label: "Win probability", value: `${currentStanding.winProbability}%` },
    ],
  };
}

function getCurrentAssignments(profileId, allAssignmentsByUser) {
  return allAssignmentsByUser?.[profileId] ?? {};
}

function buildSlotFitRows(selectionRows, currentAssignments) {
  return selectionRows
    .map((team) => {
      const yourValue = Number(currentAssignments?.[team.id] ?? 0);
      const gap = fairGap(yourValue, team.fairValue);
      const slotDelta = Number((yourValue - team.fairValue).toFixed(1));
      const marketLean = team.marketLean ?? 50;
      const titleOddsPct = team.titleOddsPct ?? 0;
      const expectedPoints = team.expectedPoints;
      const poolEv = team.poolEv;
      let fitType = "clean";
      let headline = `${team.abbreviation} already sits in a clean slot`;
      let body = `You already have ${team.abbreviation} in the range the board expects, with ${expectedPoints} expected points and ${poolEv} pool EV.`;

      if (slotDelta >= 2) {
        fitType = "over";
        headline = `${team.abbreviation} is one of your richer slots`;
        body = `You are spending ${yourValue} on ${team.abbreviation}, while the board reads them closer to ${team.fairValue}. With ${marketLean}% Round 1 confidence and ${titleOddsPct}% title equity, the team still has paths, but this slot is asking them to return more than the market fully supports.`;
      } else if (slotDelta > 0) {
        fitType = "over";
        headline = `${team.abbreviation} may be a touch expensive`;
        body = `${team.abbreviation} is only slightly above the board's fair slot, but the question is whether ${expectedPoints} expected points and ${poolEv} pool EV are enough to justify paying ${yourValue} instead of a nearby cheaper team.`;
      } else if (slotDelta <= -2) {
        fitType = "under";
        headline = `${team.abbreviation} looks under-slotted for the upside`;
        body = `${team.abbreviation} is sitting at ${yourValue}, even though the board would push them nearer ${team.fairValue}. Between ${expectedPoints} expected points and ${titleOddsPct}% title equity, this is one of the cleaner chances to buy ceiling without spending a true top-tier number.`;
      } else if (slotDelta < 0) {
        fitType = "under";
        headline = `${team.abbreviation} still has a little room to climb`;
        body = `${team.abbreviation} is not dramatically cheap, but they are still coming in lighter than the board expects. That makes this more of a quiet value play than a major stance.`;
      }

      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline,
        body,
        yourValue,
        fairValue: team.fairValue,
        gap,
        slotDelta,
        fitType,
        marketLean,
        titleOddsPct,
        expectedPoints,
        poolEv,
      };
    })
    .sort((a, b) => b.gap - a.gap || b.fairValue - a.fairValue);
}

function buildOverweightRows(exposures, selectionRows) {
  const selectionById = Object.fromEntries(selectionRows.map((row) => [row.id, row]));
  return exposures
    .map((row) => {
      const companion = selectionById[row.id];
      return {
        id: row.id,
        teamLabel: `${row.city} ${row.name}`,
        headline:
          row.leverage >= 0
            ? `You are above the room on ${row.abbreviation}`
            : `You are lighter than the room on ${row.abbreviation}`,
        body:
          row.leverage >= 0
            ? `You assigned ${row.yourValue} while the room average is ${row.avgValue}. That gives you more lift if ${row.abbreviation} runs, but also more exposure if they bust.`
            : `You assigned ${row.yourValue} while the room average is ${row.avgValue}. That means a ${row.abbreviation} run helps the room more than it helps you.`,
        leverage: row.leverage,
        yourValue: row.yourValue,
        avgValue: row.avgValue,
        poolEv: companion?.poolEv ?? 0,
      };
    })
    .sort((a, b) => Math.abs(b.leverage) - Math.abs(a.leverage) || b.poolEv - a.poolEv);
}

function buildBiggestAssetsRows(selectionRows, currentAssignments) {
  return selectionRows
    .map((team) => {
      const yourValue = Number(currentAssignments?.[team.id] ?? 0);
      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline: `${team.abbreviation} is one of your biggest live assets`,
        body: `${team.abbreviation} is carrying ${yourValue} of your board, with ${team.expectedPoints} expected points and ${team.poolEv} pool EV from here.`,
        yourValue,
        expectedPoints: team.expectedPoints,
        poolEv: team.poolEv,
      };
    })
    .filter((row) => row.yourValue > 0)
    .sort((a, b) => b.yourValue - a.yourValue || b.poolEv - a.poolEv);
}

function buildRootingRows(selectionRows, seriesByRound, currentAssignments) {
  const selectionById = Object.fromEntries(selectionRows.map((row) => [row.id, row]));
  const roundOneSeries = seriesByRound.round_1 ?? [];

  return roundOneSeries.map((seriesItem) => {
    const homeTeam = selectionById[seriesItem.homeTeam.id];
    const awayTeam = selectionById[seriesItem.awayTeam.id];
    const homeValue = Number(currentAssignments?.[seriesItem.homeTeam.id] ?? 0);
    const awayValue = Number(currentAssignments?.[seriesItem.awayTeam.id] ?? 0);
    const preferred = homeValue >= awayValue ? homeTeam : awayTeam;
    const other = homeValue >= awayValue ? awayTeam : homeTeam;
    const gap = Math.abs(homeValue - awayValue);
    const yourValue = preferred ? Number(currentAssignments?.[preferred.id] ?? 0) : 0;

    return {
      id: seriesItem.id,
      teamLabel: `${seriesItem.homeTeam.abbreviation} vs ${seriesItem.awayTeam.abbreviation}`,
      headline:
        gap === 0
          ? `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is balanced on your board`
          : `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is your stronger side here`,
      body:
        gap === 0
          ? `You priced both sides similarly, so this series is more about broad bracket texture than one concentrated asset.`
          : `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is carrying ${yourValue} points for you here, while ${other?.abbreviation ?? seriesItem.awayTeam.abbreviation} is sitting at ${homeValue >= awayValue ? awayValue : homeValue}. The market leans ${seriesItem.market.homeWinPct >= 50 ? seriesItem.homeTeam.abbreviation : seriesItem.awayTeam.abbreviation}, but your board is more exposed to ${preferred?.abbreviation ?? "one side"}.`,
      gap,
      preferredTeam: preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation,
      yourValue,
    };
  }).sort((a, b) => b.gap - a.gap);
}

function buildModelGapRows(selectionRows, currentAssignments) {
  return selectionRows
    .map((team) => {
      const yourValue = Number(currentAssignments?.[team.id] ?? 0);
      const gap = Math.abs((team.marketLean ?? 50) - (team.modelLean ?? 50));
      const marketLean = team.marketLean ?? 50;
      const modelLean = team.modelLean ?? 50;
      const expectedPoints = team.expectedPoints;
      const poolEv = team.poolEv;
      const modelHigher = modelLean > marketLean;
      const toneSeed = (team.abbreviation?.charCodeAt?.(0) ?? 0) % 3;

      let headline = `${team.abbreviation} is one of the bigger market-model split teams`;
      let body = `The market has ${team.abbreviation} at ${marketLean}%, while the model is at ${modelLean}%. That ${gap}-point gap matters more because you currently have them at ${yourValue || "an unassigned slot"}.`;

      if (modelHigher && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the clearer model-over-market spots`;
        body = `The model is buying ${team.abbreviation} more aggressively than the market is. At ${modelLean}% versus ${marketLean}%, this is the kind of team that asks whether the public price is being a little too cautious.`;
      } else if (modelHigher && toneSeed === 1) {
        headline = `${team.abbreviation} is getting a quieter vote of confidence from the model`;
        body = `${team.abbreviation} is not being priced quite as warmly by the market, but the model still sees more runway here. If you already have real value tied up in them, that disagreement is worth respecting.`;
      } else if (modelHigher) {
        headline = `${team.abbreviation} may have more under the hood than the market is giving it credit for`;
        body = `The market is sitting at ${marketLean}%, but the model pushes ${team.abbreviation} to ${modelLean}%. That does not automatically make them right, but it does make this one of the better cases for taking a closer second look.`;
      } else if (!modelHigher && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the spots where the market is more convinced`;
        body = `The public price is stronger than the model here, which can mean one of two things: either the market is seeing a cleaner path, or the team is being priced close to its ceiling already.`;
      } else if (!modelHigher && toneSeed === 1) {
        headline = `${team.abbreviation} is drawing more market trust than model trust`;
        body = `${marketLean}% market versus ${modelLean}% model is not a small split. If you have a heavy slot on ${team.abbreviation}, this is exactly the sort of disagreement that should make you ask what assumption you are really paying for.`;
      } else {
        headline = `${team.abbreviation} looks a little more public-facing than model-backed`;
        body = `The market is leaning harder into ${team.abbreviation} than the model is. Sometimes that is justified; sometimes it is just a reminder that the consensus case has already been priced in.`;
      }

      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline,
        body,
        gap,
        yourValue,
        marketLean,
        modelLean,
        expectedPoints,
        poolEv,
      };
    })
    .sort((a, b) => b.gap - a.gap || b.yourValue - a.yourValue);
}

function buildFragilityRows(selectionRows, currentAssignments) {
  return selectionRows
    .map((team) => {
      const yourValue = Number(currentAssignments?.[team.id] ?? 0);
      const fragility = Number((yourValue * ((100 - (team.marketLean ?? 50)) / 100) + yourValue * ((100 - (team.titleOddsPct ?? 0)) / 100) * 0.35).toFixed(1));
      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline: `${team.abbreviation} is one of your shakier high slots`,
        body: `${team.abbreviation} is carrying ${yourValue} points on your board, but only ${team.marketLean}% Round 1 market confidence and ${team.titleOddsPct}% title equity. That is useful upside if you are right, but it can also make the board feel thinner than it looks.`,
        fragility,
        yourValue,
        marketLean: team.marketLean,
        titleOddsPct: team.titleOddsPct,
      };
    })
    .filter((row) => row.yourValue > 0)
    .sort((a, b) => b.fragility - a.fragility || b.yourValue - a.yourValue);
}

function buildStrategicMoveRows(selectionRows, currentAssignments) {
  return selectionRows
    .map((team) => {
      const yourValue = Number(currentAssignments?.[team.id] ?? 0);
      const slotGap = Number((yourValue - team.fairValue).toFixed(1));
      const riskScore = Number((((100 - (team.marketLean ?? 50)) * 0.6) + ((100 - (team.titleOddsPct ?? 0)) * 0.4)).toFixed(1));
      const upsideScore = Number((team.poolEv + team.expectedPoints * 0.5 + Math.max(0, slotGap) * 0.8).toFixed(1));

      let moveType = "Balanced hold";
      let headline = `${team.abbreviation} is mostly a hold-the-line assignment`;
      let body = `${team.abbreviation} is close to a fair slot already, so the question here is more about whether you trust the team than whether the slot is badly wrong.`;
      const toneSeed = (team.abbreviation?.charCodeAt?.(1) ?? 0) % 3;

      if (yourValue > 0 && riskScore >= 55 && upsideScore >= 18) {
        moveType = "Risk with upside";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is a risk with real upside`;
          body = `${team.abbreviation} is not one of the safer teams on the board, but the payoff is still meaningful if you are right. This is the kind of slot that can separate you without being obvious chalk.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is a swing worth thinking hard about`;
          body = `There is real failure risk here, but there is also enough upside to justify the discomfort. These are the teams that can make a board feel smart instead of merely tidy.`;
        } else {
          headline = `${team.abbreviation} is where conviction starts to matter`;
          body = `You are not buying safety here. You are betting that the upside is big enough to repay a slot that could easily look too aggressive if the team breaks the wrong way early.`;
        }
      } else if (yourValue > 0 && slotGap >= 2) {
        moveType = "Rich slot";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} may be too expensive in this slot`;
          body = `You have ${team.abbreviation} above where the board model currently wants them. The upside is still there, but the cost of the slot may now be doing too much of the work.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is starting to look like a luxury price`;
          body = `The team can still hit, but this slot is charging close to full freight already. That is usually the moment to ask whether you are paying for the team or paying for the story of the team.`;
        } else {
          headline = `${team.abbreviation} is one of the richer bets on your board`;
          body = `This is not a bad team problem; it is a pricing problem. The board can like ${team.abbreviation} and still think you are asking too much of them at this number.`;
        }
      } else if (yourValue > 0 && slotGap <= -2 && team.poolEv >= 14) {
        moveType = "Upside buy";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} looks cheap for the upside`;
          body = `${team.abbreviation} is sitting below the slot the board model prefers. That makes this one of the cleaner ways to buy upside without spending a top-shelf number.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} may be one of your better value buys`;
          body = `The board would happily pay a little more for ${team.abbreviation} than you currently are. That does not make them free upside, but it does make this one of the more attractive under-slotted teams.`;
        } else {
          headline = `${team.abbreviation} is giving you more ceiling than the slot cost suggests`;
          body = `This is the kind of assignment that makes the rest of a board easier to live with. You are getting meaningful upside without burning one of the very top shelf numbers to do it.`;
        }
      } else if (yourValue > 0 && riskScore <= 35 && team.marketLean >= 65) {
        moveType = "Safe but expensive";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is the safer path here`;
          body = `${team.abbreviation} gives you a steadier floor than most of the field. The main question is not safety, but whether this slot is too valuable for a merely steady team.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is the calm option, though not a cheap one`;
          body = `If your goal is to lower the temperature on the board, ${team.abbreviation} helps. The tradeoff is that safety at this slot can start to crowd out higher-ceiling uses of the same number.`;
        } else {
          headline = `${team.abbreviation} is doing more floor work than ceiling work`;
          body = `This is the slot you land on when you want steadiness. That can be right. It just means the argument for the assignment is less about breakout upside and more about not stepping on a landmine.`;
        }
      } else if (yourValue > 0 && toneSeed === 1) {
        headline = `${team.abbreviation} is a pretty balanced hold`;
        body = `Nothing here is screaming for a move. ${team.abbreviation} is close enough to fair value that the real question is simply how much of this team you want emotionally on your board.`;
      } else if (yourValue > 0 && toneSeed === 2) {
        headline = `${team.abbreviation} is not the loudest decision, but it still matters`;
        body = `These middle-ground slots tend to get overlooked because they are not obvious mistakes. They still matter, though, because a board usually wins or loses through the accumulation of these quieter calls.`;
      }

      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline,
        body,
        moveType,
        yourValue,
        fairValue: team.fairValue,
        riskScore,
        upsideScore,
        expectedPoints: team.expectedPoints,
        poolEv: team.poolEv,
      };
    })
    .filter((row) => row.yourValue > 0)
    .sort((a, b) => b.upsideScore - a.upsideScore || b.riskScore - a.riskScore);
}

function fairGap(yourValue, fairValue) {
  return Math.abs(Number(yourValue ?? 0) - Number(fairValue ?? 0));
}

export function buildTeamValueReports({
  profileId,
  memberList,
  allAssignmentsByUser,
  seriesByRound,
  teamsById,
  series,
}) {
  const phase = getTeamValuePhase();
  const teams = getRoundOneTeamsFromData(seriesByRound, teamsById);
  const standings = buildTeamValueStandingsWithOdds(memberList, allAssignmentsByUser, series);
  const currentStanding = standings.find((member) => member.id === profileId) ?? null;
  const currentAssignments = getCurrentAssignments(profileId, allAssignmentsByUser);
  const selectionRows = buildTeamSelectionRows(teams, seriesByRound, allAssignmentsByUser, profileId, memberList.length);
  const exposures = phase === "post_lock" ? buildTeamExposureRows(teams, allAssignmentsByUser, profileId) : [];

  const slotFits = buildSlotFitRows(selectionRows, currentAssignments);
  const overweight = buildOverweightRows(exposures, selectionRows);
  const biggestAssets = buildBiggestAssetsRows(selectionRows, currentAssignments);
  const rootingGuide = buildRootingRows(selectionRows, seriesByRound, currentAssignments);
  const fragility = buildFragilityRows(selectionRows, currentAssignments);
  const modelGaps = buildModelGapRows(selectionRows, currentAssignments);
  const strategicMoves = buildStrategicMoveRows(selectionRows, currentAssignments);

  const reports = {
    "slot-fits": {
      key: "slot-fits",
      label: "Best slot fits",
      title: "Where does each team really belong on your board?",
      description: "This compares your assignments to a fair-value slot built from expected points, title equity, and the current playoff path.",
      rows: slotFits,
      stage: "always",
    },
    assets: {
      key: "assets",
      label: "Biggest assets",
      title: "Which teams are really carrying your outcome?",
      description: "These are the teams doing the most work on your current board, combining assigned value with expected scoring from here.",
      rows: biggestAssets,
      stage: "always",
    },
    rooting: {
      key: "rooting",
      label: "Rooting guide",
      title: "What outcomes cash your portfolio fastest?",
      description: "This is the first-round leverage board: the series where the teams you valued most can start returning points quickly.",
      rows: rootingGuide,
      stage: "always",
    },
    fragility: {
      key: "fragility",
      label: "Fragility",
      title: "Where is your board stronger or shakier than it seems?",
      description: "Not all high slots are created equal. This looks for places where heavy value is sitting on thinner market or title footing.",
      rows: fragility,
      stage: "always",
    },
    "model-gaps": {
      key: "model-gaps",
      label: "Market vs model",
      title: "Where do the public price and model disagree?",
      description: "This stays fair pre-lock because it compares your board to outside signals, not to hidden room selections.",
      rows: modelGaps,
      stage: "always",
    },
    "strategic-moves": {
      key: "strategic-moves",
      label: "Strategic moves",
      title: "Where are the board's best risk-reward decisions?",
      description: "This highlights the slot-team decisions that feel most strategic right now: upside buys, rich slots, and risks that might still be worth it.",
      rows: strategicMoves,
      stage: "always",
    },
    overweight: {
      key: "overweight",
      label: "Overweight / underweight",
      title: "Where are you above or below the room?",
      description: "This only becomes available after lock, once board comparisons inside the pool are fair game.",
      rows: overweight,
      stage: "post_lock",
    },
  };

  return {
    phase,
    summary: buildSummary(currentStanding, slotFits, fragility),
    currentStanding,
    standings,
    reports,
    visibleReportKeys: Object.values(reports)
      .filter((report) => report.stage === "always" || phase === "post_lock")
      .map((report) => report.key),
  };
}
