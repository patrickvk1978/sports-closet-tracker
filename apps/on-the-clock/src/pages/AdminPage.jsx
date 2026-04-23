import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { usePool } from "../hooks/usePool";
import { useDraftFeed } from "../hooks/useDraftFeed";
import { useReferenceData } from "../hooks/useReferenceData";
import { supabase } from "../lib/supabase";
import prospectsData from "../data/prospects2026.json";

export default function AdminPage() {
  const { profile } = useAuth();
  const { allPools } = usePool();
  const { picks, teams, prospects, getProspectById, reloadReferenceData } = useReferenceData();
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
    setScoringConfig,
  } = useDraftFeed();
  const [selectedPick, setSelectedPick] = useState(draftFeed.current_pick_number);
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [selectedTeamCode, setSelectedTeamCode] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  // ── Scoring config state ──
  const [scoringDraft, setScoringDraft] = useState(null); // null = not yet loaded
  const [scoringStatus, setScoringStatus] = useState("");

  // Initialise from live feed once it loads
  useEffect(() => {
    if (draftFeed.scoring_config && !scoringDraft) {
      setScoringDraft({ ...draftFeed.scoring_config });
    }
  }, [draftFeed.scoring_config]);

  const sc = scoringDraft ?? { tier_1: 100, tier_2: 120, tier_3: 150, tier_4: 180, streak_threshold: 5, streak_multiplier: 1.5 };

  async function saveScoringConfig() {
    setScoringStatus("Saving…");
    const config = {
      tier_1: Number(sc.tier_1),
      tier_2: Number(sc.tier_2),
      tier_3: Number(sc.tier_3),
      tier_4: Number(sc.tier_4),
      streak_threshold: Number(sc.streak_threshold),
      streak_multiplier: Number(sc.streak_multiplier),
    };
    await setScoringConfig(config);
    setScoringStatus("Saved ✓");
    setTimeout(() => setScoringStatus(""), 2000);
  }

  function updateSc(key, value) {
    setScoringDraft(prev => ({ ...(prev ?? sc), [key]: value }));
  }

  // ── Bluesky allowlist state ──
  const [allowlist, setAllowlist] = useState([]);
  const [newHandle, setNewHandle] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [allowlistStatus, setAllowlistStatus] = useState("");

  useEffect(() => {
    supabase.from("bluesky_allowlist").select("*").order("added_at")
      .then(({ data }) => { if (data) setAllowlist(data); });
  }, []);

  async function addHandle() {
    const handle = newHandle.trim().replace(/^@/, "");
    if (!handle) return;
    setAllowlistStatus("Adding…");
    const { error } = await supabase.from("bluesky_allowlist").insert({
      handle,
      display_name: newDisplayName.trim() || null,
      active: true,
    });
    if (error) { setAllowlistStatus(`Error: ${error.message}`); return; }
    setAllowlist((prev) => [...prev, { handle, display_name: newDisplayName.trim() || null, active: true }]);
    setNewHandle("");
    setNewDisplayName("");
    setAllowlistStatus("Added ✓");
    setTimeout(() => setAllowlistStatus(""), 2000);
  }

  async function toggleHandle(handle, active) {
    await supabase.from("bluesky_allowlist").update({ active: !active }).eq("handle", handle);
    setAllowlist((prev) => prev.map((r) => r.handle === handle ? { ...r, active: !active } : r));
  }

  async function removeHandle(handle) {
    await supabase.from("bluesky_allowlist").delete().eq("handle", handle);
    setAllowlist((prev) => prev.filter((r) => r.handle !== handle));
  }

  async function syncProspects() {
    setSyncStatus("Syncing…");
    const rows = prospectsData.prospects.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      school: p.school,
      consensus_rank: p.consensus_rank ?? null,
      espn_rank: p.espn_rank ?? null,
      ringer_rank: p.ringer_rank ?? null,
      athletic_rank: p.athletic_rank ?? null,
      ringer_mock_pick: p.ringer_mock_pick ?? null,
      athletic_mock_pick: p.athletic_mock_pick ?? null,
      consensus_mock_pick: p.consensus_mock_pick ?? null,
      predicted_range: p.predicted_range ?? null,
      notes: p.notes ?? null,
    }));
    const rowsWithEspnMock = rows.map((row, index) => ({
      ...row,
      espn_mock_pick: prospectsData.prospects[index].espn_mock_pick ?? null,
    }));

    let { error } = await supabase.from("prospects").upsert(rowsWithEspnMock, { onConflict: "id" });
    if (error?.message?.includes("espn_mock_pick")) {
      ({ error } = await supabase.from("prospects").upsert(rows, { onConflict: "id" }));
      if (!error) {
        setSyncStatus(`Synced ${rows.length} prospects ✓ (ESPN mock stays build-backed until DB column is added)`);
        await reloadReferenceData();
        return;
      }
    }

    if (error) {
      setSyncStatus(`Error: ${error.message}`);
      return;
    }

    setSyncStatus(`Synced ${rows.length} prospects ✓`);
    await reloadReferenceData();
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
            <span className="label">Point values</span>
            <h2>Scoring Config</h2>
          </div>
        </div>

        <div className="settings-form-grid two-up">
          <label className="field">
            <span>Picks 1–8 (base points)</span>
            <input className="field-input" type="number" min="0" value={sc.tier_1} onChange={(e) => updateSc("tier_1", e.target.value)} />
          </label>
          <label className="field">
            <span>Picks 9–16 (base points)</span>
            <input className="field-input" type="number" min="0" value={sc.tier_2} onChange={(e) => updateSc("tier_2", e.target.value)} />
          </label>
          <label className="field">
            <span>Picks 17–24 (base points)</span>
            <input className="field-input" type="number" min="0" value={sc.tier_3} onChange={(e) => updateSc("tier_3", e.target.value)} />
          </label>
          <label className="field">
            <span>Picks 25–32 (base points)</span>
            <input className="field-input" type="number" min="0" value={sc.tier_4} onChange={(e) => updateSc("tier_4", e.target.value)} />
          </label>
          <label className="field">
            <span>Streak threshold (hits before bonus)</span>
            <input className="field-input" type="number" min="1" value={sc.streak_threshold} onChange={(e) => updateSc("streak_threshold", e.target.value)} />
          </label>
          <label className="field">
            <span>Streak multiplier (e.g. 1.5 = 50% bonus)</span>
            <input className="field-input" type="number" min="1" step="0.1" value={sc.streak_multiplier} onChange={(e) => updateSc("streak_multiplier", e.target.value)} />
          </label>
        </div>
        <div className="entry-actions" style={{ marginTop: 8 }}>
          <button className="primary-button" type="button" onClick={saveScoringConfig}>
            Save scoring config
          </button>
          {scoringStatus && <span className="subtle">{scoringStatus}</span>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Center feed</span>
            <h2>Bluesky Allowlist</h2>
          </div>
        </div>

        <div className="bluesky-allowlist">
          {allowlist.map((row) => (
            <div key={row.handle} className={`bsl-row ${row.active ? "active" : "inactive"}`}>
              <div className="bsl-handle">
                <span className="bsl-at">@</span>{row.handle}
              </div>
              <div className="bsl-name">{row.display_name ?? "—"}</div>
              <div className="bsl-actions">
                <button
                  className="bsl-toggle"
                  type="button"
                  onClick={() => toggleHandle(row.handle, row.active)}
                  title={row.active ? "Disable" : "Enable"}
                >
                  {row.active ? "On" : "Off"}
                </button>
                <button
                  className="bsl-remove"
                  type="button"
                  onClick={() => removeHandle(row.handle)}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-form-grid two-up" style={{ marginTop: 16 }}>
          <label className="field">
            <span>Handle</span>
            <input
              className="field-input"
              placeholder="rapsheet.bsky.social"
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHandle()}
            />
          </label>
          <label className="field">
            <span>Display name (optional)</span>
            <input
              className="field-input"
              placeholder="Ian Rapoport"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addHandle()}
            />
          </label>
        </div>
        <div className="entry-actions" style={{ marginTop: 8 }}>
          <button className="primary-button" type="button" onClick={addHandle}>
            Add handle
          </button>
          {allowlistStatus && <span className="subtle">{allowlistStatus}</span>}
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
