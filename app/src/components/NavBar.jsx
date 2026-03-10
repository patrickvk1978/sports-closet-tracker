import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

const NAV_LINKS = [
  { to: "/",       label: "Dashboard" },
  { to: "/matrix", label: "Matrix"    },
];

export default function NavBar() {
  const { profile, signOut } = useAuth();
  const { pool, brackets } = usePool();

  const userBracket = profile && brackets
    ? brackets.find((b) => b.user_id === profile.id)
    : null;

  return (
    <div className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-sm shrink-0"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            SC
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white leading-none truncate">
              Sports Closet Tournament Tracker
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {pool ? pool.name : "Final Four in progress"}
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Nav tabs */}
          <nav className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-slate-700 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}

            {/* Bracket nav: "Create Bracket" → /submit when no bracket; "Bracket" → /bracket when bracket exists */}
            {pool && !userBracket && (
              <NavLink
                to="/submit"
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-orange-600/40 text-orange-300 shadow"
                      : "text-orange-400/70 hover:text-orange-300"
                  }`
                }
              >
                Create Bracket
              </NavLink>
            )}
            {pool && userBracket && (
              <NavLink
                to="/bracket"
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-slate-700 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`
                }
              >
                Bracket
              </NavLink>
            )}

            {/* Admin link — only visible to admins */}
            {profile?.is_admin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-cyan-600/30 text-cyan-300 shadow"
                      : "text-cyan-500/60 hover:text-cyan-300"
                  }`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>

          {/* Auth widget */}
          {profile && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:block max-w-[96px] truncate">
                {profile.username}
              </span>
              <button
                onClick={signOut}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
