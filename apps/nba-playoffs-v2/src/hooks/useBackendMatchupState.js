import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useBackendMatchupState(poolId) {
  const [matchupStateBySeriesId, setMatchupStateBySeriesId] = useState({});

  useEffect(() => {
    let active = true;
    let channel;

    async function load() {
      if (!poolId) {
        setMatchupStateBySeriesId({});
        return;
      }

      const { data } = await supabase.rpc("get_nba_matchups", { p_pool_id: poolId });

      if (!active) return;

      setMatchupStateBySeriesId(
        Object.fromEntries(
          (data ?? [])
            .filter((row) => row.series_key)
            .map((row) => [
              row.series_key,
              {
                status: row.status ?? null,
                homeTeamId: row.home_team_id ?? null,
                awayTeamId: row.away_team_id ?? null,
                winnerTeamId: row.winner_team_id ?? null,
                wins: {
                  home: Number(row.home_wins ?? 0),
                  away: Number(row.away_wins ?? 0),
                },
                lockAt: row.lock_at ?? null,
                nextGameAt: row.next_game_at ?? null,
                nextGameNumber: row.next_game_number ?? null,
                nextHomeTeamId: row.next_home_team_id ?? null,
                nextAwayTeamId: row.next_away_team_id ?? null,
              },
            ])
        )
      );
    }

    load();

    // Apply a Realtime row change directly to local state instead of
    // re-running the full get_nba_matchups RPC every time. The next_* fields
    // come from the RPC's joins and aren't on the matchups row itself, so we
    // preserve whatever was there.
    function applyMatchupDelta(payload) {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      const seriesKey = row?.series_key;
      if (!seriesKey) return;

      setMatchupStateBySeriesId((current) => {
        if (payload.eventType === "DELETE") {
          if (!current[seriesKey]) return current;
          const next = { ...current };
          delete next[seriesKey];
          return next;
        }
        const existing = current[seriesKey] ?? {
          lockAt: null,
          nextGameAt: null,
          nextGameNumber: null,
          nextHomeTeamId: null,
          nextAwayTeamId: null,
        };
        return {
          ...current,
          [seriesKey]: {
            ...existing,
            status: row.status ?? existing.status ?? null,
            homeTeamId: row.home_team_id ?? existing.homeTeamId ?? null,
            awayTeamId: row.away_team_id ?? existing.awayTeamId ?? null,
            winnerTeamId: row.winner_team_id ?? existing.winnerTeamId ?? null,
            wins: {
              home: Number(row.home_wins ?? 0),
              away: Number(row.away_wins ?? 0),
            },
            lockAt: row.lock_at ?? existing.lockAt ?? null,
          },
        };
      });
    }

    if (poolId) {
      channel = supabase
        .channel(`nba-v2-matchups-${poolId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "nba_playoffs", table: "matchups", filter: `pool_id=eq.${poolId}` },
          applyMatchupDelta,
        )
        .subscribe();
    }

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [poolId]);

  return { matchupStateBySeriesId };
}
