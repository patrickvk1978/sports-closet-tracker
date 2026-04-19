import { useEffect, useMemo, useState } from "react";
import { usePool } from "./usePool";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

const PREVIEW_MEMBER_PREFIX = "preview-";

function isMissingSeriesPicksTable(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return error?.code === "PGRST205" || error?.status === 404 || message.includes("nba_series_picks");
}

function storageKey(poolId) {
  return `nba_series_pickem_${poolId ?? "default"}`;
}

function allPicksStorageKey(poolId) {
  return `nba_series_pickem_all_${poolId ?? "default"}`;
}

function isSeriesResolvedForPicking(seriesItem) {
  if (!seriesItem?.homeTeam || !seriesItem?.awayTeam) return false;
  return seriesItem.homeTeam.abbreviation !== "TBD" && seriesItem.awayTeam.abbreviation !== "TBD";
}

function writeLocalPicks(poolId, picks) {
  if (typeof window === "undefined" || !poolId) return;
  window.localStorage.setItem(storageKey(poolId), JSON.stringify(picks));
}

function writeLocalAllPicks(poolId, allPicksByUser) {
  if (typeof window === "undefined" || !poolId) return;
  window.localStorage.setItem(allPicksStorageKey(poolId), JSON.stringify(allPicksByUser));
}

function readLocalPicks(poolId, series) {
  if (typeof window === "undefined" || !poolId) return {};
  const raw = window.localStorage.getItem(storageKey(poolId));
  if (!raw) return {};
  try {
    return sanitizePicksForSeries(JSON.parse(raw), series);
  } catch {
    return {};
  }
}

function readLocalAllPicks(poolId, series) {
  if (typeof window === "undefined" || !poolId) return {};
  const raw = window.localStorage.getItem(allPicksStorageKey(poolId));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([userId, picks]) => [userId, sanitizePicksForSeries(picks, series)])
    );
  } catch {
    return {};
  }
}

function sanitizePicksForSeries(rawPicksBySeriesId, series) {
  if (!rawPicksBySeriesId || typeof rawPicksBySeriesId !== "object") return {};
  const seriesById = Object.fromEntries(series.map((seriesItem) => [seriesItem.id, seriesItem]));
  const validTeamIdsBySeries = Object.fromEntries(
    series.map((seriesItem) => [seriesItem.id, new Set([seriesItem.homeTeam?.id, seriesItem.awayTeam?.id])])
  );

  return Object.fromEntries(
    Object.entries(rawPicksBySeriesId).filter(([seriesId, pick]) => {
      if (!pick?.winnerTeamId) return false;
      if (!isSeriesResolvedForPicking(seriesById[seriesId])) return false;
      const validTeamIds = validTeamIdsBySeries[seriesId];
      return Boolean(validTeamIds?.has(pick.winnerTeamId));
    })
  );
}

function hashString(value) {
  return String(value ?? "").split("").reduce((hash, character) => hash + character.charCodeAt(0), 0);
}

function seedPreviewPick(seriesItem, memberId) {
  const seed = hashString(`${memberId}-${seriesItem.id}`);
  const leanToHome = (seriesItem.market?.homeWinPct ?? 50) >= 50;
  const upsetFactor = seed % 9 === 0;
  const winnerTeamId = upsetFactor
    ? (leanToHome ? seriesItem.awayTeam.id : seriesItem.homeTeam.id)
    : (leanToHome ? seriesItem.homeTeam.id : seriesItem.awayTeam.id);
  const gamesOptions = [5, 6, 7, 4];
  const games = gamesOptions[seed % gamesOptions.length];

  return {
    winnerTeamId,
    games,
    roundKey: seriesItem.roundKey,
    updatedAt: new Date("2026-04-13T09:00:00Z").toISOString(),
  };
}

