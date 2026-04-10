import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";

export default function PoolMembersPage() {
  const navigate = useNavigate();
  const { pool, members, memberList } = usePool();

  return (
    <div className="simple-shell">
      <button className="back-link" onClick={() => navigate(-1)}>← Back</button>

      <div className="panel" style={{ maxWidth: 560 }}>
        <div className="panel-header">
          <div>
            <span className="label">Pool</span>
            <h2>{pool?.name ?? "Members"}</h2>
          </div>
          <span className="chip">{members.length} members</span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {memberList.map((member) => (
            <div key={member.id} className="pool-member-row">
              <div className="pool-member-info">
                <strong>{member.name}</strong>
                <span className="micro-label">{member.roleLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
