import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

const NAV_LINKS = [
  { to: "/",       label: "Dashboard" },
  { to: "/matrix", label: "Matrix"    },
];

function PoolSwitcher({ pool, allPools, switchPool }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 0 pools
  if (!allPools.length) {
    return (
      <button
        onClick={() => navigate("/join")}
        className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
      >
        Join or Create a Pool
      </button>
    );
  }

  // 1 pool — plain text, no dropdown
  if (allPools.length === 1) {
    return (
      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
        {pool ? pool.name : allPools[0].name}
      </p>
    );
  }

  // 2+ pools — dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-sm text-slate-300 flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
      >
        <span className="text-[11px] text-slate-400 truncate max-w-[160px]">
          {pool ? pool.name : "Select a pool"}
        </span>
        {/* Chevron down */}
        <svg
          className={`w-3 h-3 text-slate-500 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 min-w-48 py-1">
          {allPools.map(p => (
            <button
              key={p.id}
              onClick={() => {
                switchPool(p.id);
                setOpen(false);
              }}
              className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="truncate">{p.name}</span>
              {pool?.id === p.id && (
                <svg
                  className="w-4 h-4 text-orange-500 shrink-0 ml-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}

          {/* Divider */}
          <div className="border-t border-slate-700 my-1" />

          <button
            onClick={() => { navigate("/join"); setOpen(false); }}
            className="w-full px-4 py-2 text-sm text-orange-400 hover:bg-slate-700 text-left transition-colors"
          >
            Join a Pool
          </button>
          <button
            onClick={() => { navigate("/create-pool"); setOpen(false); }}
            className="w-full px-4 py-2 text-sm text-orange-400 hover:bg-slate-700 text-left transition-colors"
          >
            Create a Pool
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const { profile, signOut } = useAuth();
  const { pool, allPools, brackets, switchPool } = usePool();

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
            <PoolSwitcher
              pool={pool}
              allPools={allPools}
              switchPool={switchPool}
            />
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
