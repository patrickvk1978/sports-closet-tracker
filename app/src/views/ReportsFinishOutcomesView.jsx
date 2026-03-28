import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";
import { getPrizePlaceLabel, getPrizePlacesFromPool } from "../lib/finishProbabilities";

function fmtPct(value) {
  return `${(value ?? 0).toFixed(1)}%`;
}

export default function ReportsFinishOutcomesView() {
  const { PLAYERS } = usePoolData();
  const { pool } = usePool();
  const [sortBy, setSortBy] = useState("anyPrizeProb");
  const [sortDir, setSortDir] = useState("desc");
  const prizePlaces = useMemo(() => getPrizePlacesFromPool(pool), [pool]);
  const exactPlaces = useMemo(() => {
    const allPlaces = new Set([1, ...prizePlaces]);
    PLAYERS.forEach((player) => {
      Object.keys(player.finishProbs ?? {}).forEach((place) => allPlaces.add(Number(place)));
    });
    return [...allPlaces].sort((a, b) => a - b);
  }, [PLAYERS, prizePlaces]);

  const sortedPlayers = useMemo(() => {
    const direction = sortDir === "desc" ? -1 : 1;
    return [...PLAYERS].sort((a, b) => {
      let diff = 0;
      if (sortBy === "entry") {
        diff = a.name.localeCompare(b.name);
      } else if (sortBy === "anyPrizeProb") {
        diff = (a.anyPrizeProb ?? 0) - (b.anyPrizeProb ?? 0);
      } else if (sortBy === "noPrizeProb") {
        diff = (a.noPrizeProb ?? 0) - (b.noPrizeProb ?? 0);
      } else if (/^place\d+$/.test(sortBy)) {
        const place = Number(sortBy.replace("place", ""));
        diff = (a.finishProbs?.[place] ?? 0) - (b.finishProbs?.[place] ?? 0);
      }

      if (diff !== 0) return diff * direction;
      return a.name.localeCompare(b.name);
    });
  }, [PLAYERS, sortBy, sortDir]);

  function toggleSort(nextKey) {
    if (sortBy === nextKey) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
      return;
    }
    setSortBy(nextKey);
    setSortDir(nextKey === "entry" ? "asc" : "desc");
  }

  function SortableHeader({ sortKey, label, align = "right" }) {
    const active = sortBy === sortKey;
    const arrow = active ? (sortDir === "desc" ? "▼" : "▲") : "↕";
    return (
      <th
        onClick={() => toggleSort(sortKey)}
        className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"} cursor-pointer select-none hover:text-slate-300 whitespace-nowrap`}
        style={{ fontFamily: "Space Mono, monospace" }}
      >
        <span className="inline-flex items-center gap-1">
          <span>{label}</span>
          <span className={`${active ? "text-orange-400" : "text-slate-700"}`}>{arrow}</span>
        </span>
      </th>
    );
  }

  const hasExtendedFinishData = sortedPlayers.some((player) =>
    exactPlaces.some((place) => place > 1 && Number.isFinite(player.finishProbs?.[place]))
  );

  if (!hasExtendedFinishData) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link to="/reports" className="hover:text-slate-300 transition-colors">Reports</Link>
          <span>/</span>
          <span className="text-slate-300">Finish Outcomes</span>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-6 py-12 text-center">
          <p className="text-slate-300 text-sm mb-1">Finish outcome data is not available yet.</p>
          <p className="text-slate-500 text-xs">
            Once the simulation stores exact place probabilities, this report will show each player&apos;s 1st/2nd/3rd,
            prize, and no-prize odds.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/reports" className="hover:text-slate-300 transition-colors">Reports</Link>
        <span>/</span>
        <span className="text-slate-300">Finish Outcomes</span>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.16),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.28em] text-orange-300/80">Finish distribution</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">Finish Outcomes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Exact finish probabilities for each entry, plus the odds of landing in any paid spot and the odds of missing the prize board entirely.
        </p>
        <div className="mt-3 text-xs text-slate-500">
          {pool?.name ?? "Current pool"} · Prize places: {prizePlaces.join(", ")}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-left text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <SortableHeader sortKey="entry" label="Entry" align="left" />
                <SortableHeader sortKey="anyPrizeProb" label="Any Prize" />
                <SortableHeader sortKey="noPrizeProb" label="No Prize" />
                {exactPlaces.map((place) => (
                  <SortableHeader key={place} sortKey={`place${place}`} label={getPrizePlaceLabel(place)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((player) => (
                <tr key={player.name} className="border-b border-slate-800/50 last:border-b-0 hover:bg-slate-800/20">
                  <td className="px-4 py-3 text-sm font-semibold text-white">{player.name}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-emerald-300 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {fmtPct(player.anyPrizeProb)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-400 tabular-nums" style={{ fontFamily: "Space Mono, monospace" }}>
                    {fmtPct(player.noPrizeProb)}
                  </td>
                  {exactPlaces.map((place) => (
                    <td
                      key={`${player.name}-${place}`}
                      className={`px-4 py-3 text-right text-sm tabular-nums ${
                        prizePlaces.includes(place) ? "text-amber-300 font-semibold" : "text-slate-400"
                      }`}
                      style={{ fontFamily: "Space Mono, monospace" }}
                    >
                      {fmtPct(player.finishProbs?.[place] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
