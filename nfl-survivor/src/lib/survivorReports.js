function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function futureValuePenalty(usedTeamsCount, marketWinPct) {
  const seasonScarcity = Math.max(0, 18 - usedTeamsCount) / 18;
  return Math.round((marketWinPct - 50) * seasonScarcity * 0.32);
}

function buildVoicePack({ isPreLock, currentEntry, bestPicks, strategy }) {
  const topPick = bestPicks[0] ?? null;
  const secondPick = bestPicks[1] ?? null;

  if (isPreLock) {
    return {
      coach: {
        voice: "coach",
        headline: currentEntry.currentPick
          ? `Coach's call: ${currentEntry.currentPick} is playable, but do not stop the meeting there.`
          : "Coach's call: make the board beat you before you spend a premium team.",
        body: currentEntry.currentPick
          ? `The question is not whether ${currentEntry.currentPick} can win. It is whether they are the right chip to cash in this week. If ${topPick?.code && topPick.code !== currentEntry.currentPick ? `${topPick.code} gives you similar safety with a cleaner long-term board, take that seriously.` : "Compare your current ticket against the board one more time before lock."}`
          : topPick
            ? `${topPick.code} are the cleanest blend of weekly safety and survivable future cost right now. Start there, then decide how much nerve you actually want to spend.`
            : "No team has separated yet, which usually means patience is still a strategy.",
      },
      playByPlay: {
        voice: "play_by_play",
        headline: "The clock has not started yet, but the week is already moving.",
        body: topPick
          ? `${topPick.code} are sitting on top of the board, ${secondPick ? `with ${secondPick.code} right behind them, ` : ""}and every choice now changes what your October Sundays will look like.`
          : "This is the quiet before the sweat. Once kickoff hits, the whole board changes shape fast.",
      },
      color: {
        voice: "color",
        headline: currentEntry.currentPick
          ? `You did not save all those good teams just to panic on a Tuesday.`
          : "Survivor pools are built on one beautiful lie: that this week is the only week that matters.",
        body: currentEntry.currentPick
          ? `If you are going to spend ${currentEntry.currentPick}, spend them on purpose. No sleepy clicks.`
          : topPick
            ? `${topPick.code} may be the adult answer. The fun answer is usually the one that gets people voted off the island.`
            : "Everybody wants to be clever until the obvious favorite loses by three in the late window.",
      },
    };
  }

  return {
    coach: {
      voice: "coach",
      headline: "Coach's call: the picks are in, so now discipline turns into sweat management.",
      body: strategy.chalkTeam
        ? `${strategy.chalkTeam} are carrying the room, which means your job is simple now: know where the chalk is and decide whether you need it to hold or crack.`
        : "Once the room locks, stop second-guessing your own card and start managing outcomes.",
    },
    playByPlay: {
      voice: "play_by_play",
      headline: "The board is live, and one upset can change the whole room in a quarter.",
      body: strategy.leverageTeam
        ? `${strategy.leverageTeam} are the leverage game right now. If that window flips, this pool is going to sound different by dinner.`
        : "The sweat board is open. Every score now has consequences outside your own screen.",
    },
    color: {
      voice: "color",
      headline: "Now we get to find out who was brave and who was just bored.",
      body: strategy.chalkTeam
        ? `If ${strategy.chalkTeam} go down, there will be a lot of fake wisdom after the fact.`
        : "There is nothing quite like watching a perfectly reasonable Survivor pick become comedy in real time.",
    },
  };
}

