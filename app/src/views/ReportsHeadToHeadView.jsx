import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePoolData } from "../hooks/usePoolData";

const BRACKET_TREE = (() => {
  const tree = {};
  for (const base of [0, 15, 30, 45]) {
    for (let i = 0; i < 8; i += 1) tree[base + i] = [null, null];
    tree[base + 8] = [base + 0, base + 1];
    tree[base + 9] = [base + 2, base + 3];
    tree[base + 10] = [base + 4, base + 5];
    tree[base + 11] = [base + 6, base + 7];
    tree[base + 12] = [base + 8, base + 9];
    tree[base + 13] = [base + 10, base + 11];
    tree[base + 14] = [base + 12, base + 13];
  }
  tree[60] = [14, 29];
  tree[61] = [44, 59];
  tree[62] = [60, 61];
  return tree;
})();

const ROUND_PRIORITY = {
  Champ: 6,
  "Championship": 6,
  F4: 5,
  "Final Four": 5,
  E8: 4,
  S16: 3,
  R32: 2,
  R64: 1,
};

function pctWithinMatchup(a, b) {
  const safeA = Number.isFinite(a) ? Math.max(a, 0) : 0;
  const safeB = Number.isFinite(b) ? Math.max(b, 0) : 0;
  if (safeA === 0 && safeB === 0) return 50;
  return (safeA / (safeA + safeB)) * 100;
}

function formatPct(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
}

function formatDelta(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe > 0 ? "+" : ""}${safe.toFixed(1)} pts`;
}

function abbrev(name, map) {
  return (map && name && map[name]) || name || "TBD";
}

function uniqueTeams(list) {
  return [...new Set((list || []).filter(Boolean).filter((team) => team !== "TBD"))];
}

function formatTeamList(teams, map, limit = 4) {
  const unique = uniqueTeams(teams);
  if (!unique.length) return "TBD";
  const labels = unique.slice(0, limit).map((team) => abbrev(team, map));
  return unique.length > limit ? `${labels.join(", ")} +${unique.length - limit}` : labels.join(", ");
}

function slotCandidates(slot, gamesBySlot, memo = new Map()) {
  if (memo.has(slot)) return memo.get(slot);

  const game = gamesBySlot.get(slot);
  if (game?.winner) {
    const result = [game.winner];
    memo.set(slot, result);
    return result;
  }

  const [feed1, feed2] = BRACKET_TREE[slot] ?? [null, null];
  let result = [];

  if (feed1 == null && feed2 == null) {
    result = uniqueTeams([game?.team1, game?.team2]);
  } else {
    const side1 = game?.team1 && game.team1 !== "TBD"
      ? [game.team1]
      : slotCandidates(feed1, gamesBySlot, memo);
    const side2 = game?.team2 && game.team2 !== "TBD"
      ? [game.team2]
      : slotCandidates(feed2, gamesBySlot, memo);
    result = uniqueTeams([...side1, ...side2]);
  }

  memo.set(slot, result);
  return result;
}

function slotSideCandidates(slot, sideIndex, gamesBySlot, memo = new Map()) {
  const sideKey = `${slot}:${sideIndex}`;
  if (memo.has(sideKey)) return memo.get(sideKey);

  const game = gamesBySlot.get(slot);
  const explicitTeam = sideIndex === 0 ? game?.team1 : game?.team2;
  let result = [];

  if (explicitTeam && explicitTeam !== "TBD") {
    result = [explicitTeam];
  } else {
    const parentSlot = BRACKET_TREE[slot]?.[sideIndex];
    if (parentSlot == null) {
      result = [];
    } else {
      result = slotCandidates(parentSlot, gamesBySlot, memo);
    }
  }

  memo.set(sideKey, result);
  return result;
}

function teamSideIndex(team, side1, side2) {
  if (team && side1.includes(team)) return 0;
  if (team && side2.includes(team)) return 1;
  return null;
}

function outcomeTone(delta) {
  if (delta > 2) return "text-emerald-300";
  if (delta < -2) return "text-red-300";
  return "text-slate-300";
}

function swingTier(swing) {
  if (swing >= 20) return "huge";
  if (swing >= 10) return "strong";
  if (swing >= 5) return "medium";
  return "small";
}

function winPhrase(team) {
  const normalized = String(team || "").trim().toUpperCase();
  const article = /^[AEIOU]/.test(normalized) ? "an" : "a";
  return `${article} ${team} win`;
}

function noteVariantIndex(...parts) {
  const text = parts.filter(Boolean).join("|");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function chooseNote(options, seed, avoid) {
  if (!options.length) return "";
  const ordered = options.map((option, index) => ({
    option,
    score: (seed + index * 17) % 997,
  })).sort((a, b) => a.score - b.score);
  const preferred = ordered.find(({ option }) => option !== avoid);
  return (preferred ?? ordered[0]).option;
}

function fallbackFutureNote(game) {
  const seeds = noteVariantIndex(game.id, game.matchup, game.focus, game.leftPick, game.rightPick, game.round);
  const options = [
    `${game.matchup} would matter most if ${game.leftPick ?? "the left side"} stays alive long enough to cash in.`,
    `${game.matchup} is worth watching because the payoff is not symmetrical once the bracket paths settle.`,
    `If ${game.matchup} becomes real, the bigger upside is still attached to ${game.focus.replace(" path", "")}.`,
    `${game.matchup} could look similar on the surface, but one bracket would still get much more out of it.`,
    `This possible matchup is more about who still has ceiling left once the field narrows.`,
  ];
  return chooseNote(options, seeds, game.note);
}

function normalizeHeadToHeadNote(note, leftName, rightName) {
  return String(note || "")
    .replaceAll(leftName || "", "PLAYER_A")
    .replaceAll(rightName || "", "PLAYER_B")
    .replace(/\b[A-Z]{2,6}\b/g, "TEAM")
    .replace(/\b\d+(?:\.\d+)?%?\b/g, "NUM")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueifyFutureNotes(games) {
  const seen = new Set();
  const seenTemplates = new Set();
  return games.map((game, index) => {
    let note = game.note;
    let attempt = 0;
    let templateKey = `${game.kind}:${note.split(".")[0]}`;
    while ((seen.has(note) || seenTemplates.has(templateKey)) && attempt < 6) {
      const seed = noteVariantIndex(game.id, game.matchup, game.focus, game.leftPick, game.rightPick, game.round, attempt, index);
      const fallbackPoolsByKind = {
        direct: [
          `${game.matchup} would put both brackets on a collision course if the chalk keeps holding.`,
          `If ${game.matchup} becomes real, the winner probably takes a huge share of the story with it.`,
          `${game.matchup} is the sort of future showdown that can stop being theoretical in a hurry.`,
          `This is not just another future game. ${game.matchup} would feel like a real fork in the road.`,
        ],
        "left-path": [
          `${game.matchup} would mostly matter because ${game.focus.replace(" path", "")} still has the better ceiling on that side of the tree.`,
          `This is less about survival and more about whether ${game.focus.replace(" path", "")} can turn a live path into real leverage.`,
          `${game.matchup} is a more favorable future branch for ${game.focus.replace(" path", "")}, not just another likely pairing.`,
          `If ${game.matchup} becomes real, ${game.focus.replace(" path", "")} is the side that could still cash it into something meaningful.`,
        ],
        "right-path": [
          `${game.matchup} would mostly matter because ${game.focus.replace(" path", "")} is still trying to protect its upside on that side of the tree.`,
          `This is more of a pressure point for ${game.focus.replace(" path", "")} than a generic future pairing.`,
          `${game.matchup} matters because ${game.focus.replace(" path", "")} still has more to lose if the wrong team shows up.`,
          `If ${game.matchup} becomes real, ${game.focus.replace(" path", "")} is the side that would feel the stakes more sharply.`,
        ],
        default: [
          `${game.matchup} would still matter if the bracket paths line up, just for a different reason than the rows around it.`,
          `This future fork is not redundant, even if the setup overlaps with another likely matchup.`,
          `${game.matchup} carries its own version of upside once the tree settles.`,
          `${game.round}: ${game.matchup} is a separate future decision point with its own payoff structure.`,
        ],
      };
      const pool = fallbackPoolsByKind[game.kind] ?? fallbackPoolsByKind.default;
      note = chooseNote(pool, seed, note);
      templateKey = `${game.kind}:${note.split(".")[0]}`;
      attempt += 1;
    }
    seen.add(note);
    seenTemplates.add(templateKey);
    return { ...game, note };
  });
}

function uniqueifyCurrentNotes(games, leftName, rightName) {
  const seenShapes = new Set();
  return games.map((game, index) => {
    let note = game.note;
    let shape = normalizeHeadToHeadNote(note, leftName, rightName);
    let attempt = 0;
    while (seenShapes.has(shape) && attempt < 4) {
      const seed = noteVariantIndex(game.id, game.matchup, game.rootFor, game.leftPick, game.rightPick, attempt, index);
      const fallbackPools = {
        champion_hit: [
          `${game.rootFor} would land especially hard because it blows up the other bracket's biggest remaining dream.`,
          `This is not just a swing game. ${game.rootFor} would take a real championship path off the table.`,
          `${game.rootFor} would change the matchup fast because one side has its title hopes tied up here.`,
        ],
        pick_conflict: [
          `${game.rootFor} is one of the cleaner fork-in-the-road results left on the board.`,
          `There is real separation available here if ${game.rootFor} gets home.`,
          `${game.rootFor} would create one of the more obvious splits left in this matchup.`,
        ],
        same_pick: [
          `Same pick, different consequences. This result still pays better on one side than the other.`,
          `Both brackets can agree here and still walk away with very different outcomes.`,
          `No disagreement on the winner, plenty of disagreement in the payoff.`,
        ],
        left_exposed: [
          `${leftName} has more riding on this one, which is why it still matters.`,
          `This sits closer to ${leftName}'s path than ${rightName}'s, even without a huge public split.`,
          `${leftName} would feel this result more directly than ${rightName}.`,
        ],
        right_exposed: [
          `${rightName} has more riding on this one, which is why it still matters.`,
          `This sits closer to ${rightName}'s path than ${leftName}'s, even without a huge public split.`,
          `${rightName} would feel this result more directly than ${leftName}.`,
        ],
        subtle: [
          `This is more about what stays alive afterward than the game itself.`,
          `A quieter game on the surface, but the path effects are still real.`,
          `Not the loudest game on the board, though it still changes the menu of outcomes.`,
        ],
        default: [
          `This game still moves the matchup, just not in exactly the same way as the rows around it.`,
          `The stakes here are a little different from the nearby games, even if the numbers rhyme.`,
          `Another live lever in the race, but not just a copy of the row above.`,
        ],
      };
      const pool = fallbackPools[game.noteKind] ?? fallbackPools.default;
      note = chooseNote(pool, seed, note);
      shape = normalizeHeadToHeadNote(note, leftName, rightName);
      attempt += 1;
    }
    seenShapes.add(shape);
    return { ...game, note };
  });
}

