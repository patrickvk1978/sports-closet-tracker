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

function hashSeed(...parts) {
  return parts
    .filter(Boolean)
    .join("|")
    .split("")
    .reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function pickVariant(options, ...seedParts) {
  if (!options.length) return "";
  return options[hashSeed(...seedParts) % options.length];
}

function coachLine(options, ...seedParts) {
  return pickVariant(options, "coach", ...seedParts);
}

function boothLine(options, ...seedParts) {
  return pickVariant(options, "booth", ...seedParts);
}

function colorLine(options, ...seedParts) {
  return pickVariant(options, "color", ...seedParts);
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
      headline: coachLine([
        "Finish the full 16-to-1 board to unlock the stronger read.",
        "The board still needs all 16 slots before the real story can start.",
        "Get the whole board set first; then this page becomes much more useful.",
      ], "summary-empty-head"),
      body: `${coachLine([
        "Once every slot is assigned, this page can explain where your value is concentrated, where you differ from the room, and which results matter most.",
        "Once the board is complete, this page can stop being a reminder and start acting like a real decision desk.",
        "Right now the best coaching note is simple: finish the board. After that, the asset, leverage, and rooting reads get sharper fast.",
      ], "summary-empty-body")} ${colorLine([
        "No board, no orchestra.",
        "The chalkboard still needs chalk.",
        "Hard to run the offense without all five on the floor.",
      ], "summary-empty-color")}`,
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
    headline: boothLine([
      `${topFit?.teamLabel ?? "Your board"} is shaping the whole story right now.`,
      `${topFit?.teamLabel ?? "Your top slot"} is one of the names steering this board`,
      `Your board is still being defined by the way you slotted ${topFit?.teamLabel ?? "the top end"}`,
    ], topFit?.teamLabel, topFragility?.teamLabel, currentStanding.place, "summary-head"),
    body: `${boothLine([
      `From ${ordinal(currentStanding.place)}, your board still has ${currentStanding.liveValueRemaining} live value. The biggest question is whether your highest slots are in the right teams and whether ${topFragility?.teamLabel ?? "your top exposures"} are sturdier than they look.`,
      `From ${ordinal(currentStanding.place)}, you still have ${currentStanding.liveValueRemaining} live value working for you. The interesting tension is whether your premium slots are on the right teams and whether ${topFragility?.teamLabel ?? "the thinner exposures"} can really hold up.`,
      `There is still ${currentStanding.liveValueRemaining} live value on your side from ${ordinal(currentStanding.place)}. What matters now is whether your highest slots are asking too much and whether ${topFragility?.teamLabel ?? "the shakier names"} can keep collecting wins long enough to justify the assignment.`,
    ], topFit?.teamLabel, topFragility?.teamLabel, currentStanding.place, "summary-body")} ${colorLine([
      `This is where the board stops being a spreadsheet and starts becoming a mood.`,
      `Some boards feel sturdy. Some feel spicy. This one is still deciding which it wants to be.`,
      `The board has some real horsepower left. The question is whether the suspension can handle it.`,
    ], topFit?.teamLabel, topFragility?.teamLabel, currentStanding.place, "summary-color")}`,
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
      const gapSize = Math.abs(slotDelta);
      let fitType = "clean";
      let headline = `${team.abbreviation} already sits in a clean slot`;
      let body = `You already have ${team.abbreviation} in the range the board expects, with ${expectedPoints} expected points and ${poolEv} pool EV.`;

      if (slotDelta >= 3.5) {
        fitType = "over";
        headline = coachLine([
          `${team.abbreviation} is one of the steepest asks on your board`,
          `${team.abbreviation} is being asked to justify a very ambitious slot`,
          `${team.abbreviation} is one of the clearest overextended slots`,
        ], team.abbreviation, slotDelta, yourValue, "slot-hard-over-head");
        body = `${coachLine([
          `At ${yourValue}, ${team.abbreviation} is sitting well above the board's fair view of ${team.fairValue}.`,
          `This is no longer just a small lean. ${team.abbreviation} is being treated more like a top-shelf asset than the board currently supports.`,
          `The board still likes ${team.abbreviation}; it just does not like using this strong a slot on the path.`,
        ], team.abbreviation, slotDelta, yourValue, "slot-hard-over-body")} ${colorLine([
          `This is the kind of slot that can quietly drag the rest of the board uphill.`,
          `Useful if it lands. Heavy if it misses.`,
          `This is where slot cost stops being background noise and starts becoming the whole story.`,
        ], team.abbreviation, slotDelta, "slot-hard-over-color")}`;
      } else if (slotDelta >= 2) {
        fitType = "over";
        headline = coachLine([
          `${team.abbreviation} is one of your richest slots`,
          `${team.abbreviation} is getting premium treatment on your board`,
          `${team.abbreviation} is one of the stronger asks you are carrying`,
        ], team.abbreviation, slotDelta, "slot-over-head");
        body = `${coachLine([
          `You are using a ${yourValue} slot on ${team.abbreviation}, while the board reads them closer to ${team.fairValue}.`,
          `${team.abbreviation} is sitting more like a ${yourValue} than the board really wants; it sees them nearer ${team.fairValue}.`,
          `The question is not whether ${team.abbreviation} is good. It is whether this board should be using a ${yourValue} slot when the fair landing spot still looks closer to ${team.fairValue}.`,
        ], team.abbreviation, slotDelta, "slot-over-body")} ${colorLine([
          `That is not a ban on the team. It is a reminder that slot cost matters too.`,
          `The team may still hit; the slot is what is starting to blink.`,
          `There is a difference between liking the team and paying retail for the team.`,
        ], team.abbreviation, slotDelta, "slot-over-color")}`;
      } else if (slotDelta > 0) {
        fitType = "over";
        headline = coachLine([
          `${team.abbreviation} may be a touch expensive`,
          `${team.abbreviation} is close, but maybe still a little rich`,
          `${team.abbreviation} is not far off, though the slot is leaning high`,
        ], team.abbreviation, slotDelta, "slot-soft-over-head");
        body = `${coachLine([
          `${team.abbreviation} is only slightly above the board's fair slot, so the real question is whether ${expectedPoints} expected points and ${poolEv} pool EV justify the extra spend.`,
          `This is more of a pricing nudge than a full red flag, but the board still wants to know whether ${expectedPoints} expected points are enough to warrant ${yourValue}.`,
          `${team.abbreviation} is within range. The only real issue is whether this slot is buying enough payoff for the cost.`,
        ], team.abbreviation, slotDelta, "slot-soft-over-body")} ${colorLine([
          `These are the spots that quietly add up on a board.`,
          `This is where a board can leak value without looking reckless.`,
          `No sirens here, just a meter running a little hot.`,
        ], team.abbreviation, slotDelta, "slot-soft-over-color")}`;
      } else if (slotDelta <= -3.5) {
        fitType = "under";
        headline = coachLine([
          `${team.abbreviation} may be one of the biggest bargains on the board`,
          `${team.abbreviation} is sitting meaningfully below the board's fair slot`,
          `${team.abbreviation} is one of the clearest cheap-upside cases you have`,
        ], team.abbreviation, slotDelta, yourValue, "slot-hard-under-head");
        body = `${coachLine([
          `At ${yourValue}, ${team.abbreviation} is landing well below the board's fair view of ${team.fairValue}.`,
          `This is more than a small discount. ${team.abbreviation} is being carried materially lighter than the board would normally place it.`,
          `If this team hangs around, the board gets more from the slot than the current assignment is implying.`,
        ], team.abbreviation, slotDelta, yourValue, "slot-hard-under-body")} ${boothLine([
          `This is how a board finds room to breathe.`,
          `This is one of the cleaner ways to buy ceiling without paying full freight.`,
          `These are the discounts that make the harder top-end calls easier to live with.`,
        ], team.abbreviation, slotDelta, "slot-hard-under-booth")}`;
      } else if (slotDelta <= -2) {
        fitType = "under";
        headline = coachLine([
          `${team.abbreviation} looks under-slotted for the upside`,
          `${team.abbreviation} is one of your cleaner upside buys`,
          `${team.abbreviation} may be sitting lower than the board would usually place it`,
        ], team.abbreviation, slotDelta, "slot-under-head");
        body = `${coachLine([
          `${team.abbreviation} is sitting at ${yourValue}, even though the board would push them nearer ${team.fairValue}.`,
          `The board sees ${team.abbreviation} as more of a ${team.fairValue} than a ${yourValue}, which is what makes this one interesting.`,
          `At ${yourValue}, ${team.abbreviation} is landing lighter than the underlying board read suggests.`,
        ], team.abbreviation, slotDelta, "slot-under-body")} ${boothLine([
          `That is how a board steals ceiling without advertising it.`,
          `This is the kind of quiet buy that can make the rest of the board breathe easier.`,
          `If this one lands, it gives you more juice than the slot cost implies.`,
        ], team.abbreviation, slotDelta, "slot-under-booth")}`;
      } else if (slotDelta < 0) {
        fitType = "under";
        headline = coachLine([
          `${team.abbreviation} still has a little room to climb`,
          `${team.abbreviation} is more quiet value than loud conviction`,
          `${team.abbreviation} may still deserve a slightly higher look`,
        ], team.abbreviation, slotDelta, "slot-soft-under-head");
        body = `${coachLine([
          `${team.abbreviation} is not dramatically cheap, but they are still coming in lighter than the board expects.`,
          `This is more of a nudge than a siren: ${team.abbreviation} is still a bit lighter than the board wants.`,
          `${team.abbreviation} is not a giant discount. It is just one of the cleaner small buys still sitting on the page.`,
        ], team.abbreviation, slotDelta, "slot-soft-under-body")} ${colorLine([
          `Quiet value still counts.`,
          `Not every useful move has to bang a drum.`,
          `This is more loose cash than lottery ticket.`,
        ], team.abbreviation, slotDelta, "slot-soft-under-color")}`;
      } else if (gapSize <= 0.5) {
        headline = coachLine([
          `${team.abbreviation} is about as clean a fit as you have`,
          `${team.abbreviation} looks very close to dead-on`,
          `${team.abbreviation} is one of the tidier assignments on the page`,
        ], team.abbreviation, "slot-very-clean-head");
        body = `${coachLine([
          `${team.abbreviation} is essentially where the board would put them already.`,
          `This is one of the spots where the slot, expected points, and pool EV are all telling a very similar story.`,
          `There is not much daylight here between your slot and the board's preferred slot.`,
        ], team.abbreviation, "slot-very-clean-body")} ${colorLine([
          `Probably not where today's board gains or loses the most.`,
          `This is not where the board is asking for attention.`,
          `A good reminder that some useful calls are the quiet ones.`,
        ], team.abbreviation, "slot-very-clean-color")}`;
      } else {
        headline = coachLine([
          `${team.abbreviation} already sits in a clean slot`,
          `${team.abbreviation} looks slotted about right`,
          `${team.abbreviation} is one of the steadier assignments on your board`,
        ], team.abbreviation, "slot-clean-head");
        body = `${coachLine([
          `You already have ${team.abbreviation} in the range the board expects, with ${expectedPoints} expected points and ${poolEv} pool EV.`,
          `${team.abbreviation} is not really asking for a move right now. The slot, expected points, and pool EV are mostly telling the same story.`,
          `This is one of the calmer assignments on the page: the board is not throwing a flag on the slot.`,
        ], team.abbreviation, "slot-clean-body")} ${colorLine([
          `No emergency here.`,
          `Keep moving.`,
          `This is not where the board is yelling for your attention.`,
        ], team.abbreviation, "slot-clean-color")}`;
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
      const isOver = row.leverage >= 0;
      return {
        id: row.id,
        teamLabel: `${row.city} ${row.name}`,
        headline: isOver
          ? colorLine([
              `You are above the room on ${row.abbreviation}`,
              `${row.abbreviation} is one of the places you are leaning harder than the room`,
              `${row.abbreviation} is carrying more of your conviction than the room's`,
            ], row.abbreviation, row.leverage, "overweight-head")
          : colorLine([
              `You are lighter than the room on ${row.abbreviation}`,
              `${row.abbreviation} is one of the spots where the room is heavier than you are`,
              `${row.abbreviation} is a place where you are giving the room more credit`,
            ], row.abbreviation, row.leverage, "underweight-head"),
        body: isOver
          ? `${boothLine([
              `You assigned ${row.yourValue} while the room average is ${row.avgValue}. That gives you more lift if ${row.abbreviation} runs, but also more exposure if they bust.`,
              `${row.abbreviation} is carrying more of your board than it is carrying for the average room card. If they run, you feel it faster; if they wobble, you feel that too.`,
              `At ${row.yourValue} against a room average of ${row.avgValue}, ${row.abbreviation} is one of the places your board is leaning harder into the ceiling case.`,
            ], row.abbreviation, row.leverage, "overweight-body")} ${colorLine([
              `This is where your board either looks sharp or starts explaining itself.`,
              `Useful when it hits. Loud when it misses.`,
              `This is the sort of exposure that can make you feel clever by Monday or defensive by Tuesday.`,
            ], row.abbreviation, row.leverage, "overweight-color")}`
          : `${boothLine([
              `You assigned ${row.yourValue} while the room average is ${row.avgValue}. That means a longer ${row.abbreviation} stay in the bracket helps the room more than it helps you.`,
              `${row.abbreviation} is carrying less weight on your board than it is across the room, so every extra win is doing more collective good than personal good.`,
              `With ${row.yourValue} against a room average of ${row.avgValue}, ${row.abbreviation} is one of the clearer spots where the field is holding more of the progressive scoring upside than you are.`,
            ], row.abbreviation, row.leverage, "underweight-body")} ${colorLine([
              `If they go cold, you will feel smart. If they get hot, you will hear about it.`,
              `This is one of those spots where the room can start celebrating before you are ready to join in.`,
              `There is some “hope they cool off” energy baked into this one.`,
            ], row.abbreviation, row.leverage, "underweight-color")}`,
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
        headline: boothLine([
          `${team.abbreviation} is one of your biggest live assets`,
          `${team.abbreviation} is doing major lifting for your board`,
          `${team.abbreviation} is one of the names carrying your fate`,
        ], team.abbreviation, yourValue, "assets-head"),
        body: `${boothLine([
          `${team.abbreviation} is carrying ${yourValue} of your board, with ${team.expectedPoints} expected points and ${team.poolEv} pool EV from here.`,
          `${yourValue} points are tied to ${team.abbreviation}, which is exactly why they sit near the center of your board's future path.`,
          `${team.abbreviation} is not just alive on your board. It is one of the teams actually driving the return case from here.`,
        ], team.abbreviation, yourValue, "assets-body")} ${colorLine([
          `If this one runs, the board breathes easier.`,
          `This is one of the chips that can still move the whole room for you.`,
          `This is the sort of team that makes you check the bracket before you check your messages.`,
        ], team.abbreviation, yourValue, "assets-color")}`,
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
          ? boothLine([
              `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is balanced on your board`,
              `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is more texture than stance for you`,
              `${seriesItem.homeTeam.abbreviation}-${seriesItem.awayTeam.abbreviation} is not a heavy lean on your board`,
            ], seriesItem.id, "rooting-even-head")
          : boothLine([
              `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is your stronger side here`,
              `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is the side that matters more to your board`,
              `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is where more of your board equity is sitting`,
            ], seriesItem.id, preferred?.abbreviation, "rooting-lean-head"),
      body:
        gap === 0
          ? `${boothLine([
              `You slotted both sides similarly, so this series is more about broad bracket texture than one concentrated asset.`,
              `This is more of a bracket-shape series for you than a concentrated rooting spot.`,
              `The board does not have a giant thumb on the scale here, which makes this one more informational than emotional.`,
            ], seriesItem.id, "rooting-even-body")} ${colorLine([
              `You can watch this one with a normal heartbeat.`,
              `This is a “keep one eye on it” series, not a “clear your evening” series.`,
              `No need to throw furniture over this one yet.`,
            ], seriesItem.id, "rooting-even-color")}`
          : `${boothLine([
              `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is carrying ${yourValue} points for you here, while ${other?.abbreviation ?? seriesItem.awayTeam.abbreviation} is sitting at ${homeValue >= awayValue ? awayValue : homeValue}.`,
              `More of your board is tied to ${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} than to ${other?.abbreviation ?? seriesItem.awayTeam.abbreviation}, which is what makes the rooting angle real here.`,
              `${preferred?.abbreviation ?? seriesItem.homeTeam.abbreviation} is simply worth more to your board right now, and that is enough to make this series matter.`,
            ], seriesItem.id, preferred?.abbreviation, "rooting-lean-body")} ${colorLine([
              `This is where your rooting card starts to get loud.`,
              `If you are going to pace the room, this is a good candidate.`,
              `This one has “check the score twice during dinner” energy.`,
            ], seriesItem.id, preferred?.abbreviation, "rooting-lean-color")}`,
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
      const toneSeed = (team.abbreviation?.charCodeAt?.(0) ?? 0) % 4;
      const weightedGap = gap + Math.min(6, yourValue * 0.25);

      let headline = `${team.abbreviation} is one of the bigger market-model split teams`;
      let body = `The market has ${team.abbreviation} at ${marketLean}%, while the model is at ${modelLean}%. That ${gap}-point gap matters more because you currently have them at ${yourValue || "an unassigned slot"}.`;

      if (modelHigher && weightedGap >= 10 && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the strongest model-over-market cases`;
        body = `The model is materially warmer than the market here, and because you already have real board value tied up in ${team.abbreviation}, this is more than a passing disagreement.`;
      } else if (modelHigher && weightedGap >= 10 && toneSeed === 1) {
        headline = `${team.abbreviation} is drawing one of the louder internal votes of confidence`;
        body = `The market read is cautious, but the model is leaning much harder into ${team.abbreviation}. When the gap is this clear, it is usually worth asking whether the market is lagging the path or the board is getting seduced by noise.`;
      } else if (modelHigher && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the clearer model-over-market spots`;
        body = `The model is buying ${team.abbreviation} more aggressively than the market is. At ${modelLean}% versus ${marketLean}%, this is the kind of team that asks whether the public read is being a little too cautious.`;
      } else if (modelHigher && toneSeed === 1) {
        headline = `${team.abbreviation} is getting a quieter vote of confidence from the model`;
        body = `${team.abbreviation} is not being viewed quite as warmly by the market, but the model still sees more runway here. If you already have real value tied up in them, that disagreement is worth respecting because a longer stay now pays out more gradually along the way.`;
      } else if (modelHigher && toneSeed === 2) {
        headline = `${team.abbreviation} may have more under the hood than the market is giving it credit for`;
        body = `The market is sitting at ${marketLean}%, but the model pushes ${team.abbreviation} to ${modelLean}%. That does not automatically make them right, but it does make this one of the better cases for taking a closer second look.`;
      } else if (modelHigher) {
        headline = `${team.abbreviation} is one of the sharper quiet disagreements on the board`;
        body = `This is not the market and model shrugging past each other. The model is materially warmer on ${team.abbreviation}, which makes them one of the better “check the assumptions” teams before lock.`;
      } else if (!modelHigher && weightedGap >= 10 && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the clearer market-over-model warnings`;
        body = `The public read is leaning a lot harder than the model here, which makes this a useful “what exactly is this slot asking me to believe?” check if the team is sitting in a meaningful assignment.`;
      } else if (!modelHigher && weightedGap >= 10 && toneSeed === 1) {
        headline = `${team.abbreviation} is carrying more public confidence than model support`;
        body = `This is not just a small split. The market is making a much firmer case than the model, which is often where a board ends up paying for the consensus story a little too dearly.`;
      } else if (!modelHigher && toneSeed === 0) {
        headline = `${team.abbreviation} is one of the spots where the market is more convinced`;
        body = `The market is stronger than the model here, which can mean one of two things: either the market is seeing a cleaner path, or the team is already being treated close to its ceiling.`;
      } else if (!modelHigher && toneSeed === 1) {
        headline = `${team.abbreviation} is drawing more market trust than model trust`;
        body = `${marketLean}% market versus ${modelLean}% model is not a small split. If you have a heavy slot on ${team.abbreviation}, this is exactly the sort of disagreement that should make you ask what assumption the assignment is really leaning on.`;
      } else if (toneSeed === 2) {
        headline = `${team.abbreviation} looks a little more public-facing than model-backed`;
        body = `The market is leaning harder into ${team.abbreviation} than the model is. Sometimes that is justified; sometimes it is just a reminder that the consensus case has already been priced in.`;
      } else {
        headline = `${team.abbreviation} is getting the louder market microphone`;
        body = `The market is speaking more confidently than the model on ${team.abbreviation}. That does not settle the argument, but it does tell you where the broader read is willing to lean harder than the underlying model view.`;
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
      const fragilityBand = fragility >= 10 ? "high" : fragility >= 6 ? "medium" : "light";
      return {
        id: team.id,
        teamLabel: `${team.city} ${team.name}`,
        headline: fragilityBand === "high"
          ? coachLine([
              `${team.abbreviation} is one of your shakier high slots`,
              `${team.abbreviation} is one of the thinner parts of your board`,
              `${team.abbreviation} is carrying more fragility than you might like`,
            ], team.abbreviation, yourValue, "fragility-head-high")
          : fragilityBand === "medium"
            ? coachLine([
                `${team.abbreviation} is solid enough, but not bulletproof`,
                `${team.abbreviation} is carrying some quiet fragility`,
                `${team.abbreviation} is not a red-alert slot, but it is not especially sturdy either`,
              ], team.abbreviation, yourValue, "fragility-head-medium")
            : coachLine([
                `${team.abbreviation} is one of the steadier exposures on your board`,
                `${team.abbreviation} is carrying value without much structural strain`,
                `${team.abbreviation} looks sturdier than most of the fragile tier`,
              ], team.abbreviation, yourValue, "fragility-head-light"),
        body: fragilityBand === "high"
          ? `${coachLine([
              `${team.abbreviation} is carrying ${yourValue} points on your board, but only ${team.marketLean}% Round 1 market confidence and ${team.titleOddsPct}% title equity.`,
              `${yourValue} points are sitting on a team with only ${team.marketLean}% Round 1 market confidence and ${team.titleOddsPct}% title equity, which is why this slot reads thinner than it looks.`,
              `${team.abbreviation} has real upside, but the market/title profile is light enough that this slot can make the board feel shallower than it first appears.`,
            ], team.abbreviation, yourValue, "fragility-body-high")} ${colorLine([
              `Every board has some spice. The trick is not mistaking spice for structure.`,
              `You can carry one or two of these. You just do not want to build a whole porch out of them.`,
              `This is the kind of slot that looks brave on Tuesday and stressful on Saturday.`,
            ], team.abbreviation, yourValue, "fragility-color-high")}`
          : fragilityBand === "medium"
            ? `${coachLine([
                `${team.abbreviation} still has enough path quality to work, but the underlying confidence profile is not as sturdy as the slot might suggest.`,
                `${team.abbreviation} is not a collapse candidate by default. It is just a reminder that not every valuable slot is equally well insulated.`,
                `The slot can still succeed, but the confidence cushion is thinner than it first appears.`,
              ], team.abbreviation, yourValue, "fragility-body-medium")} ${colorLine([
                `Worth watching, not panicking over.`,
                `This is more hairline crack than flashing siren.`,
                `You can live with this. You just do not want too many copies of it.`,
              ], team.abbreviation, yourValue, "fragility-color-medium")}`
            : `${coachLine([
                `${team.abbreviation} is carrying value without a lot of structural stress.`,
                `Compared with the shakier names, ${team.abbreviation} is doing its work without asking for a lot of blind faith.`,
                `${team.abbreviation} still has some risk, but less of the hidden brittleness than the true danger slots.`,
              ], team.abbreviation, yourValue, "fragility-body-light")} ${colorLine([
                `Not every sturdy slot has to be boring.`,
                `This is closer to beam than splinter.`,
                `Useful reminder that steadiness still has value on these boards.`,
              ], team.abbreviation, yourValue, "fragility-color-light")}`,
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
      const leverageBand = upsideScore - riskScore;

      let moveType = "Balanced hold";
      let headline = `${team.abbreviation} is mostly a hold-the-line assignment`;
      let body = `${team.abbreviation} is close to a fair slot already, so the question here is more about whether you trust the team than whether the slot is badly wrong.`;
      const toneSeed = (team.abbreviation?.charCodeAt?.(1) ?? 0) % 4;

      if (yourValue > 0 && riskScore >= 62 && upsideScore >= 22) {
        moveType = "Risk with upside";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is one of the bigger swing-for-payoff spots`;
          body = `This is a genuinely volatile assignment, but the reward still clears the bar if you are right. It is the kind of slot that can change the texture of a board, not just tweak it.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is where the board gets aggressive on purpose`;
          body = `The safety profile is thin, but the payoff is big enough that the risk is at least coherent. These are the moves that separate conviction from neatness.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is one of the more uncomfortable upside bets you can still justify`;
          body = `This slot is not asking for comfort. It is asking whether you think the reward is strong enough to make the discomfort worth owning.`;
        } else {
          headline = `${team.abbreviation} is a high-sweat, high-return kind of call`;
          body = `Some risky slots are just reckless. This one still has enough payoff behind it to qualify as a real strategic choice.`;
        }
      } else if (yourValue > 0 && riskScore >= 55 && upsideScore >= 18) {
        moveType = "Risk with upside";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is a risk with real upside`;
          body = `${team.abbreviation} is not one of the safer teams on the board, but the payoff is still meaningful if you are right. This is the kind of slot that can separate you without being obvious chalk.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is a swing worth thinking hard about`;
          body = `There is real failure risk here, but there is also enough upside to justify the discomfort. These are the teams that can make a board feel smart instead of merely tidy.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is where conviction starts to matter`;
          body = `You are not buying safety here. You are betting that the upside is big enough to repay a slot that could easily look too aggressive if the team breaks the wrong way early.`;
        } else {
          headline = `${team.abbreviation} is the kind of swing that can make a board look smart`;
          body = `This is not comfort food. It is the sort of assignment where you accept the sweat because the payoff is still worthy of the slot if the team gets rolling.`;
        }
      } else if (yourValue > 0 && slotGap >= 2) {
        moveType = "Rich slot";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} may be too expensive in this slot`;
          body = `You have ${team.abbreviation} above where the board model currently wants them. The upside is still there, but the cost of the slot may now be doing too much of the work.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is starting to look like a luxury slot`;
          body = `The team can still hit, but this slot is asking close to full freight already. That is usually the moment to ask whether you are backing the team or just the story of the team.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is one of the richer bets on your board`;
          body = `This is not a bad team problem; it is a pricing problem. The board can like ${team.abbreviation} and still think you are asking too much of them at this number.`;
        } else {
          headline = `${team.abbreviation} is being asked to justify a pretty steep slot`;
          body = `The team can work. The slot can still be too ambitious. That is the whole argument here.`;
        }
      } else if (yourValue > 0 && slotGap <= -3 && team.poolEv >= 15.5) {
        moveType = "Upside buy";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} may be one of the cleaner upside bargains you have`;
          body = `The board would price ${team.abbreviation} materially higher than where you have them now. That does not make the outcome free, but it does make the slot one of the stronger value buys on the page.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is giving you a lot of ceiling for the slot cost`;
          body = `This is the kind of assignment that lets a board take real upside without paying a premium number to do it.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is sitting in one of the board's better discount lanes`;
          body = `If the team delivers even a modestly strong path, the board gets more back than this slot is really charging for.`;
        } else {
          headline = `${team.abbreviation} is closer to bargain aggression than reckless aggression`;
          body = `There is still risk here, but the pricing is favorable enough that the board is not paying full freight for the upside case.`;
        }
      } else if (yourValue > 0 && slotGap <= -2 && team.poolEv >= 14) {
        moveType = "Upside buy";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} looks cheap for the upside`;
          body = `${team.abbreviation} is sitting below the slot the board model prefers. That makes this one of the cleaner ways to buy upside without spending a top-shelf number.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} may be one of your better value buys`;
          body = `The board would happily pay a little more for ${team.abbreviation} than you currently are. That does not make them free upside, but it does make this one of the more attractive under-slotted teams.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is giving you more ceiling than the slot cost suggests`;
          body = `This is the kind of assignment that makes the rest of a board easier to live with. You are getting meaningful upside without burning one of the very top shelf numbers to do it.`;
        } else {
          headline = `${team.abbreviation} is one of the board's cleaner value swings`;
          body = `This is the pleasant version of aggression: you are getting real payoff potential without paying top-tier freight for it.`;
        }
      } else if (yourValue > 0 && riskScore <= 28 && team.marketLean >= 72) {
        moveType = "Safe but expensive";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is one of the cleaner floor plays on the board`;
          body = `This is a very understandable slot if your goal is to protect the board from downside. The tradeoff is that you are spending real rank capital on steadiness more than on breakout payoff.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is the classic safe answer, but it is not cheap`;
          body = `The floor is real. So is the opportunity cost. This is the kind of slot that stabilizes a board while quietly asking whether the ceiling sacrifice is worth it.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is buying comfort at a meaningful cost`;
          body = `The assignment makes the board easier to live with, but it also spends a strong slot on a calmer outcome profile.`;
        } else {
          headline = `${team.abbreviation} is the steady hand option, with the usual expensive strings attached`;
          body = `There is nothing incoherent about the call. The only real debate is whether the safety is worth what the slot costs.`;
        }
      } else if (yourValue > 0 && riskScore <= 35 && team.marketLean >= 65) {
        moveType = "Safe but expensive";
        if (toneSeed === 0) {
          headline = `${team.abbreviation} is the safer path here`;
          body = `${team.abbreviation} gives you a steadier floor than most of the field. The main question is not safety, but whether this slot is too valuable for a merely steady team.`;
        } else if (toneSeed === 1) {
          headline = `${team.abbreviation} is the calm option, though not a cheap one`;
          body = `If your goal is to lower the temperature on the board, ${team.abbreviation} helps. The tradeoff is that safety at this slot can start to crowd out higher-ceiling uses of the same number.`;
        } else if (toneSeed === 2) {
          headline = `${team.abbreviation} is doing more floor work than ceiling work`;
          body = `This is the slot you land on when you want steadiness. That can be right. It just means the argument for the assignment is less about breakout upside and more about not stepping on a landmine.`;
        } else {
          headline = `${team.abbreviation} is the disciplined answer, though not the cheap one`;
          body = `If the board needs a calmer patch, this is one way to get it. Just do not confuse “less scary” with “best use of the slot” by default.`;
        }
      } else if (yourValue > 0 && leverageBand >= 8 && toneSeed === 0) {
        headline = `${team.abbreviation} is a quiet hold with a little more juice than it first appears`;
        body = `This is not the flashiest line on the board, but it may still be doing more useful work than the surrounding slots because the payoff remains healthy without taking on huge stress.`;
      } else if (yourValue > 0 && leverageBand <= -8 && toneSeed === 1) {
        headline = `${team.abbreviation} is the kind of calm hold that can start to feel a little flat`;
        body = `The assignment is not wrong. It just may not be giving you much more than a stable heartbeat, which matters if the surrounding choices are bringing more real leverage.`;
      } else if (yourValue > 0 && toneSeed === 1) {
        headline = `${team.abbreviation} is a pretty balanced hold`;
        body = `Nothing here is screaming for a move. ${team.abbreviation} is close enough to fair value that the real question is simply how much of this team you want emotionally on your board.`;
      } else if (yourValue > 0 && toneSeed === 2) {
        headline = `${team.abbreviation} is not the loudest decision, but it still matters`;
        body = `These middle-ground slots tend to get overlooked because they are not obvious mistakes. They still matter, though, because a board usually wins or loses through the accumulation of these quieter calls.`;
      } else if (yourValue > 0 && toneSeed === 3) {
        headline = `${team.abbreviation} is the kind of quiet slot that keeps a board honest`;
        body = `Not every useful assignment needs fireworks. Some just need to avoid making the rest of the board harder than it already is.`;
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
      description: "These are the teams doing the most work on your current board, combining assigned value with expected scoring from here under the progressive win model.",
      rows: biggestAssets,
      stage: "always",
    },
    rooting: {
      key: "rooting",
      label: "Rooting guide",
      title: "What outcomes cash your portfolio fastest?",
      description: "This is the first-round leverage board: the series where the teams you valued most can start returning wins and points quickly.",
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
      title: "Where do the market and model disagree?",
      description: "This stays fair pre-lock because it compares your board to outside signals, not to hidden room selections.",
      rows: modelGaps,
      stage: "always",
    },
    "strategic-moves": {
      key: "strategic-moves",
      label: "Strategic moves",
      title: "Where are the board's best risk-reward decisions?",
      description: "This highlights the slot-team decisions that feel most strategic right now: upside buys, rich slots, and risks that might still be worth it now that teams can score on the way to the clincher.",
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
