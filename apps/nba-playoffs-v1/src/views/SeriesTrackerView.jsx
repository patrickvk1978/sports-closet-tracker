import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import {
  describeRoundScoring,
  getAvailableRoundKey,
  isRoundUnlocked,
  scoreSeriesPick,
  summarizeSeriesMarket,
  summarizePickScores,
} from "../lib/seriesPickem";
import { formatProbabilityFreshness, formatProbabilitySourceLabel } from "../lib/probabilityInputs";
import { areRoundPicksPublic } from "../lib/pickVisibility";

const GAME_OPTIONS = [4, 5, 6, 7];

function formatRoundLabel(roundKey) {
  return roundKey.replaceAll("_", " ");
}

function OutcomeChip({ score }) {
  if (!score) return <span className="chip">Open</span>;
  const className =
    score.outcome === "exact"
      ? "chip nba-chip-exact"
      : score.outcome === "close" || score.outcome === "near"
        ? "chip nba-chip-close"
        : "chip";
  return <span className={className}>{score.label}</span>;
}

function formatSavedLabel(lastSavedAt, persistenceMode, saveState) {
  if (saveState === "saving") return "Saving changes…";
  if (saveState === "error") return "Could not save your latest change";
  if (!lastSavedAt) return persistenceMode === "supabase" ? "Autosave is on" : "Autosave is on locally";

  const time = new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return persistenceMode === "supabase" ? `Saved at ${time}` : `Saved locally at ${time}`;
}

