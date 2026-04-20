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

      const { data } = await supabase
        .schema("nba_playoffs")
        .from("matchups")
        .select(
          "series_key, status, home_team_id, away_team_id, winner_team_id, home_wins, away_wins, lock_at, next_game_at, next_game_number, next_home_team_id, next_away_team_id"
        )
        .eq("pool_id", poolId);

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

    if (poolId) {
      channel = supabase
        .channel(`nba-v2-matchups-${poolId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "nba_playoffs", table: "matchups", filter: `pool_id=eq.${poolId}` },
          () => load()
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
