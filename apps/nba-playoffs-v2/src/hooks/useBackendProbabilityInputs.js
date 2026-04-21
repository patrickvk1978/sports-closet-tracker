import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function buildDefaultMap(entityIds) {
  return Object.fromEntries((entityIds ?? []).map((entityId) => [entityId, { market: null, model: null }]));
}

function normalizeRows(rows, entityIds) {
  const next = buildDefaultMap(entityIds);

  for (const row of rows ?? []) {
    if (!row?.entity_id || !next[row.entity_id]) continue;
    const sourceType = row.source_type === "model" ? "model" : row.source_type === "market" ? "market" : null;
    if (!sourceType || next[row.entity_id][sourceType]) continue;

    next[row.entity_id][sourceType] = {
      sourceName: row.source_name ?? "unknown_source",
      homeWinPct: row.probabilities?.home_win_pct ?? row.probabilities?.homeWinPct ?? 50,
      awayWinPct: row.probabilities?.away_win_pct ?? row.probabilities?.awayWinPct ?? 50,
      capturedAt: row.captured_at ?? null,
    };
  }

  return next;
}

function buildChannelName(productKey, entityType, entityIds) {
  const signature = (entityIds ?? []).join("|");
  const hash = signature.split("").reduce((total, char, index) => total + char.charCodeAt(0) * (index + 1), 0);
  return `probability-inputs-${productKey}-${entityType}-${hash}`;
}

export function useBackendProbabilityInputs({ productKey, entityIds = [], entityType = "series" }) {
  const stableEntityIds = useMemo(
    () => Array.from(new Set((entityIds ?? []).filter(Boolean))).sort(),
    [entityIds]
  );
  const channelName = useMemo(
    () => buildChannelName(productKey, entityType, stableEntityIds),
    [entityType, productKey, stableEntityIds]
  );
  const [probabilityMap, setProbabilityMap] = useState(() => buildDefaultMap(stableEntityIds));

  useEffect(() => {
    if (!productKey || !stableEntityIds.length) {
      setProbabilityMap(buildDefaultMap(stableEntityIds));
      return;
    }

    let active = true;

    async function fetchProbabilities() {
      const { data } = await supabase
        .from("probability_inputs")
        .select("entity_id, source_type, source_name, probabilities, captured_at")
        .eq("product_key", productKey)
        .eq("entity_type", entityType)
        .in("entity_id", stableEntityIds)
        .in("source_type", ["market", "model"])
        .order("captured_at", { ascending: false });

      if (!active) return;
      setProbabilityMap(normalizeRows(data, stableEntityIds));
    }

    fetchProbabilities();

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "probability_inputs",
          filter: `product_key=eq.${productKey}`,
        },
        () => fetchProbabilities()
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelName, entityType, productKey, stableEntityIds]);

  return { probabilityMap };
}
