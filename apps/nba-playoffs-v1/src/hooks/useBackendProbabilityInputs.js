import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function buildDefaultMap(entityIds) {
  return Object.fromEntries(
    (entityIds ?? []).map((entityId) => [
      entityId,
      { market: null, model: null, marketExact: null, modelExact: null },
    ])
  );
}

function normalizeRows(rows, entityIds) {
  const next = buildDefaultMap(entityIds);

  for (const row of rows ?? []) {
    if (!row?.entity_id || !next[row.entity_id]) continue;
    const sourceType = row.source_type === "model" ? "model" : row.source_type === "market" ? "market" : null;
    if (!sourceType) continue;
    const exactKey = sourceType === "market" ? "marketExact" : "modelExact";

    if (row.entity_type === "series_exact_result") {
      if (next[row.entity_id][exactKey]) continue;
      next[row.entity_id][exactKey] = {
        sourceName: row.source_name ?? "unknown_source",
        exactResults: row.probabilities ?? {},
        capturedAt: row.captured_at ?? null,
      };
      continue;
    }

    if (next[row.entity_id][sourceType]) continue;

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

export function useBackendProbabilityInputs({ productKey, entityIds = [], entityType = "series", includeExactResults = false }) {
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
        .select("entity_id, entity_type, source_type, source_name, probabilities, captured_at")
        .eq("product_key", productKey)
        .in("entity_id", stableEntityIds)
        .in("source_type", ["market", "model"])
        .in("entity_type", includeExactResults ? [entityType, `${entityType}_exact_result`] : [entityType])
        .order("captured_at", { ascending: false });

      if (!active) return;
      setProbabilityMap(normalizeRows(data, stableEntityIds));
    }

    fetchProbabilities();

    // Apply Realtime row changes in-place instead of refetching the full slice
    // every time a single row updates. Cuts egress significantly when many
    // series are tracked.
    const acceptedEntityTypes = new Set(
      includeExactResults ? [entityType, `${entityType}_exact_result`] : [entityType]
    );
    function applyProbabilityDelta(payload) {
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      if (!row?.entity_id) return;
      if (!acceptedEntityTypes.has(row.entity_type)) return;
      if (!stableEntityIds.includes(row.entity_id)) return;
      const sourceType = row.source_type === "model" ? "model" : row.source_type === "market" ? "market" : null;
      if (!sourceType) return;
      const isExact = row.entity_type === `${entityType}_exact_result`;
      const targetKey = isExact ? (sourceType === "market" ? "marketExact" : "modelExact") : sourceType;

      setProbabilityMap((current) => {
        const existing = current[row.entity_id] ?? { market: null, model: null, marketExact: null, modelExact: null };
        if (payload.eventType === "DELETE") {
          return {
            ...current,
            [row.entity_id]: { ...existing, [targetKey]: null },
          };
        }
        const nextValue = isExact
          ? {
              sourceName: row.source_name ?? "unknown_source",
              exactResults: row.probabilities ?? {},
              capturedAt: row.captured_at ?? null,
            }
          : {
              sourceName: row.source_name ?? "unknown_source",
              homeWinPct: row.probabilities?.home_win_pct ?? row.probabilities?.homeWinPct ?? 50,
              awayWinPct: row.probabilities?.away_win_pct ?? row.probabilities?.awayWinPct ?? 50,
              capturedAt: row.captured_at ?? null,
            };
        return {
          ...current,
          [row.entity_id]: { ...existing, [targetKey]: nextValue },
        };
      });
    }

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
        applyProbabilityDelta,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelName, entityType, includeExactResults, productKey, stableEntityIds]);

  return { probabilityMap };
}