function futureUses(player, team, fromSlot) {
  if (!player?.picks || !team) return 0;
  return player.picks.slice(fromSlot + 1).filter((pick) => pick === team).length;
}

function hasFinalFourExposure(player, team) {
  if (!player?.picks || !team) return false;
  return [60, 61, 62].some((slot) => player.picks?.[slot] === team);
}

function currentGameNote({
  gameId,
  pickConflict,
  rootFor,
  rootForRaw,
  leftPlayer,
  rightPlayer,
  leftPick,
  rightPick,
  leftChampion,
  rightChampion,
  team1,
  team2,
  team1Raw,
  team2Raw,
  swing,
}) {
  const tier = swingTier(swing);
  const hurtTeam = rootForRaw === team1Raw ? team2Raw : team1Raw;
  const variantSeed = noteVariantIndex(gameId, rootFor, rootForRaw, leftPlayer?.name, rightPlayer?.name, leftPick, rightPick, hurtTeam);
  const leftWinnerUpside = futureUses(leftPlayer, rootForRaw, gameId);
  const rightWinnerUpside = futureUses(rightPlayer, rootForRaw, gameId);
  const leftHurtExposure = futureUses(leftPlayer, hurtTeam, gameId);
  const rightHurtExposure = futureUses(rightPlayer, hurtTeam, gameId);
  const rightHurtFinalFour = hasFinalFourExposure(rightPlayer, hurtTeam);
  const leftHurtFinalFour = hasFinalFourExposure(leftPlayer, hurtTeam);

  if (tier !== "small" && rightHurtFinalFour && rightHurtExposure > 0 && hurtTeam !== rightChampion) {
    const options = [
      `${rootFor} would do real damage because it wipes out a live Final Four path for ${rightPlayer.name}.`,
      `${rightPlayer.name} still has ${hurtTeam === rightPick ? rightPick : team2} alive deep into the bracket, so ${winPhrase(rootFor)} would hurt more than a normal loss.`,
      `This result would not just sting ${rightPlayer.name}; it would knock out one of their real late-round routes.`,
      `${rightPlayer.name} has serious late-round equity tied up here, so ${winPhrase(rootFor)} would do more than trim the odds.`,
    ];
    return options[variantSeed % options.length];
  }

  if (tier !== "small" && leftHurtFinalFour && leftHurtExposure > 0 && hurtTeam !== leftChampion) {
    const options = [
      `${rootFor} would do real damage because it wipes out a live Final Four path for ${leftPlayer.name}.`,
      `${leftPlayer.name} still has ${hurtTeam === leftPick ? leftPick : team1} alive deep into the bracket, so ${winPhrase(rootFor)} would hurt more than a normal loss.`,
      `This result would not just sting ${leftPlayer.name}; it would knock out one of their real late-round routes.`,
      `${leftPlayer.name} has serious late-round equity tied up here, so ${winPhrase(rootFor)} would do more than trim the odds.`,
    ];
    return options[variantSeed % options.length];
  }

  if (tier !== "small" && leftWinnerUpside >= 2 && rightWinnerUpside === 0) {
    const options = [
      `${winPhrase(rootFor)} keeps both brackets alive for now, but only ${leftPlayer.name} still has real upside attached to it.`,
      `${leftPlayer.name} would get the meaningful upside here. ${rightPlayer.name} stays in it, but without much ceiling from this result.`,
      `Both sides can live with ${rootFor}, yet the real payoff lands with ${leftPlayer.name}.`,
      `${rootFor} would not end the race, but it would leave ${leftPlayer.name} with far more ways to cash in later.`,
    ];
    return options[variantSeed % options.length];
  }

  if (tier !== "small" && rightWinnerUpside >= 2 && leftWinnerUpside === 0) {
    const options = [
      `${winPhrase(rootFor)} keeps both brackets alive for now, but only ${rightPlayer.name} still has real upside attached to it.`,
      `${rightPlayer.name} would get the meaningful upside here. ${leftPlayer.name} stays in it, but without much ceiling from this result.`,
      `Both sides can live with ${rootFor}, yet the real payoff lands with ${rightPlayer.name}.`,
      `${rootFor} would not end the race, but it would leave ${rightPlayer.name} with far more ways to cash in later.`,
    ];
    return options[variantSeed % options.length];
  }

  if (tier !== "small" && hurtTeam === rightChampion) {
    const options = [
      `${rootFor} would be a huge blow because it knocks out ${rightPlayer.name}'s champion path.`,
      `This is bigger than a normal swing game. ${rootFor} would take out ${rightPlayer.name}'s title pick and reshape the matchup.`,
      `${rightPlayer.name} has their champion tied up here, so ${winPhrase(rootFor)} would land hard.`,
      `${rightPlayer.name}'s best path runs straight through ${hurtTeam}, which is why ${winPhrase(rootFor)} would feel so costly.`,
    ];
    return options[variantSeed % options.length];
  }

  if (tier !== "small" && hurtTeam === leftChampion) {
    const options = [
      `${rootFor} would be a huge blow because it knocks out ${leftPlayer.name}'s champion path.`,
      `This is bigger than a normal swing game. ${rootFor} would take out ${leftPlayer.name}'s title pick and reshape the matchup.`,
      `${leftPlayer.name} has their champion tied up here, so ${winPhrase(rootFor)} would land hard.`,
      `${leftPlayer.name}'s best path runs straight through ${hurtTeam}, which is why ${winPhrase(rootFor)} would feel so costly.`,
    ];
    return options[variantSeed % options.length];
  }

  if (pickConflict) {
    const optionsByTier = {
      huge: [
        `${rootFor} is a massive separator here. One bracket gets a real jump, and the other takes a hard hit.`,
        `This is one of the games that could flip the whole matchup. If ${rootFor} comes through, the race takes a sharp turn.`,
        `${rootFor} would create real daylight between these two brackets. This is a major swing spot.`,
        `${rootFor} is the kind of result that can redraw the whole matchup in one shot.`,
      ],
      strong: [
        `${rootFor} is a true separator here. One bracket gets a clean boost, and the other takes the hit.`,
        `This one really matters. If ${rootFor} comes through, the matchup takes a clear turn.`,
        `${rootFor} is the kind of result that can open up noticeable space between these two brackets.`,
        `There is real leverage here. ${rootFor} would push this matchup in a clear direction.`,
      ],
      medium: [
        `${rootFor} gives one side a meaningful edge here, even if it does not decide the whole matchup by itself.`,
        `This is a solid swing game. ${rootFor} would move the race in a noticeable way.`,
        `${rootFor} is not everything, but it is definitely one of the results that can tilt this matchup.`,
        `${rootFor} would not settle it, but it would move this race enough to matter.`,
      ],
      small: [
        `${rootFor} helps, but this is more of a nudge than a knockout punch.`,
        `There is a real edge here for ${rootFor}, just not a dramatic one on its own.`,
        `${rootFor} would move the matchup a little, even if bigger games still loom.`,
        `${rootFor} is a mild plus here rather than a decisive blow.`,
      ],
    };
    const options = optionsByTier[tier];
    return options[variantSeed % options.length];
  }
  if (leftPick && rightPick && leftPick === rightPick) {
    const optionsByTier = {
      huge: [
        `Both brackets agree on the pick, but the downstream consequences are huge. This game still breaks much better for ${leftPlayer.name}.`,
        `Same pick, different consequences. Even without a direct split, this result would swing the matchup hard toward ${leftPlayer.name}.`,
        `There is no disagreement on the winner, but there is a big disagreement in what that win means. ${leftPlayer.name} gets much more out of it.`,
        `They agree on the winner, not on the payoff. ${leftPlayer.name} would gain a lot more from this result.`,
      ],
      strong: [
        `Both brackets agree on this game, but the downstream paths still lean clearly toward ${leftPlayer.name}.`,
        `Same pick, different consequences. This result still lands noticeably better for ${leftPlayer.name}.`,
        `There is no direct split here, yet the ripple effects still favor ${leftPlayer.name} in a real way.`,
        `No argument on the pick, but ${leftPlayer.name} still gets the better version of this result.`,
      ],
      medium: [
        `Both brackets agree here, but the aftermath still tilts toward ${leftPlayer.name}.`,
        `Same pick, slightly different payoff. ${leftPlayer.name} comes out a bit better if this one lands.`,
        `This is not a head-on disagreement, though the result still leans toward ${leftPlayer.name}.`,
        `There is agreement on the surface, but ${leftPlayer.name} still likes the ripple effect a little more.`,
      ],
      small: [
        `Both brackets agree here, and the ripple effect is pretty modest.`,
        `Same pick, only a small difference in payoff.`,
        `There is a slight lean toward ${leftPlayer.name}, but this is not one of the matchup's biggest pivots.`,
        `This one reads pretty similarly for both brackets, with only a small edge to ${leftPlayer.name}.`,
      ],
    };
    const options = optionsByTier[tier];
    return options[variantSeed % options.length];
  }
  if (leftPick && !rightPick) {
    const optionsByTier = {
      huge: [
        `${leftPlayer.name} has a lot more tied up in this game, and the swing is big enough to seriously reshape the race.`,
        `This is very live for ${leftPlayer.name}. The outcome matters a ton more on that side of the matchup.`,
        `${leftPlayer.name} is much more exposed here, which is why this result can move the head-to-head so sharply.`,
        `${leftPlayer.name} is carrying the real risk here, and the swing is large enough to show it.`,
      ],
      strong: [
        `${leftPlayer.name} is the one with real skin in this matchup, so the result matters more to that side of the race.`,
        `${leftPlayer.name} has more tied up in this game, which is why the swing leans that way.`,
        `This is more live for ${leftPlayer.name} than ${rightPlayer.name}, so the outcome carries extra weight on that side.`,
        `${leftPlayer.name} has the more vulnerable position here, so the game carries more weight on that side.`,
      ],
      medium: [
        `${leftPlayer.name} has more invested here, so the game matters a bit more on that side.`,
        `This one sits closer to ${leftPlayer.name}'s path, which is why the edge leans that way.`,
        `${leftPlayer.name} gets a more meaningful bump from this result, even if it is not the whole story.`,
        `${leftPlayer.name} has a little more at risk here, which is why the game is not quite neutral.`,
      ],
      small: [
        `${leftPlayer.name} has a little more riding on this one.`,
        `This game is slightly more relevant to ${leftPlayer.name}'s route.`,
        `${leftPlayer.name} benefits a bit more here, though the swing is fairly modest.`,
        `A small extra lean toward ${leftPlayer.name} is what puts this one on the board.`,
      ],
    };
    const options = optionsByTier[tier];
    return options[variantSeed % options.length];
  }
  if (!leftPick && rightPick) {
    const optionsByTier = {
      huge: [
        `${rightPlayer.name} has a lot more tied up in this game, so the result can swing the matchup hard even without a direct split.`,
        `${rightPlayer.name} is far more exposed here, which is why this outcome carries major weight.`,
        `This one runs straight through ${rightPlayer.name}'s path, and the swing is big enough to really matter.`,
        `${rightPlayer.name} is carrying the real risk here, and the size of the swing reflects it.`,
      ],
      strong: [
        `${rightPlayer.name} has more tied up in this game, which is why the sim nudges the matchup even without a direct split.`,
        `${rightPlayer.name} is more exposed here, so the result still moves the race even without a head-on disagreement.`,
        `This one sits closer to ${rightPlayer.name}'s path, which is why it still shifts the matchup in a noticeable way.`,
        `${rightPlayer.name} has the more fragile position here, so this game carries more weight on that side.`,
      ],
      medium: [
        `${rightPlayer.name} has a bit more at stake here, so the game still moves the race some.`,
        `This result matters more to ${rightPlayer.name}'s route than it does to ${leftPlayer.name}'s.`,
        `Even without a pick split, this one leans toward ${rightPlayer.name}'s side of the bracket tree.`,
        `${rightPlayer.name} has a little more exposure here, which is why the note is not fully neutral.`,
      ],
      small: [
        `${rightPlayer.name} is a little more exposed here, though the overall swing is modest.`,
        `This one matters slightly more to ${rightPlayer.name}, but not by a ton.`,
        `A small lean toward ${rightPlayer.name}'s path is what gives this game its value.`,
        `Only a mild tilt here, and it happens to run a bit more through ${rightPlayer.name}.`,
      ],
    };
    const options = optionsByTier[tier];
    return options[variantSeed % options.length];
  }
  const optionsByTier = {
    huge: [
      `There is no clean split here, but the downstream consequences are big. This result would seriously reshape the matchup.`,
      `More subtle on the surface, but huge underneath. This game changes a lot about how each bracket can still win.`,
      `Even without an obvious rooting war, this is one of the results that could really redraw the race.`,
      `This does not look dramatic at first glance, but the path effects underneath are enormous.`,
    ],
    strong: [
      `Not a loud disagreement, but this result still changes which future paths stay open for both brackets.`,
      `This is more subtle than decisive, but it still reshapes the menu of ways each bracket can win.`,
      `Even without a clean split, this game changes the texture of the matchup from here.`,
      `No fireworks in the pick column, but the downstream leverage here is still real.`,
    ],
    medium: [
      `This one is more about future ripple effects than an immediate jolt.`,
      `Not a headline swing game, but it still nudges the matchup through the paths it keeps alive.`,
      `A quieter spot, though the downstream effects still matter.`,
      `This is more setup than payoff, but the setup still matters.`,
    ],
    small: [
      `This is a relatively small swing game.`,
      `More background noise than turning point here.`,
      `This one matters a little, but it is not one of the matchup's biggest levers.`,
      `Useful context, not a major pivot.`,
    ],
  };
  const options = optionsByTier[tier];
  return options[variantSeed % options.length];
}

