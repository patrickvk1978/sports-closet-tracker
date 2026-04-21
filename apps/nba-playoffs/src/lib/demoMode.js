const DEMO_FLAG_KEY = "nba_playoffs_demo_mode";
const DEMO_SESSION_KEY = "nba_playoffs_demo_session";
const DEMO_USERS_KEY = "nba_playoffs_demo_users";
const DEMO_POOLS_KEY = "nba_playoffs_demo_pools";
const DEMO_MEMBERS_KEY = "nba_playoffs_demo_memberships";
const DEMO_ACTIVE_POOL_KEY = "nba_playoffs_demo_active_pool_id";

export function isBrowser() {
  return typeof window !== "undefined";
}

export function readJson(key, fallback) {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function isDemoModeEnabled() {
  if (!isBrowser()) return false;
  return window.localStorage.getItem(DEMO_FLAG_KEY) === "1";
}

export function setDemoModeEnabled(enabled) {
  if (!isBrowser()) return;
  window.localStorage.setItem(DEMO_FLAG_KEY, enabled ? "1" : "0");
}

export function clearDemoMode() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(DEMO_FLAG_KEY);
}

export function getDemoStorageKeys() {
  return {
    session: DEMO_SESSION_KEY,
    users: DEMO_USERS_KEY,
    pools: DEMO_POOLS_KEY,
    members: DEMO_MEMBERS_KEY,
    activePool: DEMO_ACTIVE_POOL_KEY,
  };
}
