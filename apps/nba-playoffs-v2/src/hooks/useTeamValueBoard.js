import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { usePool } from "./usePool";
import { TEAM_VALUE_SLOTS, validateTeamValueAssignments } from "../lib/teamValueGame";

function storageKey(poolId) {
  return `nba_team_value_board_${poolId ?? "default"}`;
}

function writeLocalBoard(poolId, assignments) {
  if (typeof window === "undefined" || !poolId) return;
  window.localStorage.setItem(storageKey(poolId), JSON.stringify(assignments));
}

function readLocalBoard(poolId) {
  if (typeof window === "undefined" || !poolId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(poolId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hashString(value) {
  return String(value ?? "").split("").reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function buildBaseTeamOrder(teamEntries) {
  return [...teamEntries].sort((a, b) => {
    const aStrength = (a.marketLean ?? 50) + (9 - (a.seed ?? 8));
    const bStrength = (b.marketLean ?? 50) + (9 - (b.seed ?? 8));
    return bStrength - aStrength || a.seed - b.seed || a.city.localeCompare(b.city);
  });
}

function buildSeededAssignments(teamEntries, seedOffset = 0) {
  const ordered = buildBaseTeamOrder(teamEntries);
  const slots = [...TEAM_VALUE_SLOTS];
  const rotated = slots.map((_, index) => slots[(index + seedOffset) % slots.length]);
  return Object.fromEntries(ordered.map((team, index) => [team.id, rotated[index]]));
}

function sanitizeAssignments(rawAssignments, teamIds) {
  const validTeamIds = new Set(teamIds);
  return Object.fromEntries(
    Object.entries(rawAssignments ?? {}).filter(([teamId, value]) => validTeamIds.has(teamId) && Number.isFinite(Number(value)))
  );
}

export function useTeamValueBoard(teamEntries) {
  const { pool, memberList } = usePool();
  const { session } = useAuth();
  const [assignmentsByUser, setAssignmentsByUser] = useState({});

  const teamIds = useMemo(() => teamEntries.map((team) => team.id), [teamEntries]);
  const teamKey = useMemo(() => teamIds.join("|"), [teamIds]);
  const currentUserId = session?.user?.id ?? null;

  useEffect(() => {
    if (!pool?.id || !memberList.length || !teamEntries.length) {
      setAssignmentsByUser({});
      return;
    }

    const storedCurrent = sanitizeAssignments(readLocalBoard(pool.id), teamIds);
    const seededCurrent =
      validateTeamValueAssignments(storedCurrent, teamIds).valid
        ? storedCurrent
        : buildSeededAssignments(teamEntries, 0);

    const seededByUser = Object.fromEntries(
      memberList.map((member, index) => {
        if (member.id === currentUserId) {
          return [member.id, seededCurrent];
        }

        const seedOffset = (hashString(member.id) + index) % TEAM_VALUE_SLOTS.length;
        return [member.id, buildSeededAssignments(teamEntries, seedOffset)];
      })
    );

    setAssignmentsByUser(seededByUser);
    writeLocalBoard(pool.id, seededCurrent);
  }, [currentUserId, memberList, pool?.id, teamEntries, teamIds, teamKey]);

  const currentAssignments = currentUserId ? assignmentsByUser[currentUserId] ?? {} : {};

  const boardValidation = useMemo(
    () => validateTeamValueAssignments(currentAssignments, teamIds),
    [currentAssignments, teamIds]
  );

  const boardRows = useMemo(
    () =>
      buildBaseTeamOrder(teamEntries).map((team) => ({
        ...team,
        assignedValue: Number(currentAssignments[team.id] ?? 0),
      })),
    [currentAssignments, teamEntries]
  );

  function saveAssignment(teamId, value) {
    if (!pool?.id || !currentUserId) return;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setAssignmentsByUser((current) => {
      const currentAssignmentsForUser = { ...(current[currentUserId] ?? {}) };
      const existingTeamId = Object.entries(currentAssignmentsForUser).find(([, assigned]) => Number(assigned) === nextValue)?.[0];

      if (existingTeamId && existingTeamId !== teamId) {
        currentAssignmentsForUser[existingTeamId] = currentAssignmentsForUser[teamId];
      }

      currentAssignmentsForUser[teamId] = nextValue;
      writeLocalBoard(pool.id, currentAssignmentsForUser);

      return {
        ...current,
        [currentUserId]: currentAssignmentsForUser,
      };
    });
  }

  function saveBoardOrder(orderedTeamIds) {
    if (!pool?.id || !currentUserId || !Array.isArray(orderedTeamIds) || !orderedTeamIds.length) return;

    setAssignmentsByUser((current) => {
      const nextAssignments = Object.fromEntries(
        orderedTeamIds.map((teamId, index) => [teamId, TEAM_VALUE_SLOTS[index] ?? 0])
      );
      writeLocalBoard(pool.id, nextAssignments);

      return {
        ...current,
        [currentUserId]: nextAssignments,
      };
    });
  }

  return {
    boardRows,
    currentAssignments,
    allAssignmentsByUser: assignmentsByUser,
    boardValidation,
    completionCount: Object.keys(currentAssignments).length,
    saveAssignment,
    saveBoardOrder,
  };
}