function addPreviewPicks(allPicksByUser, memberList, series, currentUserId) {
  const nextAll = { ...allPicksByUser };
  memberList
    .filter((member) => member.id.startsWith(PREVIEW_MEMBER_PREFIX))
    .forEach((member) => {
      if (nextAll[member.id]) return;
      nextAll[member.id] = Object.fromEntries(
        series
          .filter((seriesItem) => seriesItem.roundKey === "round_1")
          .map((seriesItem) => [seriesItem.id, seedPreviewPick(seriesItem, member.id)])
      );
    });

  if (currentUserId && !nextAll[currentUserId]) {
    nextAll[currentUserId] = {};
  }

  return nextAll;
}

export function useSeriesPickem(series) {
  const { pool, memberList } = usePool();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? "";
  const initialCachedPicks = useMemo(
    () => readLocalPicks(pool?.id, series),
    [pool?.id, series]
  );
  const initialCachedAllPicks = useMemo(
    () => readLocalAllPicks(pool?.id, series),
    [pool?.id, series]
  );
  const initialAllPicks = useMemo(
    () => addPreviewPicks(
      {
        ...initialCachedAllPicks,
        ...(currentUserId ? { [currentUserId]: initialCachedPicks } : {}),
      },
      memberList,
      series,
      currentUserId
    ),
    [currentUserId, initialCachedAllPicks, initialCachedPicks, memberList, series]
  );
  const [picksBySeriesId, setPicksBySeriesId] = useState(initialCachedPicks);
  const [allPicksByUser, setAllPicksByUser] = useState(initialAllPicks);
  const [loading, setLoading] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState("local");
  const [saveState, setSaveState] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    setPicksBySeriesId(initialCachedPicks);
    setAllPicksByUser(initialAllPicks);
  }, [initialAllPicks, initialCachedPicks]);

  useEffect(() => {
    if (!pool?.id || !session?.user?.id) {
      setPicksBySeriesId({});
      setAllPicksByUser({});
      return;
    }

    let cancelled = false;

    async function loadPicks() {
      setLoading(true);
      const cached = readLocalPicks(pool.id, series);
      const cachedAll = readLocalAllPicks(pool.id, series);
      if (Object.keys(cached).length > 0) {
        setPicksBySeriesId(cached);
        setAllPicksByUser((current) => {
          const merged = {
            ...cachedAll,
            ...current,
            ...(session.user.id ? { [session.user.id]: cached } : {}),
          };
          return addPreviewPicks(merged, memberList, series, session.user.id);
        });
      }
      const { data, error } = await supabase
        .from("nba_series_picks")
        .select("user_id, series_id, winner_team_id, predicted_games, round_key, updated_at")
        .eq("pool_id", pool.id);

      if (cancelled) return;

      if (error) {
        const fallback = cached;
        const latestSavedAt = Object.values(fallback).reduce((latest, pick) => {
          if (!pick?.updatedAt) return latest;
          return !latest || pick.updatedAt > latest ? pick.updatedAt : latest;
        }, null);
        setPicksBySeriesId(fallback);
        setAllPicksByUser((current) => {
          const merged = {
            ...cachedAll,
            ...current,
            ...(session.user.id ? { [session.user.id]: fallback } : {}),
          };
          return addPreviewPicks(merged, memberList, series, session.user.id);
        });
        setPersistenceMode("local");
        setSaveState("idle");
        setLastSavedAt(latestSavedAt);
        setLoading(false);
        return !isMissingSeriesPicksTable(error);
      }

      const nextAll = {};
      data.forEach((row) => {
        nextAll[row.user_id] ??= {};
        nextAll[row.user_id][row.series_id] = {
          winnerTeamId: row.winner_team_id,
          games: row.predicted_games,
          roundKey: row.round_key,
          updatedAt: row.updated_at,
        };
      });
      const sanitizedAll = Object.fromEntries(
        Object.entries(nextAll).map(([userId, userPicks]) => [userId, sanitizePicksForSeries(userPicks, series)])
      );

      const nextAllWithPreview = addPreviewPicks(sanitizedAll, memberList, series, session.user.id);
      setAllPicksByUser(nextAllWithPreview);
      setPicksBySeriesId(nextAllWithPreview[session.user.id] ?? {});
      writeLocalPicks(pool.id, nextAllWithPreview[session.user.id] ?? {});
      writeLocalAllPicks(pool.id, nextAllWithPreview);
      setPersistenceMode("supabase");
      setSaveState("idle");
      setLoading(false);
      return true;
    }

    let channel = null;

    (async () => {
      const shouldSubscribe = await loadPicks();
      if (cancelled || !shouldSubscribe) return;

      channel = supabase
        .channel(`nba-series-picks-${pool.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "nba_series_picks", filter: `pool_id=eq.${pool.id}` },
          () => loadPicks()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [memberList, pool?.id, series, session?.user?.id]);

  const pickedSeriesCount = useMemo(
    () => series.filter((item) => isSeriesResolvedForPicking(item) && picksBySeriesId[item.id]?.winnerTeamId).length,
    [series, picksBySeriesId]
  );

  async function saveSeriesPick(seriesId, winnerTeamId, games, roundKey, options = {}) {
    const targetUserId = options.targetUserId ?? session?.user?.id ?? "";
    if (!targetUserId) return;
    const nextPick = {
      winnerTeamId,
      games,
      roundKey,
      updatedAt: new Date().toISOString(),
    };
    setSaveState("saving");

    if (targetUserId === session?.user?.id) {
      setPicksBySeriesId((current) => {
        const next = {
          ...current,
          [seriesId]: nextPick,
        };
        if (pool?.id) {
          writeLocalPicks(pool.id, next);
        }
        return next;
      });
    }

    setAllPicksByUser((current) => {
      const next = {
        ...current,
        [targetUserId]: {
          ...(current[targetUserId] ?? {}),
          [seriesId]: nextPick,
        },
      };
      if (pool?.id) {
        writeLocalAllPicks(pool.id, next);
      }
      return next;
    });

    if (persistenceMode !== "supabase" || !pool?.id || !targetUserId) {
      setLastSavedAt(nextPick.updatedAt);
      setSaveState("saved");
      return;
    }

    const { error } = await supabase.from("nba_series_picks").upsert({
      pool_id: pool.id,
      user_id: targetUserId,
      series_id: seriesId,
      round_key: roundKey,
      winner_team_id: winnerTeamId,
      predicted_games: games,
      updated_at: nextPick.updatedAt,
    }, { onConflict: "pool_id,user_id,series_id" });

    if (error) {
      setSaveState("error");
      return;
    }

    setLastSavedAt(nextPick.updatedAt);
    setSaveState("saved");
  }

  async function clearSeriesPick(seriesId, options = {}) {
    const targetUserId = options.targetUserId ?? session?.user?.id ?? "";
    if (!targetUserId) return;
    const updatedAt = new Date().toISOString();
    setSaveState("saving");
    if (targetUserId === session?.user?.id) {
      setPicksBySeriesId((current) => {
        const next = { ...current };
        delete next[seriesId];
        if (pool?.id) {
          writeLocalPicks(pool.id, next);
        }
        return next;
      });
    }

    setAllPicksByUser((current) => {
      const next = { ...current };
      const userPicks = { ...(next[targetUserId] ?? {}) };
      delete userPicks[seriesId];
      next[targetUserId] = userPicks;
      if (pool?.id) {
        writeLocalAllPicks(pool.id, next);
      }
      return next;
    });

    if (persistenceMode !== "supabase" || !pool?.id || !targetUserId) {
      setLastSavedAt(updatedAt);
      setSaveState("saved");
      return;
    }

    const { error } = await supabase
      .from("nba_series_picks")
      .delete()
      .eq("pool_id", pool.id)
      .eq("user_id", targetUserId)
      .eq("series_id", seriesId);

    if (error) {
      setSaveState("error");
      return;
    }

    setLastSavedAt(updatedAt);
    setSaveState("saved");
  }

  return {
    picksBySeriesId,
    allPicksByUser,
    pickedSeriesCount,
    loading,
    persistenceMode,
    saveState,
    lastSavedAt,
    saveSeriesPick,
    clearSeriesPick,
  };
}
