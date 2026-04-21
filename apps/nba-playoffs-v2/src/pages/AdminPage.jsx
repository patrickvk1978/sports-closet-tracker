import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { usePlatformHealth } from "../hooks/usePlatformHealth";

export default function AdminPage() {
  const { profile } = useAuth();
  const { allPools, pool, members, memberList } = usePool();
  const health = usePlatformHealth();

  if (!profile?.is_admin) {
    return (
      <div className="panel">
        <h2>Admin</h2>
        <p className="subtle">This page is only visible to global admins.</p>
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Global admin</span>
            <h2>NBA Playoff Predictor control room</h2>
          </div>
        </div>

        <div className="settings-form-grid three-up">
          <div className="detail-card">
            <span className="micro-label">Visible pools</span>
            <p>{allPools.length}</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Active pool</span>
            <p>{pool?.name ?? "None selected"}</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Members in active pool</span>
            <p>{members.length}</p>
          </div>
        </div>
        <div className="nba-role-strip">
          <span className="chip nba-role-chip">Site admin screen</span>
          <span className="chip nba-role-chip">Commissioner tools belong in pool settings</span>
          <span className="chip nba-role-chip">{memberList.filter((member) => member.isSiteAdmin).length} site admin(s) visible in this pool</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Next implementation targets</span>
            <h2>Admin tools to build</h2>
          </div>
        </div>

        <div className="nba-placeholder-grid">
          <article className="detail-card inset-card">
            <span className="micro-label">Platform health</span>
            <p>{health.loading ? "Checking…" : health.message}</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Playoff state</span>
            <p>Current round, series status, lock windows, and correction tools will live here.</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Data sync</span>
            <p>NBA team, bracket, and game refresh controls should replace the copied draft sync pattern.</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Pool operations</span>
            <p>Commissioner overrides, standings recalculation, and visibility tools belong on this page.</p>
          </article>
        </div>
        <div className="nba-role-strip">
          <span className="chip nba-role-chip">Env configured: {health.envConfigured ? "Yes" : "No"}</span>
          <span className="chip nba-role-chip">NBA pools: {health.loading ? "Checking" : health.nbaPoolsCount}</span>
          <span className="chip nba-role-chip">Series table: {health.loading ? "Checking" : health.nbaSeriesPicksTable}</span>
          <span className="chip nba-role-chip">Probabilities: {health.loading ? "Checking" : `${health.probabilityInputsTable} (${health.probabilityInputsRows})`}</span>
          <span className="chip nba-role-chip">Sim outputs: {health.loading ? "Checking" : `${health.simulationOutputsTable} (${health.simulationOutputsRows})`}</span>
        </div>
      </section>
    </div>
  );
}