function futureMatchupNote({
  kind,
  leftPlayer,
  rightPlayer,
  teamA,
  teamB,
  favoredPlayer,
  favoredTeam,
  favoredTeamLabel,
  opposingTeam,
  opposingTeamLabel,
  leftChampion,
  rightChampion,
  leftUpside,
  rightUpside,
}) {
  const seed = noteVariantIndex(kind, leftPlayer?.name, rightPlayer?.name, teamA, teamB, favoredTeam, opposingTeam);
  if (kind === "direct") {
    if (leftChampion === favoredTeam && rightChampion === opposingTeam) {
      return chooseNote([
        `${teamA} vs ${teamB} would be the cleanest possible showdown: ${leftPlayer.name}'s champion against ${rightPlayer.name}'s champion for everything.`,
        `If this matchup happens, it is basically ${leftPlayer.name}'s title pick versus ${rightPlayer.name}'s title pick for all the marbles.`,
        `${teamA} vs ${teamB} is not just a separator. It is the dream finals setup where both brackets put their champion on the table.`,
        `Goliath versus goliath.`,
        `This would be ${leftPlayer.name}'s champion against ${rightPlayer.name}'s for all the marbles.`,
      ], seed);
    }
    if (rightChampion === favoredTeam && leftChampion === opposingTeam) {
      return chooseNote([
        `${teamA} vs ${teamB} would be the cleanest possible showdown: ${rightPlayer.name}'s champion against ${leftPlayer.name}'s champion for everything.`,
        `If this matchup happens, it is basically ${rightPlayer.name}'s title pick versus ${leftPlayer.name}'s title pick for all the marbles.`,
        `${teamA} vs ${teamB} is not just a separator. It is the dream finals setup where both brackets put their champion on the table.`,
        `Goliath versus goliath.`,
        `This would be ${rightPlayer.name}'s champion against ${leftPlayer.name}'s for all the marbles.`,
      ], seed);
    }
    return chooseNote([
      `If both brackets keep this path alive, ${teamA} vs ${teamB} would become a major separator.`,
      `${teamA} vs ${teamB} is the kind of future matchup that could split these two brackets cleanly.`,
      `If this pairing shows up, it is likely to become one of the sharpest forks in the whole head-to-head.`,
    ], seed);
  }
  if (favoredTeam === leftChampion) {
    return chooseNote([
      `${leftPlayer.name} would care a lot about this one because ${favoredTeamLabel} is still that bracket's champion.`,
      `This future matchup matters because ${leftPlayer.name} still needs ${favoredTeamLabel} alive deep into the tournament.`,
      `If ${favoredTeamLabel} gets here against ${opposingTeamLabel}, ${leftPlayer.name}'s title path is still very much in play.`,
      `${leftPlayer.name} still has the bigger dream attached here, while ${rightPlayer.name} is mostly trying to keep pace.`,
    ], seed);
  }
  if (favoredTeam === rightChampion) {
    return chooseNote([
      `${rightPlayer.name} has more riding on this because ${favoredTeamLabel} is still that bracket's champion.`,
      `This future matchup matters because ${rightPlayer.name} still needs ${favoredTeamLabel} alive deep into the tournament.`,
      `If ${favoredTeamLabel} gets here against ${opposingTeamLabel}, ${rightPlayer.name}'s title path is still very much in play.`,
      `${rightPlayer.name} still has the bigger dream attached here, while ${leftPlayer.name} is mostly trying to keep pace.`,
    ], seed);
  }
  if (leftUpside >= 2 && rightUpside === 0) {
    return chooseNote([
      `${leftPlayer.name} would care more if this matchup appears, because only that bracket still has real upside tied to ${favoredTeamLabel}.`,
      `If ${teamA} vs ${teamB} happens, ${leftPlayer.name} is the side with the real payoff still attached.`,
      `${rightPlayer.name} could survive this matchup, but ${leftPlayer.name} is the one who still has ceiling here through ${favoredTeamLabel}.`,
      `${leftPlayer.name} still has something to win big with here. ${rightPlayer.name} is more in damage-control territory.`,
    ], seed);
  }
  if (rightUpside >= 2 && leftUpside === 0) {
    return chooseNote([
      `${rightPlayer.name} would care more if this matchup appears, because only that bracket still has real upside tied to ${favoredTeamLabel}.`,
      `If ${teamA} vs ${teamB} happens, ${rightPlayer.name} is the side with the real payoff still attached.`,
      `${leftPlayer.name} could survive this matchup, but ${rightPlayer.name} is the one who still has ceiling here through ${favoredTeamLabel}.`,
      `${rightPlayer.name} still has something to win big with here. ${leftPlayer.name} is more in damage-control territory.`,
    ], seed);
  }
  if (kind === "left-path") {
    return chooseNote([
      `${leftPlayer.name} would need ${favoredTeamLabel} to keep moving for this matchup to matter in a meaningful way.`,
      `This is a path ${leftPlayer.name} still has live, especially if ${favoredTeamLabel} gets past ${opposingTeamLabel}.`,
      `${leftPlayer.name} still has enough tied to ${favoredTeamLabel} for ${teamA} vs ${teamB} to be worth tracking.`,
      `${leftPlayer.name} is the bracket with more to gain here, while ${rightPlayer.name} mostly wants to avoid falling behind.`,
    ], seed);
  }
  if (kind === "right-path") {
    return chooseNote([
      `${rightPlayer.name} still has meaningful equity tied to ${favoredTeamLabel}, so this pairing could quietly change the race.`,
      `This is more of a ${rightPlayer.name} path than a ${leftPlayer.name} one if ${favoredTeamLabel} gets here.`,
      `${rightPlayer.name} has more invested in ${favoredTeamLabel} reaching this point, which is why ${teamA} vs ${teamB} matters.`,
      `${rightPlayer.name} is the bracket with more to gain here, while ${leftPlayer.name} mostly wants to avoid falling behind.`,
    ], seed);
  }
  return chooseNote([
    `${favoredPlayer} would care more than anyone if this matchup shows up later.`,
    `If this game ever arrives, it is likely to matter more to ${favoredPlayer} than the rest of the pool.`,
    `${favoredPlayer} is the bracket with more to gain if this pairing becomes real.`,
  ], seed);
}

