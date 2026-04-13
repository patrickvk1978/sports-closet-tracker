import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";

export default function PoolMembersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { pool, members, memberList } = usePool();
  const [copied, setCopied] = useState(false);
  const isCommissioner = pool?.admin_id === profile?.id;
  const invitePath = `/join?code=${pool?.invite_code ?? ""}`;
  const inviteUrl = typeof window !== "undefined" ? `${window.location.origin}${invitePath}` : invitePath;

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div className="simple-shell survivor-shell">
      <button className="back-link" onClick={() => navigate(-1)}>← Back</button>

      <div className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-header">
          <div>
            <span className="label">Pool roster</span>
            <h2>{pool?.name ?? "Members"}</h2>
          </div>
          <span className="chip">{members.length} members</span>
        </div>

        <div className="settings-form-grid three-up">
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Commissioner</span>
            <strong>{memberList.find((member) => member.isAdmin)?.name ?? "Unknown"}</strong>
            <p>The commissioner owns settings, reveal timing, and edge-case rulings.</p>
          </div>
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Invite link</span>
            <p>{invitePath}</p>
            <div className="entry-actions compact">
              <button className="secondary-button" type="button" onClick={copyInviteLink}>
                {copied ? "Copied" : "Copy invite link"}
              </button>
            </div>
          </div>
          <div className="detail-card survivor-utility-card">
            <span className="micro-label">Commissioner tools</span>
            <p>Settings is the control room for lock rules, missed picks, and reveal behavior.</p>
            {isCommissioner ? (
              <div className="entry-actions compact">
                <Link className="secondary-button" to="/pool-settings">
                  Open settings
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {memberList.map((member) => (
            <div key={member.id} className="pool-member-row">
              <div className="pool-member-info">
                <strong>{member.name}</strong>
                <div className="survivor-chip-row">
                  {member.isCurrentUser ? <span className="micro-label">You</span> : null}
                  {member.isAdmin ? <span className="micro-label">Commissioner</span> : null}
                </div>
              </div>
              <div className="pool-member-meta">
                <span className="member-status pending">Pending season start</span>
                <span className="pill-meta">{member.isAdmin ? "Has controls" : "Member"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
