import { useEffect, useMemo, useState } from "react";
import { usePool } from "./usePool";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

function storageKey(poolId) {
  return `nba_series_pickem_${poolId ?? "default"}`;
}

function writeLocalPicks(poolId, picks) {
  if (typeof window === "undefined" || !poolId) return;
  window.localStorage.setItem(storageKey(poolId), JSON.stringify(picks));
}

export function useSeriesPickem(series) {
  const { pool } = usePool();
  const { session } = useAuth();
  const [picksBySeriesId, setPicksBySeriesId] = useState({});
  const [allPicksByUser, setAllPicksByUser] = useState({});
  const [loading, setLoading] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState("local");
  const [saveState, setSaveState] = useState("idle");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    if (!pool?.id || !session?.user?.id) {
      setPicksBySeriesId({});
      setAllPicksByUser({});
      return;
    }

    let cancelled = false;

    async function loadPicks() {
      setLoading(true);
      const { data, error } = await supabase
        .from("nba_series_picks")
        .select("user_id, series_id, winner_team_id, predicted_games, round_key, updated_at")
        .eq("pool_id", pool.id);

      if (cancelled) return;

      if (error) {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(pool.id)) : null;
        const fallback = raw ? JSON.parse(raw) : {};
        const latestSavedAt = Object.values(fallback).reduce((latest, pick) => {
          if (!pick?.updatedAt) return latest;
          return !latest || pick.updatedAt > latest ? pick.updatedAt : latest;
        }, null);
        setPicksBySeriesId(fallback);
        setAllPicksByUser(session.user.id ? { [session.user.id]: fallback } : {});
        setPersistenceMode("local");
        setSaveState("idle");
        setLastSavedAt(latestSavedAt);
        setLoading(false);
        return;
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

      setAllPicksByUser(nextAll);
      setPicksBySeriesId(nextAll[session.user.id] ?? {});
      setPersistenceMode("supabase");
      setSaveState("idle");
      setLoading(false);
    }

    loadPicks();

    const channel = supabase
      .channel(`nba-series-picks-${pool.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nba_series_picks", filter: `pool_id=eq.${pool.id}` },
        () => loadPicks()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [pool?.id, session?.user?.id]);

  const pickedSeriesCount = useMemo(
    () => series.filter((item) => picksBySeriesId[item.id]?.winnerTeamId).length,
    [series, picksBySeriesId]
  );

  async function saveSeriesPick(seriesId, winnerTeamId, games, roundKey) {
    const nextPick = {
      winnerTeamId,
      games,
      roundKey,
      updatedAt: new Date().toISOString(),
    };
    setSaveState("saving");

    setPicksBySeriesId((current) => {
      const next = {
        ...current,
        [seriesId]: nextPick,
      };
      if (persistenceMode !== "supabase" && pool?.id) {
        writeLocalPicks(pool.id, next);
      }
      return next;
    });

    if (session?.user?.id) {
      setAllPicksByUser((current) => ({
        ...current,
        [session.user.id]: {
          ...(current[session.user.id] ?? {}),
          [seriesId]: nextPick,
        },
      }));
    }

    if (persistenceMode !== "supabase" || !pool?.id || !session?.user?.id) {
      setLastSavedAt(nextPick.updatedAt);
      setSaveState("saved");
      return;
    }

    const { error } = await supabase.from("nba_series_picks").upsert({
      pool_id: pool.id,
      user_id: session.user.id,
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

  async function clearSeriesPick(seriesId) {
    const updatedAt = new Date().toISOString();
    setSaveState("saving");
    setPicksBySeriesId((current) => {
      const next = { ...current };
      delete next[seriesId];
      if (persistenceMode !== "supabase" && pool?.id) {
        writeLocalPicks(pool.id, next);
      }
      return next;
    });

    if (session?.user?.id) {
      setAllPicksByUser((current) => {
        const next = { ...current };
        const userPicks = { ...(next[session.user.id] ?? {}) };
        delete userPicks[seriesId];
        next[session.user.id] = userPicks;
        return next;
      });
    }

    if (persistenceMode !== "supabase" || !pool?.id || !session?.user?.id) {
      setLastSavedAt(updatedAt);
      setSaveState("saved");
      return;
    }

    const { error } = await supabase
      .from("nba_series_picks")
      .delete()
      .eq("pool_id", pool.id)
      .eq("user_id", session.user.id)
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