export default function ReportsHeadToHeadView() {
  const { profile } = useAuth();
  const { pool } = usePool();
  const { PLAYERS, GAMES, LEVERAGE_GAMES, TEAM_ABBREV } = usePoolData();
  const [leftName, setLeftName] = useState("");
  const [rightName, setRightName] = useState("");
  const [futureSort, setFutureSort] = useState("impact");

  useEffect(() => {
    if (!PLAYERS.length) return;

    const defaultLeft = profile?.username && PLAYERS.find((player) => player.name === profile.username)
      ? profile.username
      : PLAYERS[0].name;
    setLeftName((current) => current || defaultLeft);

    const defaultRight = PLAYERS.find((player) => player.name !== defaultLeft)?.name ?? "";
    setRightName((current) => {
      if (current && current !== defaultLeft) return current;
      return defaultRight;
    });
  }, [PLAYERS, profile?.username]);

  const leftPlayer = useMemo(
    () => PLAYERS.find((player) => player.name === leftName) ?? null,
    [PLAYERS, leftName]
  );
  const rightPlayer = useMemo(
    () => PLAYERS.find((player) => player.name === rightName) ?? null,
    [PLAYERS, rightName]
  );

  const baseline = useMemo(() => {
    if (!leftPlayer || !rightPlayer) return null;
    const leftPct = pctWithinMatchup(leftPlayer.winProb ?? 0, rightPlayer.winProb ?? 0);
    return {
      leftPct,
      rightPct: 100 - leftPct,
      edge: (leftPlayer.winProb ?? 0) - (rightPlayer.winProb ?? 0),
    };
  }, [leftPlayer, rightPlayer]);

  const gamesBySlot = useMemo(() => {
    const map = new Map();
    for (const game of GAMES) {
      map.set(game.slot_index ?? game.id, game);
    }
    return map;
  }, [GAMES]);

  const decisiveGames = useMemo(() => {
    if (!leftPlayer || !rightPlayer) return [];

    const leverageLookup = new Map();
    for (const game of LEVERAGE_GAMES ?? []) {
      leverageLookup.set(game.id, game);
    }

    return GAMES
      .filter((game) =>
        game.status !== "final" &&
        !game.winner &&
        game.team1 &&
        game.team2 &&
        game.team1 !== "TBD" &&
        game.team2 !== "TBD"
      )
      .map((currentGame) => {
        const leverageGame = leverageLookup.get(currentGame.slot_index) ?? leverageLookup.get(currentGame.id);
        if (!leverageGame) return null;

        const leftImpact = (leverageGame.playerImpacts ?? []).find((impact) => impact.player === leftPlayer.name);
        const rightImpact = (leverageGame.playerImpacts ?? []).find((impact) => impact.player === rightPlayer.name);
        if (!leftImpact && !rightImpact) return null;

        const slotIndex = currentGame.slot_index ?? currentGame.id;
        const leftIfTeam1 = leftImpact?.ifTeam1 ?? leftPlayer.winProb ?? 0;
        const leftIfTeam2 = leftImpact?.ifTeam2 ?? leftPlayer.winProb ?? 0;
        const rightIfTeam1 = rightImpact?.ifTeam1 ?? rightPlayer.winProb ?? 0;
        const rightIfTeam2 = rightImpact?.ifTeam2 ?? rightPlayer.winProb ?? 0;

        const headToHeadTeam1 = pctWithinMatchup(leftIfTeam1, rightIfTeam1);
        const headToHeadTeam2 = pctWithinMatchup(leftIfTeam2, rightIfTeam2);
        const swing = Math.abs(headToHeadTeam1 - headToHeadTeam2);

        const leftPick = leftPlayer.picks?.[slotIndex] ?? null;
        const rightPick = rightPlayer.picks?.[slotIndex] ?? null;
        const pickConflict = leftPick && rightPick && leftPick !== rightPick;

        const rootFor = headToHeadTeam1 >= headToHeadTeam2 ? currentGame.team1 : currentGame.team2;
        const leftDeltaTeam1 = headToHeadTeam1 - (baseline?.leftPct ?? 50);
        const leftDeltaTeam2 = headToHeadTeam2 - (baseline?.leftPct ?? 50);
        const leftChampion = leftPlayer.picks?.[62] ?? null;
        const rightChampion = rightPlayer.picks?.[62] ?? null;
        const hurtTeam = rootFor === currentGame.team1 ? currentGame.team2 : currentGame.team1;
        let noteKind = "subtle";
        if (hurtTeam === leftChampion || hurtTeam === rightChampion) noteKind = "champion_hit";
        else if (pickConflict) noteKind = "pick_conflict";
        else if (leftPick && rightPick && leftPick === rightPick) noteKind = "same_pick";
        else if (leftPick && !rightPick) noteKind = "left_exposed";
        else if (!leftPick && rightPick) noteKind = "right_exposed";

        return {
          id: slotIndex,
          matchup: `${abbrev(currentGame.team1, TEAM_ABBREV)} vs ${abbrev(currentGame.team2, TEAM_ABBREV)}`,
          status: currentGame.status,
          round: currentGame.round,
          gameNote: currentGame.gameNote ?? currentGame.gameTime ?? null,
          team1: abbrev(currentGame.team1, TEAM_ABBREV),
          team2: abbrev(currentGame.team2, TEAM_ABBREV),
          headToHeadTeam1,
          headToHeadTeam2,
          leftDeltaTeam1,
          leftDeltaTeam2,
          swing,
          leftPick: leftPick ? abbrev(leftPick, TEAM_ABBREV) : null,
          rightPick: rightPick ? abbrev(rightPick, TEAM_ABBREV) : null,
          pickConflict,
          noteKind,
          rootFor: abbrev(rootFor, TEAM_ABBREV),
          note: currentGameNote({
            gameId: slotIndex,
            pickConflict,
            rootFor: abbrev(rootFor, TEAM_ABBREV),
            rootForRaw: rootFor,
            leftPlayer,
            rightPlayer,
            leftPick,
            rightPick,
            leftChampion,
            rightChampion,
            team1: abbrev(currentGame.team1, TEAM_ABBREV),
            team2: abbrev(currentGame.team2, TEAM_ABBREV),
            team1Raw: currentGame.team1,
            team2Raw: currentGame.team2,
            swing,
          }),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.swing !== a.swing) return b.swing - a.swing;
        if (a.pickConflict !== b.pickConflict) return a.pickConflict ? -1 : 1;
        return a.matchup.localeCompare(b.matchup);
      });
  }, [GAMES, LEVERAGE_GAMES, TEAM_ABBREV, baseline, leftPlayer, rightPlayer]);

  const dedupedDecisiveGames = useMemo(
    () => uniqueifyCurrentNotes(decisiveGames, leftPlayer?.name, rightPlayer?.name),
    [decisiveGames, leftPlayer?.name, rightPlayer?.name]
  );

  const futureSwingGames = useMemo(() => {
    if (!leftPlayer || !rightPlayer) return [];

    const memo = new Map();

    return GAMES
      .filter((game) => {
        if (game.status === "final" || game.winner) return false;
        const team1Known = game.team1 && game.team1 !== "TBD";
        const team2Known = game.team2 && game.team2 !== "TBD";
        return !team1Known || !team2Known;
      })
      .map((game) => {
        const slotIndex = game.slot_index ?? game.id;
        const side1 = slotSideCandidates(slotIndex, 0, gamesBySlot, memo);
        const side2 = slotSideCandidates(slotIndex, 1, gamesBySlot, memo);
        const possibleTeams = uniqueTeams([...side1, ...side2]);
        if (!side1.length || !side2.length || possibleTeams.length < 2) return null;

        const leftPick = leftPlayer.picks?.[slotIndex] ?? null;
        const rightPick = rightPlayer.picks?.[slotIndex] ?? null;
        const leftAlive = !!leftPick && possibleTeams.includes(leftPick);
        const rightAlive = !!rightPick && possibleTeams.includes(rightPick);
        const pickConflict = leftAlive && rightAlive && leftPick !== rightPick;

        if (!leftAlive && !rightAlive) return null;

        const importance =
          (ROUND_PRIORITY[game.round] ?? ROUND_PRIORITY[game.roundKey] ?? 0) * 100 +
          (pickConflict ? 30 : 0) +
          (leftAlive ? 10 : 0) +
          (rightAlive ? 10 : 0) +
          possibleTeams.length * -1;
        const likelihoodBase =
          ((side1.length === 1 ? 25 : 0) + (side2.length === 1 ? 25 : 0)) +
          (leftAlive ? 20 : 0) +
          (rightAlive ? 20 : 0) +
          (pickConflict ? 10 : 0) +
          Math.max(0, 20 - (possibleTeams.length - 2) * 4);

        const rows = [];
        const seen = new Set();
        const leftSide = teamSideIndex(leftPick, side1, side2);
        const rightSide = teamSideIndex(rightPick, side1, side2);

        function addMatchupRow(teamA, teamB, focus, kind, bonus = 0, likelihoodBonus = 0) {
          if (!teamA || !teamB || teamA === teamB) return;
          const key = [teamA, teamB].sort().join("|");
          if (seen.has(key)) return;
          seen.add(key);
          const impactScore = importance + bonus;
          const likelihoodScore = likelihoodBase + likelihoodBonus;
          const labelA = abbrev(teamA, TEAM_ABBREV);
          const labelB = abbrev(teamB, TEAM_ABBREV);
          const leftChampion = leftPlayer.picks?.[62] ?? null;
          const rightChampion = rightPlayer.picks?.[62] ?? null;
          const favoredTeam = kind === "right-path" ? teamA : teamA;
          const opposingTeam = teamB;
          const favoredTeamLabel = labelA;
          const opposingTeamLabel = labelB;
          const leftUpside = futureUses(leftPlayer, favoredTeam, slotIndex);
          const rightUpside = futureUses(rightPlayer, favoredTeam, slotIndex);
          rows.push({
            id: `future-${slotIndex}-${key}`,
            round: game.round,
            slotIndex,
            matchup: `${labelA} vs ${labelB}`,
            kind,
            leftPick: leftAlive ? abbrev(leftPick, TEAM_ABBREV) : null,
            rightPick: rightAlive ? abbrev(rightPick, TEAM_ABBREV) : null,
            focus,
            note: futureMatchupNote({
              kind,
              leftPlayer,
              rightPlayer,
              teamA: labelA,
              teamB: labelB,
              favoredPlayer: kind === "right-path" ? rightPlayer.name : leftPlayer.name,
              favoredTeam,
              favoredTeamLabel,
              opposingTeam,
              opposingTeamLabel,
              leftChampion,
              rightChampion,
              leftUpside,
              rightUpside,
            }),
            pickConflict,
            impactScore,
            likelihoodScore,
          });
        }

        if (leftAlive && rightAlive && leftSide != null && rightSide != null && leftSide !== rightSide) {
          addMatchupRow(
            leftPick,
            rightPick,
            "Direct future showdown",
            "direct",
            25,
            20
          );
        }

        if (leftAlive && leftSide != null) {
          const opponents = leftSide === 0 ? side2 : side1;
          opponents.slice(0, 2).forEach((team, index) => {
            addMatchupRow(
              leftPick,
              team,
              `${leftPlayer.name} path`,
              "left-path",
              15 - index,
              10 - index
            );
          });
        }

        if (rightAlive && rightSide != null) {
          const opponents = rightSide === 0 ? side2 : side1;
          opponents.slice(0, 2).forEach((team, index) => {
            addMatchupRow(
              rightPick,
              team,
              `${rightPlayer.name} path`,
              "right-path",
              15 - index,
              10 - index
            );
          });
        }

        return rows;
      })
      .flat()
      .filter(Boolean)
      .sort((a, b) => {
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
        if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
        return a.matchup.localeCompare(b.matchup);
      });
  }, [GAMES, TEAM_ABBREV, gamesBySlot, leftPlayer, rightPlayer]);

  const curatedFutureGames = useMemo(() => {
    const sorted = [...futureSwingGames].sort((a, b) => {
      if (futureSort === "likely") {
        if (b.likelihoodScore !== a.likelihoodScore) return b.likelihoodScore - a.likelihoodScore;
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
      } else {
        if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
        if (b.likelihoodScore !== a.likelihoodScore) return b.likelihoodScore - a.likelihoodScore;
      }
      if (a.slotIndex !== b.slotIndex) return a.slotIndex - b.slotIndex;
      return a.matchup.localeCompare(b.matchup);
    });
    const top = sorted.slice(0, 5).map((game) => ({
      ...game,
      impactLabel: game.impactScore >= 620 ? "High impact" : game.impactScore >= 430 ? "Meaningful" : "Worth watching",
      likelihoodLabel: game.likelihoodScore >= 90 ? "More likely" : game.likelihoodScore >= 65 ? "Plausible" : "Longer shot",
    }));

    return uniqueifyFutureNotes(
      top.map((game) => ({
        ...game,
        note: game.note || fallbackFutureNote(game),
      }))
    );
  }, [futureSort, futureSwingGames]);

  const directConflictCount = dedupedDecisiveGames.filter((game) => game.pickConflict).length;
  const futureConflictCount = curatedFutureGames.filter((game) => game.pickConflict).length;

  if (PLAYERS.length < 2) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-6 text-sm text-slate-400">
          Head-to-head analysis needs at least two entries in the pool.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-orange-300/80">Reports / Head To Head</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">Head To Head</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Compare two entries directly, see who currently holds the edge, and identify the remaining games most likely to decide the matchup.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Bracket A:</span>
            <select
              value={leftName}
              onChange={(event) => {
                const next = event.target.value;
                setLeftName(next);
                if (next === rightName) {
                  const fallback = PLAYERS.find((player) => player.name !== next)?.name ?? "";
                  setRightName(fallback);
                }
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {PLAYERS.map((player) => (
                <option key={player.name} value={player.name}>{player.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Bracket B:</span>
            <select
              value={rightName}
              onChange={(event) => setRightName(event.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {PLAYERS.filter((player) => player.name !== leftName).map((player) => (
                <option key={player.name} value={player.name}>{player.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {leftPlayer && rightPlayer && baseline && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Current matchup edge</div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{leftPlayer.name}</div>
                  <div className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "Space Mono, monospace" }}>
                    {formatPct(baseline.leftPct)}
                  </div>
                </div>
                <div className="text-slate-600">vs</div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{rightPlayer.name}</div>
                  <div className="text-2xl font-bold text-orange-300" style={{ fontFamily: "Space Mono, monospace" }}>
                    {formatPct(baseline.rightPct)}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Relative title odds</div>
              <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                {formatDelta(baseline.edge)}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Current pool title-odds gap between these two entries.
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Direct conflict games</div>
              <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                {directConflictCount}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Remaining leverage spots where the two entries are pulling for different outcomes.
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Future fork matchups</div>
              <div className="mt-3 text-3xl font-bold text-white" style={{ fontFamily: "Space Mono, monospace" }}>
                {futureConflictCount}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Likely future pairings that could become the turning points in this matchup.
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
            <div className="border-b border-slate-800/70 px-5 py-4">
              <div className="text-sm font-bold text-white">Current Round Swing Games</div>
              <div className="mt-1 text-xs text-slate-500">
                Current live and pending games, ranked by how much they swing this matchup. Percentages below are {leftPlayer.name}&apos;s chance to prevail over {rightPlayer.name} if that outcome happens next.
              </div>
            </div>
            {dedupedDecisiveGames.length === 0 && (
              <div className="px-5 py-6 text-sm text-slate-400">
                No current head-to-head swing games are available from the latest simulation output yet.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-3">Game</th>
                    <th className="px-4 py-3">Rooting Edge</th>
                    <th className="px-4 py-3">{leftPlayer.name} if team wins</th>
                    <th className="px-4 py-3">{rightPlayer.name} picks</th>
                    <th className="px-4 py-3">Swing</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {dedupedDecisiveGames.map((game) => (
                    <tr key={game.id} className="border-b border-slate-800/60 last:border-b-0 align-top">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-white">{game.matchup}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {game.status === "live" ? game.gameNote || "Live" : game.round}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-emerald-300">{game.rootFor}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Best immediate outcome for {leftPlayer.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className={outcomeTone(game.leftDeltaTeam1)}>
                          {game.team1}: {formatPct(game.headToHeadTeam1)} ({formatDelta(game.leftDeltaTeam1)})
                        </div>
                        <div className={`mt-1 ${outcomeTone(game.leftDeltaTeam2)}`}>
                          {game.team2}: {formatPct(game.headToHeadTeam2)} ({formatDelta(game.leftDeltaTeam2)})
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>{leftPlayer.name}: <span className="text-white">{game.leftPick ?? "No live pick"}</span></div>
                        <div className="mt-1">{rightPlayer.name}: <span className="text-white">{game.rightPick ?? "No live pick"}</span></div>
                      </td>
                      <td
                        className="px-4 py-3 text-sm font-bold text-orange-300 tabular-nums"
                        style={{ fontFamily: "Space Mono, monospace" }}
                      >
                        {formatPct(game.swing)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {game.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/60">
            <div className="border-b border-slate-800/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Future Swing Matchups</div>
                  <div className="mt-1 text-xs text-slate-500">
                    A curated look ahead. By default, this shows the future pairings most likely to matter most.
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 p-1">
                  {[
                    { value: "impact", label: "Most Impactful" },
                    { value: "likely", label: "Most Likely" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFutureSort(option.value)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        futureSort === option.value
                          ? "bg-orange-500 text-slate-950"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {curatedFutureGames.length === 0 && (
              <div className="px-5 py-6 text-sm text-slate-400">
                No future pairings stand out yet beyond the current live and pending games.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-3">Possible Matchup</th>
                    <th className="px-4 py-3">Bracket Paths</th>
                    <th className="px-4 py-3">Why This One</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {curatedFutureGames.map((game) => (
                    <tr key={game.id} className="border-b border-slate-800/60 last:border-b-0 align-top">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold text-white">{game.matchup}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{game.round}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>
                          {leftPlayer.name}:{" "}
                          <span className={game.leftAlive ? "text-emerald-300" : "text-slate-500"}>
                            {game.leftPick ?? "No surviving path"}
                          </span>
                        </div>
                        <div className="mt-1">
                          {rightPlayer.name}:{" "}
                          <span className={game.rightAlive ? "text-orange-300" : "text-slate-500"}>
                            {game.rightPick ?? "No surviving path"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <div>{game.focus}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-orange-200">
                            {game.impactLabel}
                          </span>
                          <span className="rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-slate-300">
                            {game.likelihoodLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {game.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
