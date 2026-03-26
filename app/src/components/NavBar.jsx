import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

const NAV_LINKS = [
  { to: "/",        label: "Dashboard", mobileHidden: true },
  { to: "/matrix",  label: "Picks"     },
];

// Trophy icon for pool context
function PoolIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5h2.75a.75.75 0 010 1.5h-.544l-.553 3.322A3.751 3.751 0 0115 11.5a.75.75 0 01-1.5 0 2.25 2.25 0 00-2.006-2.236l-.244 1.465A2.5 2.5 0 0110 15.25a2.5 2.5 0 01-1.25-4.721l-.244-1.465A2.25 2.25 0 006.5 11.5a.75.75 0 01-1.5 0 3.751 3.751 0 012.597-3.428L7.044 4.75H6.5a.75.75 0 010-1.5h2.75V1.75A.75.75 0 0110 1z" clipRule="evenodd" />
    </svg>
  );
}

function PoolSwitcher({ pool, allPools, switchPool, isLoading }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const ref = useRef(null);

  function copyInvite(e, p) {
    e.stopPropagation();
    const url = `${window.location.origin}/join?code=${p.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
        <PoolIcon />
        <span className="text-xs text-slate-500">Loading…</span>
      </div>
    );
  }

  // No pools
  if (!allPools.length) {
    return (
      <button
        onClick={() => navigate("/join")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-orange-500/50 hover:bg-slate-800 transition-all"
      >
        <PoolIcon />
        <span className="text-xs text-orange-400 hover:text-orange-300">Join or Create a Pool</span>
      </button>
    );
  }

  // Single pool — static badge (no dropdown)
  if (allPools.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
        <PoolIcon />
        <span className="text-xs font-medium text-slate-200 max-w-[140px] truncate hidden sm:block">
          {pool ? pool.name : allPools[0].name}
        </span>
      </div>
    );
  }

  // 2+ pools — dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
          open
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-slate-800/60 border-slate-700/50 hover:border-orange-500/40 hover:bg-slate-800 text-slate-200"
        }`}
      >
        <PoolIcon />
        <span className="text-xs font-medium max-w-[140px] truncate hidden sm:block">
          {pool ? pool.name : "Select a pool"}
        </span>
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
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
        <div className="absolute top-full mt-1 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 min-w-52 py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Your Pools
          </div>
          {allPools.map(p => (
            <div key={p.id} className="flex items-center gap-1 hover:bg-slate-700 transition-colors">
              <button
                onClick={() => { switchPool(p.id); setOpen(false); }}
                className="flex-1 px-3 py-2 text-sm text-slate-300 hover:text-white flex items-center gap-2 text-left min-w-0"
              >
                <span className="truncate">{p.name}</span>
                {pool?.id === p.id && (
                  <svg className="w-4 h-4 text-orange-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              {/* Copy invite link for this pool */}
              <button
                onClick={(e) => copyInvite(e, p)}
                className="shrink-0 px-2 py-2 text-slate-500 hover:text-orange-400 transition-colors"
                title="Copy invite link"
              >
                {copiedId === p.id ? (
                  <span className="text-[10px] text-orange-400 font-medium">Copied!</span>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                  </svg>
                )}
              </button>
            </div>
          ))}

          <div className="border-t border-slate-700 my-1" />

          <button
            onClick={() => { navigate("/join"); setOpen(false); }}
            className="w-full px-3 py-2 text-sm text-orange-400 hover:bg-slate-700 text-left transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Join a Pool
          </button>
          <button
            onClick={() => { navigate("/create-pool"); setOpen(false); }}
            className="w-full px-3 py-2 text-sm text-orange-400 hover:bg-slate-700 text-left transition-colors flex items-center gap-2"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M1 2.75A.75.75 0 011.75 2h10.5a.75.75 0 010 1.5H12v13.75a.75.75 0 01-.75.75h-1.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 00-.75-.75h-2.5a.75.75 0 00-.75.75v2.5a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h.25V3.5H1.75A.75.75 0 011 2.75zM4 3.5v13h1v-2.5A2.25 2.25 0 017.25 11.5h2.5A2.25 2.25 0 0112 13.75v2.5h1V3.5H4zm2 3.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 016 6.75zm0 3a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5A.75.75 0 016 9.75z" clipRule="evenodd" />
            </svg>
            Create a Pool
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const { profile, signOut } = useAuth();
  const { pool, allPools, brackets, switchPool, isLoading } = usePool();

  const userBracket = profile && brackets
    ? brackets.find((b) => b.user_id === profile.id)
    : null;

  return (
    <div className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">

        {/* Brand — links to dashboard on mobile (replaces Dashboard tab) */}
        <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-xs shrink-0"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            SC
          </div>
          <span className="text-sm font-bold tracking-tight text-white hidden md:block leading-none">
            Sports Closet
          </span>
        </NavLink>

        {/* Divider */}
        <div className="w-px h-5 bg-slate-700/80 shrink-0" />

        {/* Pool context switcher — distinct tier from page tabs */}
        <PoolSwitcher
          pool={pool}
          allPools={allPools}
          switchPool={switchPool}
          isLoading={isLoading}
        />

        {/* Divider */}
        <div className="w-px h-5 bg-slate-700/80 shrink-0" />

        {/* Page nav tabs — scrollable on mobile so overflow doesn't scroll the page */}
        <nav className="overflow-x-auto scrollbar-none flex-1 min-w-0">
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 w-max">
          {NAV_LINKS.map(({ to, label, mobileHidden }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `${mobileHidden ? "hidden sm:flex " : ""}px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {/* Bracket nav: "Create Bracket" → /submit; "Bracket" → /bracket */}
          {pool && !userBracket && (
            <NavLink
              to="/submit"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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
                `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`
              }
            >
              Bracket
            </NavLink>
          )}
          {pool && (
            <NavLink
              to="/reports"
              className={({ isActive }) => {
                // Also highlight when on any /reports/* sub-route
                const onReports = isActive || window.location.pathname.startsWith('/reports');
                return `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  onReports
                    ? "bg-slate-700 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`;
              }}
            >
              Reports
            </NavLink>
          )}

        </div>
        </nav>

        {/* Auth widget — pushed to right */}
        {profile && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* Admin link — hidden on mobile */}
            {profile.is_admin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `hidden sm:block px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                    isActive
                      ? "bg-cyan-600/30 text-cyan-300"
                      : "text-cyan-500/60 hover:text-cyan-400"
                  }`
                }
              >
                Admin
              </NavLink>
            )}
            <span className="text-xs text-slate-400 hidden sm:block max-w-[96px] truncate">
              {profile.username}
            </span>
            {/* Sign out: icon-only on mobile, text on desktop */}
            <button
              onClick={signOut}
              className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-all"
              title="Sign out"
            >
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.04a.75.75 0 10-1.056-1.064l-2.5 2.5a.75.75 0 000 1.064l2.5 2.5a.75.75 0 101.056-1.064L8.704 10.75H18.25A.75.75 0 0019 10z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
