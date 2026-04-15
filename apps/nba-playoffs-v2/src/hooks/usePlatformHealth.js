import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePlatformHealth() {
  const [status, setStatus] = useState({
    loading: true,
    envConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
    nbaPoolsCount: 0,
    nbaSeriesPicksTable: "unknown",
    probabilityInputsTable: "unknown",
    probabilityInputsRows: 0,
    simulationOutputsTable: "unknown",
    simulationOutputsRows: 0,
    message: "Checking platform health…",
  });

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const [
          { count: nbaPoolsCount, error: poolsError },
          { error: picksError },
          { data: probabilityRows, error: probabilityError, count: probabilityCount },
          { data: simulationRows, error: simulationError, count: simulationCount },
        ] = await Promise.all([
          supabase
            .from("pools")
            .select("id", { head: true, count: "exact" })
            .eq("game_type", "nba_playoffs")
            .limit(1),
          supabase
            .from("nba_series_picks")
            .select("series_id", { head: true, count: "exact" })
            .limit(1),
          supabase
            .from("probability_inputs")
            .select("entity_id", { count: "exact" })
            .eq("product_key", "nba_playoffs")
            .eq("entity_type", "series")
            .limit(1),
          supabase
            .from("simulation_outputs")
            .select("id", { head: true, count: "exact" })
            .eq("product_key", "nba_playoffs")
            .limit(1),
        ]);

        if (cancelled) return;

        const nextStatus = {
          loading: false,
          envConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY),
          nbaPoolsCount: poolsError ? 0 : (nbaPoolsCount ?? 0),
          nbaSeriesPicksTable: picksError ? "missing" : "ready",
          probabilityInputsTable: probabilityError ? "missing" : "ready",
          probabilityInputsRows: probabilityCount ?? probabilityRows?.length ?? 0,
          simulationOutputsTable: simulationError ? "missing" : "ready",
          simulationOutputsRows: simulationCount ?? simulationRows?.length ?? 0,
        };

        if (picksError) {
          setStatus({
            ...nextStatus,
            message: "Shared probability inputs are available, but the legacy series picks table is not.",
          });
          return;
        }

        if (probabilityError) {
          setStatus({
            ...nextStatus,
            message: "Series pick persistence is available, but shared probability inputs are not readable yet.",
          });
          return;
        }

        setStatus({
          ...nextStatus,
          message: `Shared NBA probabilities are live (${nextStatus.probabilityInputsRows} rows). NBA pools visible in this project: ${nextStatus.nbaPoolsCount}.`,
        });
      } catch {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          loading: false,
          nbaSeriesPicksTable: "unreachable",
          probabilityInputsTable: "unreachable",
          simulationOutputsTable: "unreachable",
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
