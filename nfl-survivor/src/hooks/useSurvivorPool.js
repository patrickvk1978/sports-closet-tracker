import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { usePool } from "./usePool";
import {
  SURVIVOR_CURRENT_WEEK,
  SURVIVOR_DEFAULT_HISTORY,
  SURVIVOR_MEMBER_TEMPLATES,
  SURVIVOR_SEASON,
  SURVIVOR_WEEKLY_SLATE,
  findGameById,
  findGameByTeam,
} from "../data/survivorData";
import { buildSurvivorReports } from "../lib/survivorReports";

function makeStorageKey(poolId, userId) {
  return `nfl_survivor_local_state:${poolId}:${userId}`;
}

function formatMemberName(member, index) {
  if (member?.name) return member.name;
  return `Member ${index + 1}`;
}

function getInitialState() {
  return {
    usedTeams: SURVIVOR_DEFAULT_HISTORY.usedTeams,
    priorWeeks: SURVIVOR_DEFAULT_HISTORY.priorWeeks,
    currentPick: null,
    currentGameId: null,
    updatedAt: null,
  };
}

function buildCurrentUserEntry(member, state) {
  const currentGame = state.currentGameId ? findGameById(state.currentGameId) : findGameByTeam(state.currentPick);
  const currentTeam = state.currentPick ?? null;
  const currentWinPct = currentGame && currentTeam ? currentGame.marketWinPct[currentTeam] ?? null : null;

  return {
    id: member.id,
    name: member.name || "You",
    isCurrentUser: true,
    status: currentTeam ? "pending" : "alive",
    currentPick: currentTeam,
    currentGameId: currentGame?.id ?? null,
    currentWinPct,
    usedTeams: state.usedTeams,
    priorWeeks: state.priorWeeks,
    lastSafeWeek: state.priorWeeks.at(-1)?.week ?? 0,
    updatedAt: state.updatedAt,
  };
}

function buildSeededEntry(member, index) {
  const template = SURVIVOR_MEMBER_TEMPLATES[index % SURVIVOR_MEMBER_TEMPLATES.length];
  const currentGame = template.currentGameId ? findGameById(template.currentGameId) : findGameByTeam(template.currentPick);

  return {
    id: member.id,
    name: member.name,
    isCurrentUser: false,
    status: template.status,
    currentPick: template.currentPick,
    currentGameId: template.currentGameId,
    currentWinPct: currentGame && template.currentPick ? currentGame.marketWinPct[template.currentPick] ?? null : null,
    usedTeams: template.usedTeams,
    priorWeeks: template.priorWeeks,
    lastSafeWeek: template.eliminatedWeek ?? template.priorWeeks.at(-1)?.week ?? 0,
    eliminatedWeek: template.eliminatedWeek ?? null,
    updatedAt: null,
  };
}

function compareEntries(a, b) {
  const statusRank = { pending: 0, alive: 1, eliminated: 2 };
  const aRank = statusRank[a.status] ?? 9;
  const bRank = statusRank[b.status] ?? 9;
  if (aRank !== bRank) return aRank - bRank;
  const aWin = a.currentWinPct ?? -1;
  const bWin = b.currentWinPct ?? -1;
  if (aWin !== bWin) return bWin - aWin;
  const aUsed = a.usedTeams.length;
  const bUsed = b.usedTeams.length;
  if (aUsed !== bUsed) return aUsed - bUsed;
  return a.name.localeCompare(b.name);
}

