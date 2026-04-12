import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";

export default function AdminPage() {
  const { profile } = useAuth();
  const { allPools } = usePool();

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
            <h2>Survivor operations</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <div className="detail-card">
            <span className="micro-label">Visible pools</span>
            <p>{allPools.length} pool(s) are currently visible in this local-first scaffold.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Current focus</span>
            <p>Keep this page simple until schedule ingestion, weekly resolution, and commissioner override flows are ready.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
