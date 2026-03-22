import { Link } from "react-router-dom";
import { usePoolData } from "../hooks/usePoolData";
import { usePool } from "../hooks/usePool";

// Add new reports here as they're built out
const REPORT_CARDS = [
  {
    to: "/reports/rooting",
    title: "Whom To Root For",
    eyebrow: "Personal rooting guide",
    description: "See every surviving team through the lens of one bracket's title chances.",
  },
  {
    to: "/reports/head-to-head",
    title: "Head To Head",
    eyebrow: "Bracket showdown",
    description: "Compare two entries directly, see who is favored, and isolate the games that decide it.",
  },
];

function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div
        className="mt-3 text-3xl font-bold text-white tabular-nums"
        style={{ fontFamily: "Space Mono, monospace" }}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-slate-400">{hint}</div>
    </div>
  );
}

export default function ReportsHomeView() {
  const { PLAYERS, GAMES, LEVERAGE_GAMES } = usePoolData();
  const { pool } = usePool();

  const liveGames = GAMES.filter((game) => game.status === "live").length;
  const pendingGames = GAMES.filter((game) => game.status === "pending").length;
  const topWinProb = PLAYERS.reduce((best, player) => Math.max(best, player.winProb ?? 0), 0);
  const swingGames = LEVERAGE_GAMES?.length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.96))] px-6 py-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-orange-300/80">Reports</div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Pool intelligence, organized.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Use this space for deeper slices of the pool beyond the main dashboard. Each report can focus on one question instead of trying to do everything at once.
        </p>
        <div className="mt-4 text-xs text-slate-500">
          {pool?.name ?? "Current pool"} · {PLAYERS.length} entries
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Live Games" value={liveGames} hint="Games currently in motion" />
        <StatCard label="Pending Games" value={pendingGames} hint="Still left to decide" />
        <StatCard label="Top Win %" value={`${topWinProb.toFixed(1)}%`} hint="Current favorite in the pool" />
        <StatCard label="Swing Spots" value={swingGames} hint="Tracked leverage matchups" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {REPORT_CARDS.map((report) => (
          <Link
            key={report.to}
            to={report.to}
            className="group rounded-3xl border border-slate-800/70 bg-slate-900/60 px-5 py-5 transition-all hover:border-orange-500/40 hover:bg-slate-900"
          >
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{report.eyebrow}</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">{report.title}</h2>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-300 transition-colors group-hover:border-orange-500/40 group-hover:text-orange-300">
                Open
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">{report.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
