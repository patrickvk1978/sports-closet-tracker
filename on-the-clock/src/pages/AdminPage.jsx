import { useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useReferenceData } from "../hooks/useReferenceData";
import { supabase } from "../lib/supabase";
import prospectsData from "../data/prospects2026.json";

export default function AdminPage() {
  const { profile } = useAuth();
  const { allPools } = usePool();
  const { picks, teams, prospects, getProspectById } = useReferenceData();
  const {
    draftFeed,
    setDraftPhase,
    setCurrentPickNumber,
    setPickStatus,
    overrideTeamOnClock,
    clearTeamOverride,
    revealCurrentPick,
    rollbackPick,
    resetDraftFeed,
  } = useDraftFeed();
  const [selectedPick, setSelectedPick] = useState(draftFeed.current_pick_number);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [selectedTeamCode, setSelectedTeamCode] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  async function syncProspects() {
    setSyncStatus("Syncing…");
    const rows = prospectsData.prospects.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      school: p.school,
      consensus_rank: p.consensus_rank ?? null,
      espn_rank: p.espn_rank ?? null,
      pff_rank: p.pff_rank ?? null,
      ringer_rank: p.ringer_rank ?? null,
      athletic_rank: p.athletic_rank ?? null,
      ringer_mock_pick: p.ringer_mock_pick ?? null,
      athletic_mock_pick: p.athletic_mock_pick ?? null,
      pff_mock_pick: p.pff_mock_pick ?? null,
      consensus_mock_pick: p.consensus_mock_pick ?? null,
      predicted_range: p.predicted_range ?? null,
      notes: p.notes ?? null,
    }));
    const { error } = await supabase.from("prospects").upsert(rows, { onConflict: "id" });
    setSyncStatus(error ? `Error: ${error.message}` : `Synced ${rows.length} prospects ✓`);
  }

  const pick = useMemo(
    () => picks.find((item) => item.number === Number(selectedPick)) ?? picks[0] ?? { number: 1, currentTeam: "" },
    [selectedPick, picks]
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
            <span className="label">Prospect data</span>
            <h2>Sync Prospects</h2>
          </div>
        </div>
        <div className="settings-form-grid two-up">
          <div className="detail-card">
            <span className="micro-label">Source file</span>
            <p>Reads <code>src/data/prospects2026.json</code> ({prospectsData.prospects.length} prospects) and upserts all rows to Supabase. Safe to run multiple times.</p>
          </div>
          <div className="entry-actions align-end">
            <button className="primary-button" type="button" onClick={syncProspects}>
              Sync Prospects
            </button>
            {syncStatus ? <span className="subtle">{syncStatus}</span> : null}
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
              {picks.map((item) => (
                <option key={item.number} value={item.number}>{`${item.number} · ${teams[item.currentTeam]?.name ?? item.currentTeam}`}</option>
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
            <p>{teams[effectiveTeamCode]?.name ?? effectiveTeamCode}</p>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Override team on the clock</span>
            <select value={selectedTeamCode} onChange={(event) => setSelectedTeamCode(event.target.value)}>
              <option value="">Select a team</option>
              {Object.values(teams).map((team) => (
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
              {prospects.map((prospect) => (
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
          {picks.map((item) => {
            const actual = getProspectById(draftFeed.actual_picks?.[item.number]);
            const teamCode = draftFeed.team_overrides?.[item.number] ?? item.currentTeam;
            return (
              <div key={item.number} className="pick-row">
                <div className="pick-num">{item.number}</div>
                <div className="pick-main">
                  <div className="pick-topline">
                    <strong>{teams[teamCode]?.name ?? teamCode}</strong>
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
