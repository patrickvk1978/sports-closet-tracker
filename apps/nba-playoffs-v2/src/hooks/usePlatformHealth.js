import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePlatformHealth() {
  const [status, setStatus] = useState({
    loading: true,
    envConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
    nbaSeriesPicksTable: "unknown",
    message: "Checking platform health…",
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const { error } = await supabase
          .from("nba_series_picks")
          .select("series_id", { head: true, count: "exact" })
          .limit(1);

        if (cancelled) return;

        if (error) {
          setStatus((current) => ({
            ...current,
            loading: false,
            nbaSeriesPicksTable: "missing",
            message: "The nba_series_picks table is not available yet.",
          }));
          return;
        }

        setStatus((current) => ({
          ...current,
          loading: false,
          nbaSeriesPicksTable: "ready",
          message: "NBA series pick persistence is available.",
        }));
      } catch {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          nbaSeriesPicksTable: "unreachable",
          message: "Could not verify Supabase from this client session.",
        }));
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
