import { useNavigate } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useMockChallenge } from "../hooks/useMockChallenge";
import { useDraftFeed } from "../hooks/useDraftFeed";

export default function PoolMembersPage() {
  const navigate = useNavigate();
  const { pool, members, memberList } = usePool();
  const { draftFeed } = useDraftFeed();
  const { submittedUserIds } = useMockChallenge({ draftFeed });

  const isMock = pool?.game_mode === "mock_challenge";

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
          {memberList.map((member) => {
            const submitted = isMock ? submittedUserIds?.has(member.id) : false;
            return (
              <div key={member.id} className="pool-member-row">
                <div className="pool-member-info">
                  <strong>{member.name}</strong>
                  {member.isCurrentUser ? <span className="micro-label">You</span> : null}
                  {member.isAdmin ? <span className="micro-label">Creator</span> : null}
                </div>
                {isMock ? (
                  <span className={submitted ? "member-status submitted" : "member-status pending"}>
                    {submitted ? "Submitted" : "Not yet submitted"}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