export default function SeriesTrackerView() {
  const { profile } = useAuth();
  const { pool, settingsForPool, memberList, updatePoolSettings } = usePool();
  const { series, seriesByRound, roundSummaries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeRound, setActiveRound] = useState("round_1");
  const {
    picksBySeriesId,
    allPicksByUser,
    pickedSeriesCount,
    loading,
    persistenceMode,
    saveState,
    lastSavedAt,
    saveSeriesPick,
    clearSeriesPick,
  } = useSeriesPickem(series);
  const availableRoundKey = getAvailableRoundKey(roundSummaries);
  const activeSeries = seriesByRound[activeRound] ?? [];
  const canViewOtherBoards = areRoundPicksPublic(activeSeries, activeRound, settings);
  const currentRoundScoring = describeRoundScoring(availableRoundKey, settings);
  const requestedViewerId = searchParams.get("viewer") ?? "";
  const availableViewers = memberList.filter((member) => member.id !== profile?.id);
  const selectedViewer = canViewOtherBoards
    ? availableViewers.find((member) => member.id === requestedViewerId) ?? null
    : null;
  const isViewingCurrentUser = !selectedViewer;
  const visiblePicksBySeriesId = selectedViewer ? allPicksByUser[selectedViewer.id] ?? {} : picksBySeriesId;
  const scoreSummary = useMemo(
    () => summarizePickScores(visiblePicksBySeriesId, series, settings),
    [visiblePicksBySeriesId, series, settings]
  );
  const currentMember = memberList.find((member) => member.isCurrentUser) ?? null;
  const roundLocks = settings.round_locks ?? {};
  const isCommissioner = pool?.admin_id === profile?.id;

  function handleViewerChange(event) {
    const nextViewerId = event.target.value;
    if (!nextViewerId) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ viewer: nextViewerId }, { replace: true });
  }

  async function setRoundLock(roundKey, locked) {
    if (!isCommissioner) return;
    await updatePoolSettings({
      round_locks: {
        ...roundLocks,
        [roundKey]: locked,
      },
    });
  }

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Series Pick'em</span>
            <h2>Make your picks for the current playoff round.</h2>
          </div>
        </div>

        <div className="detail-card inset-card">
          <p>
            {formatRoundLabel(availableRoundKey)} is open right now. Exact 5/6 is worth {currentRoundScoring.exactBase}, exact 4/7 is worth {currentRoundScoring.exactEdge}, off by 1 is worth {currentRoundScoring.offBy1}, and off by 2 is worth {currentRoundScoring.offBy2}. {" "}
            {loading ? "Loading picks…" : `${formatSavedLabel(lastSavedAt, persistenceMode, saveState)}.`} {" "}
            {isViewingCurrentUser
              ? `You currently have ${scoreSummary.totalPoints} points with ${scoreSummary.exact} exact calls.`
              : `${selectedViewer?.name ?? "This entry"} currently has ${scoreSummary.totalPoints} points with ${scoreSummary.exact} exact calls.`}
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Series board</span>
            <h2>{isViewingCurrentUser ? "Current round board" : `${selectedViewer?.name ?? "This entry"}'s round board`}</h2>
          </div>
          <div className="nba-report-actions">
            {canViewOtherBoards ? (
              <select
                className="nav-select"
                value={isViewingCurrentUser ? "" : selectedViewer?.id ?? ""}
                onChange={handleViewerChange}
                aria-label="Choose a card to view"
              >
                <option value="">Viewing: My picks</option>
                {availableViewers.map((member) => (
                  <option key={member.id} value={member.id}>
                    View {member.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="tooltip-wrap tooltip-wrap-inline">
                <button type="button" className="secondary-button" disabled>
                  View another card
                </button>
                <span className="tooltip-bubble">Available once the round locks or games begin.</span>
              </span>
            )}
            <span className="chip">{isViewingCurrentUser ? pickedSeriesCount : Object.values(visiblePicksBySeriesId).filter((pick) => pick?.winnerTeamId).length} saved picks</span>
          </div>
        </div>

        <div className="nba-round-tabs">
          {roundSummaries.map((round) => {
            const unlocked = isRoundUnlocked(round.key, roundSummaries);
            return (
              <div className="nba-round-tab-shell" key={round.key}>
                <button
                  type="button"
                  onClick={() => unlocked && setActiveRound(round.key)}
                  className={activeRound === round.key ? "nba-round-tab active" : "nba-round-tab"}
                  disabled={!unlocked}
                >
                  <span>{round.shortLabel}</span>
                  <strong>{round.label}</strong>
                </button>
                {isCommissioner ? (
                  <button
                    type="button"
                    className={roundLocks[round.key] ? "nba-lock-button locked" : "nba-lock-button"}
                    onClick={() => setRoundLock(round.key, !roundLocks[round.key])}
                  >
                    {roundLocks[round.key] ? "Unlock round" : "Lock round"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="nba-series-pick-grid">
          {activeSeries.map((seriesItem) => {
            const pick = visiblePicksBySeriesId[seriesItem.id];
            const score = scoreSeriesPick(pick, seriesItem, settings);
            const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
            const marketFavorite =
              seriesItem.market.homeWinPct >= seriesItem.market.awayWinPct
                ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.market.homeWinPct}%`
                : `${seriesItem.awayTeam.abbreviation} ${seriesItem.market.awayWinPct}%`;
            const modelLean =
              seriesItem.model.homeWinPct >= seriesItem.model.awayWinPct
                ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.model.homeWinPct}%`
                : `${seriesItem.awayTeam.abbreviation} ${seriesItem.model.awayWinPct}%`;

            return (
              <article className="nba-pick-card" key={seriesItem.id}>
                <div className="nba-series-head">
                  <div>
                    <span className="micro-label">{seriesItem.nextGame}</span>
                    <h3>{seriesItem.homeTeam.city} vs {seriesItem.awayTeam.city}</h3>
                  </div>
                  <OutcomeChip score={score} />
                </div>

                <div className="nba-series-meta-grid">
                  <div className="detail-card inset-card">
                    <span className="micro-label">Live score</span>
                    <p>{seriesItem.homeTeam.abbreviation} {seriesItem.wins.home}-{seriesItem.wins.away} {seriesItem.awayTeam.abbreviation}</p>
                  </div>
                  <div className="detail-card inset-card">
                    <span className="micro-label">Market</span>
                    <p>{marketFavorite}</p>
                    <span className="micro-copy">{formatProbabilitySourceLabel(seriesItem.market)} · {formatProbabilityFreshness(seriesItem.market)}</span>
                  </div>
                  <div className="detail-card inset-card">
                    <span className="micro-label">Model</span>
                    <p>{modelLean}</p>
                    <span className="micro-copy">{formatProbabilitySourceLabel(seriesItem.model)} · {formatProbabilityFreshness(seriesItem.model)}</span>
                  </div>
                </div>

                {canViewOtherBoards ? (
                  <div className="nba-pool-lean-card">
                    <div className="nba-pool-lean-head">
                      <span className="micro-label">Pool lean</span>
                      <span>{marketSummary.total === 0 ? "No picks logged yet" : `${marketSummary.total} public picks`}</span>
                    </div>
                    <div className="nba-pool-lean-bars">
                      <div className="nba-pool-lean-team">
                        <div className="nba-pool-lean-label">
                          <strong>{seriesItem.homeTeam.abbreviation}</strong>
                          <span>{marketSummary.homePct}%</span>
                        </div>
                        <div className="nba-pool-lean-track">
                          <div className="nba-pool-lean-fill" style={{ width: `${marketSummary.homePct}%` }} />
                        </div>
                      </div>
                      <div className="nba-pool-lean-team">
                        <div className="nba-pool-lean-label">
                          <strong>{seriesItem.awayTeam.abbreviation}</strong>
                          <span>{marketSummary.awayPct}%</span>
                        </div>
                        <div className="nba-pool-lean-track">
                          <div className="nba-pool-lean-fill nba-pool-lean-fill-away" style={{ width: `${marketSummary.awayPct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="nba-pool-lean-notes">
                      <span>
                        {marketSummary.leadingGames
                          ? `Most common length: ${marketSummary.leadingGames} games (${marketSummary.leadingGamesCount})`
                          : "No length consensus yet"}
                      </span>
                      <span>{marketSummary.noPickCount > 0 ? `${marketSummary.noPickCount} still open` : "Everyone has picked"}</span>
                    </div>
                    <div className="nba-pool-lean-callout">
                      <strong>Room context</strong>
                      <span>These picks are public now, so this is the clean read on where the room actually landed.</span>
                    </div>
                  </div>
                ) : (
                  <div className="nba-pool-lean-card">
                    <div className="nba-pool-lean-head">
                      <span className="micro-label">Pool lean</span>
                      <span>Private until lock</span>
                    </div>
                    <div className="nba-pool-lean-callout">
                      <strong>Selections are hidden right now</strong>
                      <span>This page only uses public market and model signals until the round locks or games begin.</span>
                    </div>
                  </div>
                )}

                <div className="nba-team-pick-grid">
                  {[seriesItem.homeTeam, seriesItem.awayTeam].map((team) => {
                    const selected = pick?.winnerTeamId === team.id;
                    const isLocked = Boolean(roundLocks[seriesItem.roundKey]);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        className={selected ? "nba-team-pick active" : "nba-team-pick"}
                        disabled={isLocked || !isViewingCurrentUser}
                        onClick={() => saveSeriesPick(seriesItem.id, team.id, pick?.games ?? 6, seriesItem.roundKey)}
                      >
                        <span className="micro-label">Seed {team.seed}</span>
                        <strong>{team.city} {team.name}</strong>
                        <span>{team.abbreviation}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="nba-games-picker">
                  <span className="micro-label">Series length</span>
                  <div className="nba-games-options">
                    {GAME_OPTIONS.map((games) => (
                      <button
                        key={games}
                        type="button"
                        className={pick?.games === games ? "nba-games-option active" : "nba-games-option"}
                        disabled={Boolean(roundLocks[seriesItem.roundKey]) || !pick?.winnerTeamId || !isViewingCurrentUser}
                        onClick={() => saveSeriesPick(seriesItem.id, pick?.winnerTeamId ?? seriesItem.homeTeam.id, games, seriesItem.roundKey)}
                      >
                        {games}
                      </button>
                    ))}
                  </div>
                  {!pick?.winnerTeamId ? <p className="micro-copy">Choose a winner first, then set the series length.</p> : null}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(roundLocks[seriesItem.roundKey]) || !isViewingCurrentUser}
                    onClick={() => clearSeriesPick(seriesItem.id)}
                  >
                    Clear pick
                  </button>
                </div>

                <div className="nba-pick-footer">
                  <div>
                    <span className="micro-label">{isViewingCurrentUser ? "Your pick" : `${selectedViewer?.name ?? "Their"} pick`}</span>
                    <p>
                      {pick
                        ? `${pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam.city : seriesItem.awayTeam.city} in ${pick.games}`
                        : "No pick saved yet"}
                    </p>
                  </div>
                  <div>
                    <span className="micro-label">Save status</span>
                    <p>{isViewingCurrentUser ? formatSavedLabel(lastSavedAt, persistenceMode, saveState) : "Read-only view"}</p>
                  </div>
                </div>
                {roundLocks[seriesItem.roundKey] ? (
                  <div className="nba-lock-banner">
                    Commissioner has locked this round. Picks are read-only until it is reopened.
                  </div>
                ) : !isViewingCurrentUser ? (
                  <div className="nba-lock-banner">
                    You are viewing {selectedViewer?.name ?? "another entry"}'s public card. This view is read-only.
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Roles</span>
            <h2>Who can do what in this product?</h2>
          </div>
        </div>

        <div className="nba-placeholder-grid">
          <article className="detail-card inset-card">
            <span className="micro-label">Your role</span>
            <p>{currentMember ? currentMember.roleLabel : "Viewer"}</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Commissioner powers</span>
            <p>Pool scoring, lock behavior, invite flow, and round-level pool governance.</p>
          </article>
          <article className="detail-card inset-card">
            <span className="micro-label">Site admin powers</span>
            <p>Cross-pool fixes, league-wide data corrections, and product-level maintenance.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
