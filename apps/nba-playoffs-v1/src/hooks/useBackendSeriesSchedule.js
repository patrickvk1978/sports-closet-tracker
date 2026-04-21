import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useBackendSeriesSchedule(poolId) {
  const [scheduleBySeriesId, setScheduleBySeriesId] = useState({});

  useEffect(() => {
    let active = true;
    let channel;

    async function load() {
      if (!poolId) {
        setScheduleBySeriesId({});
        return;
      }

      const { data } = await supabase
        .schema("nba_playoffs")
        .from("matchups")
        .select(
          "series_key, status, lock_at, next_game_at, next_game_number, next_home_team_id, next_away_team_id"
        )
        .eq("pool_id", poolId);

      if (!active) return;

      setScheduleBySeriesId(
        Object.fromEntries(
          (data ?? [])
            .filter((row) => row.series_key)
            .map((row) => [
              row.series_key,
              {
                status: row.status ?? "scheduled",
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
        .channel(`nba-matchup-schedule-${poolId}`)
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

  return { scheduleBySeriesId };
}
