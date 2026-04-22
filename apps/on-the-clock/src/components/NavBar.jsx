import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useDraftFeed } from "../hooks/useDraftFeed";

function PoolMenu({ pool, allPools, switchPool, isLoading, hideInviteLinks }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function copyInvite(event, targetPool) {
    event.stopPropagation();
    if (!targetPool?.invite_code) return;
    const inviteUrl = `${window.location.origin}/join?code=${targetPool.invite_code}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedId(targetPool.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  }

  return (
    <div className="pool-menu" ref={menuRef}>
      <button
        type="button"
        className={`pool-menu-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch pool"
        title={pool?.name ?? "Pools"}
      >
        <span className="pool-menu-label">
          {isLoading ? "Loading…" : pool?.name ?? "Pools"}
        </span>
        <span className={`pool-menu-chevron ${open ? "open" : ""}`}>▾</span>
      </button>

      {open ? (
        <div className="pool-menu-panel" role="menu">
          <div className="pool-menu-list">
            {allPools.map((item) => {
              const isActive = pool?.id === item.id;
              return (
                <div key={item.id} className="pool-menu-row">
                  <button
                    type="button"
                    className={`pool-menu-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      switchPool(item.id);
                      setOpen(false);
                    }}
                    role="menuitem"
                  >
                    <span className="pool-menu-item-name">{item.name}</span>
                    {isActive ? <span className="pool-menu-check">✓</span> : null}
                  </button>
                  {!hideInviteLinks ? (
                    <button
                      type="button"
                      className={`pool-menu-copy ${copiedId === item.id ? "copied" : ""}`}
                      onClick={(event) => copyInvite(event, item)}
                      title={copiedId === item.id ? "Invite link copied" : "Copy invite link"}
                      aria-label={copiedId === item.id ? "Invite link copied" : `Copy invite link for ${item.name}`}
                    >
                      {copiedId === item.id ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="pool-menu-divider" />

          <button
            type="button"
            className="pool-menu-action"
            onClick={() => {
              navigate("/join");
              setOpen(false);
            }}
          >
            + Join a Pool
          </button>
          <button
            type="button"
            className="pool-menu-action"
            onClick={() => {
              navigate("/create-pool");
              setOpen(false);
            }}
          >
            + Create a Pool
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, profile } = useAuth();
  const { pool, allPools, switchPool, isLoading } = usePool();
  const { draftFeed } = useDraftFeed();

  const isAdmin = location.pathname === "/admin";
  const isSettings = location.pathname === "/pool-settings";
  const isPoolCreator = pool?.admin_id === profile?.id;
  const canSettings = isPoolCreator || Boolean(profile?.is_admin);
  const hideInviteLinks = location.pathname === "/draft" && draftFeed.phase === "live";

  function goHome() {
    navigate(pool?.game_mode === "mock_challenge" ? "/mock" : "/draft");
  }

  return (
    <nav className="nav-shell" aria-label="Primary navigation">
      <button className="brand-link" onClick={goHome} aria-label="Go to draft view">
        <span className="brand-mark">OTC</span>
        <span>On the Clock</span>
      </button>

      <div className="nav-actions">
        <PoolMenu
          pool={pool}
          allPools={allPools}
          switchPool={switchPool}
          isLoading={isLoading}
          hideInviteLinks={hideInviteLinks}
        />

        {canSettings ? (
          <button
            className={isSettings ? "nav-button chip active" : "nav-button"}
            onClick={() => navigate("/pool-settings")}
            aria-label="Pool settings"
          >
            Settings
          </button>
        ) : null}

        {profile?.is_admin ? (
          <button
            className={isAdmin ? "nav-button chip active" : "nav-button"}
            onClick={() => navigate("/admin")}
            aria-label="Admin panel"
          >
            Admin
          </button>
        ) : null}

        <button className="nav-button muted" onClick={() => signOut()} aria-label="Sign out">
          Sign out
        </button>
      </div>
    </nav>
  );
}