export function buildSurvivorReports({ board, standings, currentEntry }) {
  const isPreLock = board.some((game) => !game.isLocked);
  const activeOpponents = standings.filter((row) => !row.isCurrentUser && row.status !== "eliminated");
  const liveOpponents = standings.filter((row) => row.status === "pending");

  const candidateTeams = board
    .flatMap((game) =>
      game.teams.map((team) => ({
        ...team,
        gameId: game.id,
        kickoff: game.kickoff,
        networkWindow: game.networkWindow,
      }))
    )
    .filter((team) => !team.isUsed);

  const teamExposure = new Map();
  const teamAvailability = new Map();

  activeOpponents.forEach((opponent) => {
    const used = new Set(opponent.usedTeams);
    candidateTeams.forEach((team) => {
      if (!used.has(team.code)) {
        teamAvailability.set(team.code, (teamAvailability.get(team.code) ?? 0) + 1);
      }
    });

    if (opponent.currentPick) {
      teamExposure.set(opponent.currentPick, (teamExposure.get(opponent.currentPick) ?? 0) + 1);
    }
  });

  const bestPicks = candidateTeams
    .map((team) => {
      const exposureCount = teamExposure.get(team.code) ?? 0;
      const exposurePct = activeOpponents.length ? Math.round((exposureCount / activeOpponents.length) * 100) : 0;
      const availabilityCount = teamAvailability.get(team.code) ?? 0;
      const availabilityPct = activeOpponents.length ? Math.round((availabilityCount / activeOpponents.length) * 100) : 0;
      const futurePenalty = futureValuePenalty(currentEntry.usedTeams.length, team.marketWinPct);
      const evScore = Math.round(
        team.marketWinPct * 0.52 +
          team.modelWinPct * 0.28 +
          (100 - exposurePct) * 0.12 +
          (100 - availabilityPct) * 0.08 -
          futurePenalty
      );

      return {
        ...team,
        exposurePct,
        availabilityPct,
        futurePenalty,
        evScore,
      };
    })
    .sort((a, b) => b.evScore - a.evScore || b.marketWinPct - a.marketWinPct)
    .slice(0, 5);

  const preLockRootingGuide = bestPicks
    .slice(0, 4)
    .map((team) => ({
      team: team.code,
      headline: `${team.code} are a real spend, not a casual click.`,
      detail:
        team.availabilityPct >= 60
          ? `${team.availabilityPct}% of the live room can still reach ${team.code} later, so cashing them in now reshapes the future board for almost everyone.`
          : `${team.code} are already starting to thin out later on, which makes them a cleaner one-week spend when you want safety without torching a truly rare chip.`,
    }));

  const postLockRootingGuide = liveOpponents
    .map((opponent) => {
      const opponentGame = board.find((game) => game.id === opponent.currentGameId) ?? null;
      const opponentTeam =
        opponentGame?.teams.find((team) => team.code === opponent.currentPick) ?? null;
      if (!opponentGame || !opponentTeam) return null;

      const otherTeam = opponentGame.teams.find((team) => team.code !== opponent.currentPick) ?? null;
      const nextAvailability = activeOpponents.filter((row) => {
        const used = new Set(row.usedTeams);
        return otherTeam && !used.has(otherTeam.code);
      }).length;

      return {
        opponent: opponent.name,
        opponentPick: opponent.currentPick,
        opponentPickWinPct: opponentTeam.marketWinPct,
        fadeTeam: otherTeam?.code ?? "—",
        fadeReason:
          otherTeam
            ? `${otherTeam.code} winning would wipe out ${opponent.name} and still stay available to ${nextAvailability} opponents later.`
            : "Track the opposite side of this game if you need the room trimmed.",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.opponentPickWinPct - b.opponentPickWinPct)
    .slice(0, 4);

  const chalkTeam = [...candidateTeams].sort((a, b) => (teamExposure.get(b.code) ?? 0) - (teamExposure.get(a.code) ?? 0))[0] ?? null;
  const leverageTeam = bestPicks.find((team) => team.exposurePct <= 10) ?? bestPicks[0] ?? null;

  const poolExposure = candidateTeams
    .map((team) => ({
      code: team.code,
      exposurePct: activeOpponents.length ? Math.round(((teamExposure.get(team.code) ?? 0) / activeOpponents.length) * 100) : 0,
      availablePct: activeOpponents.length ? Math.round(((teamAvailability.get(team.code) ?? 0) / activeOpponents.length) * 100) : 0,
    }))
    .sort((a, b) => b.exposurePct - a.exposurePct)
    .slice(0, 5);

  const roomAverageWinPct = average(
    standings
      .filter((row) => row.status === "pending")
      .map((row) => row.currentWinPct ?? 0)
      .filter(Boolean)
  );

  const surviveThisWeekOdds = currentEntry.currentPick
    ? board.flatMap((game) => game.teams).find((team) => team.code === currentEntry.currentPick)?.marketWinPct ?? null
    : null;

  const commentary = isPreLock
    ? {
        mode: "decision_support",
        headline: currentEntry.currentPick
          ? `${currentEntry.currentPick} may be good enough, but “good enough” is not always how Survivor pools are won.`
          : "You are still in the decision window, which means you still control the week.",
        body: currentEntry.currentPick
          ? "Before lock, the job is to weigh weekly safety against future board value without peeking at the room. Hidden picks stay hidden. Your edge comes from spending the right team at the right time."
          : "This is the cleanest Survivor moment: no sweat yet, just judgment. Use market strength, model confidence, and future board pressure to decide where to spend your next bullet.",
      }
    : {
        mode: "room_intelligence",
        headline: "The room is locked. Now the real sweat starts.",
        body: "Once picks lock, reports can finally open the curtain on chalk, leverage, and the exact games that can gut the pool in one window.",
      };

  const voices = buildVoicePack({
    isPreLock,
    currentEntry,
    bestPicks,
    strategy: {
      chalkTeam: isPreLock ? null : chalkTeam?.code ?? null,
      leverageTeam: isPreLock ? null : leverageTeam?.code ?? null,
    },
  });

  return {
    phase: isPreLock ? "pre_lock" : "post_lock",
    overview: {
      headline: isPreLock
        ? currentEntry.currentPick
          ? `${currentEntry.currentPick} is your current ticket, but the real question is whether they are the right team to burn this week.`
          : "You still have room to choose between weekly safety, future value, and a little selective nerve."
        : currentEntry.currentPick
          ? `${currentEntry.currentPick} is live, and now the room around you finally matters.`
          : "The picks are locked and the sweat board is officially live.",
      detail: isPreLock
        ? currentEntry.currentPick
          ? "Use reports to decide whether to stay put or pivot to a cleaner weekly ticket, without leaking anything about where the rest of the room landed."
          : "The best Survivor decisions are not just about who is favored. They are about who wins often enough, what that pick costs you later, and whether the board is quietly begging you to stay patient."
        : "With the room locked, reports stop being quiet advice and start being real pool intelligence.",
    },
    commentary,
    voices,
    bestPicks,
    rootingGuide: isPreLock ? preLockRootingGuide : postLockRootingGuide,
    poolExposure: isPreLock ? [] : poolExposure,
    strategy: {
      chalkTeam: isPreLock ? null : chalkTeam?.code ?? null,
      leverageTeam: isPreLock ? null : leverageTeam?.code ?? null,
      surviveThisWeekOdds,
      roomAverageWinPct: isPreLock ? null : roomAverageWinPct ? Math.round(roomAverageWinPct) : null,
    },
  };
}
