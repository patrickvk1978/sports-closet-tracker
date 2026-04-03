import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { PROSPECTS, ROUND_ONE_PICKS, TEAMS, getProspectById } from "../lib/draftData";

export default function AdminPage() {
  const { profile } = useAuth();
  const {
    allPools,
    draftFeed,
    setDraftPhase,
    setCurrentPickNumber,
    setPickStatus,
    overrideTeamOnClock,
    clearTeamOverride,
    revealCurrentPick,
    rollbackPick,
    resetDraftFeed,
  } = usePool();
  const [selectedPick, setSelectedPick] = useState(draftFeed.current_pick_number);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [selectedTeamCode, setSelectedTeamCode] = useState("");

  const pick = useMemo(
    () => ROUND_ONE_PICKS.find((item) => item.number === Number(selectedPick)) ?? ROUND_ONE_PICKS[0],
    [selectedPick]
  );
  const effectiveTeamCode = draftFeed.team_overrides?.[pick.number] ?? pick.currentTeam;

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
            <h2>Draft Operations</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <div className="detail-card">
            <span className="micro-label">Pools</span>
            <p>{allPools.length} pool(s) visible in this standalone app.</p>
          </div>
          <div className="detail-card">
            <span className="micro-label">Shared feed</span>
            <p>{`Phase: ${draftFeed.phase} · Current pick: ${draftFeed.current_pick_number} · Status: ${draftFeed.current_status}`}</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Provider override</span>
            <h2>Draft feed controls</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Draft phase</span>
            <select value={draftFeed.phase} onChange={(event) => setDraftPhase(event.target.value)}>
              <option value="pre_draft">Pre-draft</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label className="field">
            <span>Current pick</span>
            <select value={selectedPick} onChange={(event) => { const next = Number(event.target.value); setSelectedPick(next); setCurrentPickNumber(next); }}>
              {ROUND_ONE_PICKS.map((item) => (
                <option key={item.number} value={item.number}>{`${item.number} · ${TEAMS[item.currentTeam].name}`}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pick status</span>
            <select value={draftFeed.current_status} onChange={(event) => setPickStatus(event.target.value)}>
              <option value="on_clock">On the clock</option>
              <option value="pick_is_in">Pick is in</option>
              <option value="revealed">Revealed</option>
            </select>
          </label>
          <div className="detail-card">
            <span className="micro-label">Effective team on the clock</span>
            <p>{TEAMS[effectiveTeamCode].name}</p>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Override team on the clock</span>
            <select value={selectedTeamCode} onChange={(event) => setSelectedTeamCode(event.target.value)}>
              <option value="">Select a team</option>
              {Object.values(TEAMS).map((team) => (
                <option key={team.code} value={team.code}>{team.name}</option>
              ))}
            </select>
          </label>
          <div className="entry-actions align-end">
            <button className="secondary-button" type="button" disabled={!selectedTeamCode} onClick={() => overrideTeamOnClock(selectedTeamCode, pick.number)}>
              Override Team
            </button>
            <button className="secondary-button" type="button" onClick={() => clearTeamOverride(pick.number)}>
              Clear Override
            </button>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Reveal player manually</span>
            <select value={selectedProspectId} onChange={(event) => setSelectedProspectId(event.target.value)}>
              <option value="">Select a player</option>
              {PROSPECTS.map((prospect) => (
                <option key={prospect.id} value={prospect.id}>{prospect.name}</option>
              ))}
            </select>
          </label>
          <div className="entry-actions align-end">
            <button className="primary-button" type="button" disabled={!selectedProspectId} onClick={() => revealCurrentPick(selectedProspectId, pick.number)}>
              Reveal Pick
            </button>
            <button className="secondary-button" type="button" onClick={() => rollbackPick(pick.number)}>
              Roll Back Pick
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Feed snapshot</span>
            <h2>Manual correction view</h2>
          </div>
          <button className="secondary-button" type="button" onClick={resetDraftFeed}>Reset feed</button>
        </div>

        <div className="pick-list">
          {ROUND_ONE_PICKS.map((item) => {
            const actual = getProspectById(draftFeed.actual_picks?.[item.number]);
            const teamCode = draftFeed.team_overrides?.[item.number] ?? item.currentTeam;
            return (
              <div key={item.number} className="pick-row">
                <div className="pick-num">{item.number}</div>
                <div className="pick-main">
                  <div className="pick-topline">
                    <strong>{TEAMS[teamCode].name}</strong>
                    {draftFeed.team_overrides?.[item.number] ? <span className="trade-badge">Team override</span> : null}
                  </div>
                  <div className="pick-columns">
                    <div>
                      <span className="micro-label">Actual</span>
                      <span className="subtle">{actual?.name ?? "Waiting"}</span>
                    </div>
                    <div>
                      <span className="micro-label">Status</span>
                      <span className="subtle">{item.number === draftFeed.current_pick_number ? draftFeed.current_status : actual ? "revealed" : "pending"}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