export function useSurvivorPool() {
  const { profile, session } = useAuth();
  const { pool, memberList } = usePool();
  const [localState, setLocalState] = useState(getInitialState);
  const [saveState, setSaveState] = useState("ready");

  const storageKey = pool?.id && session?.user?.id ? makeStorageKey(pool.id, session.user.id) : null;

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setLocalState(getInitialState());
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setLocalState(getInitialState());
        return;
      }

      const parsed = JSON.parse(raw);
      setLocalState({
        ...getInitialState(),
        ...parsed,
        usedTeams: Array.isArray(parsed.usedTeams) ? parsed.usedTeams : SURVIVOR_DEFAULT_HISTORY.usedTeams,
        priorWeeks: Array.isArray(parsed.priorWeeks) ? parsed.priorWeeks : SURVIVOR_DEFAULT_HISTORY.priorWeeks,
      });
    } catch {
      setLocalState(getInitialState());
    }
  }, [storageKey]);

  function persist(nextState) {
    setLocalState(nextState);
    setSaveState("saved");
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(nextState));
  }

  function setWeeklyPick(gameId, teamCode) {
    const nextUsedTeams = Array.from(
      new Set([
        ...SURVIVOR_DEFAULT_HISTORY.usedTeams,
        ...localState.priorWeeks.map((week) => week.pick),
      ])
    );

    const nextState = {
      ...localState,
      usedTeams: nextUsedTeams,
      currentPick: teamCode,
      currentGameId: gameId,
      updatedAt: new Date().toISOString(),
    };

    persist(nextState);
  }

  function clearWeeklyPick() {
    const nextState = {
      ...localState,
      currentPick: null,
      currentGameId: null,
      updatedAt: new Date().toISOString(),
    };

    persist(nextState);
  }

  const defaultMember = useMemo(() => ({
    id: session?.user?.id ?? "current-user",
    name: profile?.username ?? profile?.display_name ?? "You",
  }), [profile?.display_name, profile?.username, session?.user?.id]);

  const localMembers = useMemo(() => {
    const room = memberList.length ? memberList : [defaultMember];
    return room.map((member, index) => ({
      id: member.id ?? `member-${index}`,
      name: formatMemberName(member, index),
      isCurrentUser: Boolean(member.isCurrentUser || member.id === session?.user?.id),
    }));
  }, [defaultMember, memberList, session?.user?.id]);

  const standings = useMemo(() => {
    const rows = localMembers.map((member, index) => {
      if (member.isCurrentUser) return buildCurrentUserEntry(member, localState);
      return buildSeededEntry(member, index);
    });

    const sorted = [...rows].sort(compareEntries);
    let lastRank = 0;

    return sorted.map((row, index) => {
      const sameAsPrev =
        index > 0 &&
        compareEntries(row, sorted[index - 1]) === 0;
      const place = sameAsPrev ? lastRank : index + 1;
      lastRank = place;
      return { ...row, place };
    });
  }, [localMembers, localState]);

  const currentEntry = standings.find((row) => row.isCurrentUser) ?? buildCurrentUserEntry(defaultMember, localState);
  const currentPickGame = currentEntry.currentGameId ? findGameById(currentEntry.currentGameId) : null;

  const board = useMemo(() => {
    const usedTeams = new Set(currentEntry.usedTeams);
    return SURVIVOR_WEEKLY_SLATE.map((game) => {
      const teams = [game.awayTeam, game.homeTeam].map((team) => ({
        ...team,
        isUsed: usedTeams.has(team.code),
        isSelected: currentEntry.currentPick === team.code,
        marketWinPct: game.marketWinPct[team.code],
        modelWinPct: game.modelWinPct[team.code],
        publicPickPct: game.publicPickPct[team.code],
      }));

      return {
        ...game,
        teams,
        isLocked: false,
      };
    });
  }, [currentEntry.currentPick, currentEntry.usedTeams]);

  const pickSummary = useMemo(() => {
    if (!currentPickGame || !currentEntry.currentPick) {
      return {
        headline: "Your Week 4 pick is still open.",
        detail: "Use the board to choose one team. Any team you have already used stays off the table.",
        urgency: "Pick before the first kickoff next Sunday.",
      };
    }

    const selectedTeam =
      currentPickGame.homeTeam.code === currentEntry.currentPick
        ? currentPickGame.homeTeam
        : currentPickGame.awayTeam;

    return {
      headline: `You are riding with ${selectedTeam.name} in Week ${SURVIVOR_CURRENT_WEEK}.`,
      detail: `${selectedTeam.shortName} carry a ${currentPickGame.marketWinPct[currentEntry.currentPick]}% market win chance, with the model at ${currentPickGame.modelWinPct[currentEntry.currentPick]}%.`,
      urgency: `This pick stays editable until ${new Date(currentPickGame.kickoff).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
    };
  }, [currentEntry.currentPick, currentPickGame]);

  const summary = useMemo(() => {
    const pendingCount = standings.filter((row) => row.status === "pending").length;
    const eliminatedCount = standings.filter((row) => row.status === "eliminated").length;
    const aliveCount = standings.length - eliminatedCount;
    const favoriteOption = [...board]
      .flatMap((game) => game.teams.map((team) => ({ gameId: game.id, game, ...team })))
      .filter((team) => !team.isUsed)
      .sort((a, b) => (b.marketWinPct - a.marketWinPct) || (b.modelWinPct - a.modelWinPct))[0] ?? null;

    return {
      aliveCount,
      pendingCount,
      eliminatedCount,
      favoriteOption,
    };
  }, [board, standings]);

  const reports = useMemo(
    () => buildSurvivorReports({ board, standings, currentEntry }),
    [board, standings, currentEntry]
  );

  return {
    season: SURVIVOR_SEASON,
    currentWeek: SURVIVOR_CURRENT_WEEK,
    board,
    standings,
    currentEntry,
    currentPickGame,
    pickSummary,
    summary,
    reports,
    saveState,
    setWeeklyPick,
    clearWeeklyPick,
  };
}
