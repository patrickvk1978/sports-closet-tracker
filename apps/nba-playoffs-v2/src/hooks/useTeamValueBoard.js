import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { usePool } from "./usePool";
import { supabase } from "../lib/supabase";
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

function sanitizeAssignments(rawAssignments, teamIds) {
  const validTeamIds = new Set(teamIds);
  return Object.fromEntries(
    Object.entries(rawAssignments ?? {}).filter(([teamId, value]) => validTeamIds.has(teamId) && Number.isFinite(Number(value)))
  );
}

function rowsToAssignments(rows) {
  return Object.fromEntries(rows.map((r) => [r.team_id, r.assigned_value]));
}

function buildEmptyAssignmentsByUser(memberList) {
  return Object.fromEntries((memberList ?? []).map((member) => [member.id, {}]));
}

export function useTeamValueBoard(teamEntries) {
  const { pool, memberList } = usePool();
  const { session } = useAuth();
  const [assignmentsByUser, setAssignmentsByUser] = useState({});
  const [persistenceMode, setPersistenceMode] = useState("local");
  const channelRef = useRef(null);

  const teamIds = useMemo(() => teamEntries.map((team) => team.id), [teamEntries]);
  const teamKey = useMemo(() => teamIds.join("|"), [teamIds]);
  const currentUserId = session?.user?.id ?? null;

  async function persistAssignments(nextAssignments, options = {}) {
    const targetUserId = options.targetUserId ?? currentUserId;
    const shouldCacheLocally = targetUserId === currentUserId;
    const forceSupabase = Boolean(options.forceSupabase);

    if (!pool?.id || !targetUserId || (!forceSupabase && persistenceMode !== "supabase")) {
      if (shouldCacheLocally) {
        writeLocalBoard(pool?.id, nextAssignments);
      }
      return;
    }

    if (shouldCacheLocally) {
      writeLocalBoard(pool.id, nextAssignments);
    }

    const rows = Object.entries(nextAssignments).map(([teamId, value]) => ({
      team_id: teamId,
      assigned_value: Number(value),
      updated_at: new Date().toISOString(),
    }));

    await supabase.rpc("upsert_nba_team_values", {
      p_pool_id: pool.id,
      p_user_id: targetUserId,
      p_rows: rows,
    });
  }

  useEffect(() => {
    if (!pool?.id || !memberList.length || !teamEntries.length) {
      setAssignmentsByUser({});
      return;
    }

    let cancelled = false;

    async function loadBoard() {
      const { data, error } = await supabase.rpc("get_nba_team_values", { p_pool_id: pool.id });

      if (cancelled) return;

      if (error) {
        // Stay truthful when the DB read fails. Only recover the current user's
        // real browser-saved board; do not fabricate seeded boards for the room.
        const storedCurrent = sanitizeAssignments(readLocalBoard(pool.id), teamIds);
        const nextByUser = buildEmptyAssignmentsByUser(memberList);
        if (currentUserId && validateTeamValueAssignments(storedCurrent, teamIds).valid) {
          nextByUser[currentUserId] = storedCurrent;
        }
        setAssignmentsByUser(nextByUser);
        setPersistenceMode("local");
        return;
      }

      // Group DB rows by user
      const byUser = {};
      for (const row of data ?? []) {
        byUser[row.user_id] ??= {};
        byUser[row.user_id][row.team_id] = row.assigned_value;
      }

      // For each member: use real DB assignments when present.
      // Do not seed missing boards; an absent board should remain absent.
      const nextByUser = Object.fromEntries(
        memberList.map((member) => {
          const raw = byUser[member.id];
          if (raw) {
            const sanitized = sanitizeAssignments(raw, teamIds);
            if (validateTeamValueAssignments(sanitized, teamIds).valid) {
              return [member.id, sanitized];
            }
          }
          return [member.id, {}];
        })
      );

      // Rescue the current user's real board from local storage if the DB still has
      // no persisted team_values for them. This lets existing users recover simply by
      // opening the board after the new public RPC bridge is live.
      if (currentUserId) {
        const dbCurrent = byUser[currentUserId];
        const sanitizedDbCurrent = sanitizeAssignments(dbCurrent, teamIds);
        const localCurrent = sanitizeAssignments(readLocalBoard(pool.id), teamIds);
        const localIsValid = validateTeamValueAssignments(localCurrent, teamIds).valid;
        const dbIsValid = validateTeamValueAssignments(sanitizedDbCurrent, teamIds).valid;

        if (!dbIsValid && localIsValid) {
          nextByUser[currentUserId] = localCurrent;
          void persistAssignments(localCurrent, { targetUserId: currentUserId, forceSupabase: true });
        }
      }

      setAssignmentsByUser(nextByUser);
      setPersistenceMode("supabase");

      // Cache current user's board locally
      if (currentUserId && nextByUser[currentUserId]) {
        writeLocalBoard(pool.id, nextByUser[currentUserId]);
      }
    }

    loadBoard();

    // Realtime subscription — reload on any change in this pool
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    channelRef.current = supabase
      .channel(`nba-team-values-${pool.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "nba_playoffs", table: "team_values", filter: `pool_id=eq.${pool.id}` },
        () => { if (!cancelled) loadBoard(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
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

  function saveAssignment(teamId, value, options = {}) {
    const targetUserId = options.targetUserId ?? currentUserId;
    if (!pool?.id || !targetUserId) return;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setAssignmentsByUser((current) => {
      const currentAssignmentsForUser = { ...(current[targetUserId] ?? {}) };
      const existingTeamId = Object.entries(currentAssignmentsForUser).find(([, assigned]) => Number(assigned) === nextValue)?.[0];

      if (existingTeamId && existingTeamId !== teamId) {
        currentAssignmentsForUser[existingTeamId] = currentAssignmentsForUser[teamId];
      }

      currentAssignmentsForUser[teamId] = nextValue;
      persistAssignments(currentAssignmentsForUser, { targetUserId });

      return {
        ...current,
        [targetUserId]: currentAssignmentsForUser,
      };
    });
  }

  function saveBoardOrder(orderedTeamIds, options = {}) {
    const targetUserId = options.targetUserId ?? currentUserId;
    if (!pool?.id || !targetUserId || !Array.isArray(orderedTeamIds) || !orderedTeamIds.length) return;

    setAssignmentsByUser((current) => {
      const nextAssignments = Object.fromEntries(
        orderedTeamIds.map((teamId, index) => [teamId, TEAM_VALUE_SLOTS[index] ?? 0])
      );
      persistAssignments(nextAssignments, { targetUserId });

      return {
        ...current,
        [targetUserId]: nextAssignments,
      };
    });
  }

  return {
    boardRows,
    currentAssignments,
    allAssignmentsByUser: assignmentsByUser,
    boardValidation,
    persistenceMode,
    completionCount: Object.keys(currentAssignments).length,
    saveAssignment,
    saveBoardOrder,
  };
}
