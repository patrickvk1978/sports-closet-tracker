import { useMemo, useState } from "react";
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

  const membersWithMeta = useMemo(() => {
    return memberList.map((member) => {
      const raw = members.find((entry) => entry.user_id === member.id);
      return {
        ...member,
        joinedAt: raw?.joined_at ?? null,
      };
    });
  }, [memberList, members]);

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="simple-shell">
      <button className="back-link" onClick={() => navigate(-1)}>← Back</button>

      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Pool roster</span>
            <h2>{pool?.name ?? "Members"}</h2>
          </div>
          <span className="chip">{memberList.length} entries</span>
        </div>

        <div className="nba-placeholder-grid">
          <div className="detail-card inset-card">
            <span className="micro-label">Commissioner</span>
            <p>{membersWithMeta.find((member) => member.isCommissioner)?.name ?? "Pool creator"}</p>
          </div>
          <div className="detail-card inset-card">
            <span className="micro-label">Invite code</span>
            <p>{pool?.invite_code ?? "Pending"}</p>
          </div>
          <div className="detail-card inset-card">
            <span className="micro-label">Share path</span>
            <p>{invitePath}</p>
          </div>
        </div>

        <div className="commissioner-actions">
          <button className="secondary-button" type="button" onClick={handleCopyInvite}>
            {copied ? "Invite Link Copied" : "Copy Invite Link"}
          </button>
          {isCommissioner ? (
            <Link className="secondary-button" to="/pool-settings">
              Commissioner Settings
            </Link>
          ) : null}
        </div>

        <div className="nba-role-strip">
          <span className="chip nba-role-chip">Members can view this page</span>
          <span className="chip nba-role-chip">{isCommissioner ? "You can manage invite flow from here" : "Only the commissioner can edit pool settings"}</span>
        </div>

        <div className="pool-member-stack">
          {membersWithMeta.map((member) => (
            <div key={member.id} className="pool-member-row">
              <div className="pool-member-info">
                <div className="pool-member-avatar">
                  {member.name?.slice(0, 1)?.toUpperCase() ?? "?"}
                </div>
                <div className="pool-member-meta">
                  <strong>{member.name}</strong>
                  <span className="micro-label">{member.roleLabel}</span>
                  <span className="subtle">
                    {member.joinedAt
                      ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
                      : "Join date not available yet"}
                  </span>
                </div>
              </div>
              <div className="pool-member-tags">
                {member.isCommissioner ? <span className="chip active">Commissioner</span> : null}
                {member.isSiteAdmin ? <span className="chip">Site admin</span> : null}
                {member.isCurrentUser ? <span className="chip">You</span> : null}
                {isCommissioner && !member.isCurrentUser ? (
                  <Link className="secondary-button pool-member-edit-link" to={`/teams?viewer=${member.id}&edit=1`}>
                    Edit Board
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
