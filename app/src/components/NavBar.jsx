import { NavLink } from "react-router-dom";

const NAV_LINKS = [
  { to: "/",        label: "Dashboard" },
  { to: "/matrix",  label: "Matrix"    },
  { to: "/bracket", label: "Bracket"   },
];

export default function NavBar() {
  return (
    <div className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-sm"
            style={{ fontFamily: "Space Mono, monospace" }}
          >
            SC
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-none">
              Sports Closet Tournament Tracker
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">Final Four in progress</p>
          </div>
        </div>

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
        </nav>
      </div>
    </div>
  );
}
