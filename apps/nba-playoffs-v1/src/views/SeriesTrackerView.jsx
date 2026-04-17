import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { useAuth } from "../hooks/useAuth";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import {
  getAvailableRoundKey,
  isRoundUnlocked,
  scoreSeriesPick,
  summarizePickScores,
} from "../lib/seriesPickem";
import { formatProbabilityFreshness, formatProbabilitySourceLabel } from "../lib/probabilityInputs";
import { areRoundPicksPublic } from "../lib/pickVisibility";

const GAME_OPTIONS = [4, 5, 6, 7];

function formatRoundLabel(roundKey) {
  return roundKey.replaceAll("_", " ");
}

function formatRoundStatus(round, availableRoundKey, settings) {
  const isAvailable = round.key === availableRoundKey;
  if (settings?.round_locks?.[round.key]) return "Locked by commissioner";
  if (isAvailable) return "Open for picks";
  return round.complete ? "Scored" : "Waiting on prior round";
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
  if (!lastSavedAt) return persistenceMode === "supabase" ? "Autosave is on for your account" : "Autosave is on for this board";

  const time = new Date(lastSavedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return persistenceMode === "supabase" ? `Saved to your account at ${time}` : `Saved on this board at ${time}`;
}

function getSeriesPlaceholderCopy(team) {
  switch (team?.id) {
    case "west-seed-8":
    case "west-playin-8":
      return {
        primary: "GSW / PHX winner",
        secondary: "Friday play-in for West No. 8",
        short: "GSW/PHX",
      };
    case "east-seed-8":
    case "east-playin-8":
      return {
        primary: "CHA / ORL winner",
        secondary: "Final play-in for East No. 8",
        short: "CHA/ORL",
      };
    default:
      return null;
  }
}

function formatSeriesTeam(team) {
  const placeholder = getSeriesPlaceholderCopy(team);
  if (placeholder) return placeholder;
  return {
    primary: `${team.city} ${team.name}`,
    secondary: team.abbreviation,
    short: team.abbreviation,
  };
}

function formatSeriesSlotLabel(seriesItem) {
  const conferenceLabel = seriesItem.conference === "East" ? "East" : seriesItem.conference === "West" ? "West" : "League";
  return `${conferenceLabel} ${seriesItem.homeTeam.seed} vs ${seriesItem.awayTeam.seed}`;
}

function isSeriesReadyForPicks(seriesItem) {
  if (!seriesItem?.homeTeam || !seriesItem?.awayTeam) return false;
  if (seriesItem.homeTeam.abbreviation === "TBD" || seriesItem.awayTeam.abbreviation === "TBD") return false;
  if (getSeriesPlaceholderCopy(seriesItem.homeTeam) || getSeriesPlaceholderCopy(seriesItem.awayTeam)) return false;
  return true;
}

export default function SeriesTrackerView() {
  const { profile } = useAuth();
  const { pool, settingsForPool, memberList, updatePoolSettings } = usePool();
  const { series, seriesByRound, roundSummaries } = usePlayoffData();
  const settings = settingsForPool(pool);
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeRound, setActiveRound] = useState("round_1");
  const [showCommissionerControls, setShowCommissionerControls] = useState(false);
  const {
    picksBySeriesId,
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
  const [activeSeriesId, setActiveSeriesId] = useState("");
  const canViewOtherBoards = areRoundPicksPublic(activeSeries, activeRound, settings);
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
  const roundLocks = settings.round_locks ?? {};
  const isCommissioner = pool?.admin_id === profile?.id;
  const validSavedPickCount = useMemo(
    () =>
      series.filter(
        (seriesItem) => isSeriesReadyForPicks(seriesItem) && visiblePicksBySeriesId[seriesItem.id]?.winnerTeamId
      ).length,
    [series, visiblePicksBySeriesId]
  );
  const activeRoundPickedCount = useMemo(
    () => activeSeries.filter((seriesItem) => visiblePicksBySeriesId[seriesItem.id]?.winnerTeamId).length,
    [activeSeries, visiblePicksBySeriesId]
  );
  const currentSeries =
    activeSeries.find((seriesItem) => seriesItem.id === activeSeriesId) ?? activeSeries[0] ?? null;

  useEffect(() => {
    if (!activeSeries.length) {
      setActiveSeriesId("");
      return;
    }
    if (!activeSeries.some((seriesItem) => seriesItem.id === activeSeriesId)) {
      setActiveSeriesId(activeSeries[0].id);
    }
  }, [activeSeries, activeSeriesId]);

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

  function goToSeries(direction) {
    if (!activeSeries.length || !currentSeries) return;
    const currentIndex = activeSeries.findIndex((seriesItem) => seriesItem.id === currentSeries.id);
    const nextIndex = (currentIndex + direction + activeSeries.length) % activeSeries.length;
    setActiveSeriesId(activeSeries[nextIndex].id);
  }

  return (
    <div className="nba-shell">
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
            <span className="chip">{isViewingCurrentUser ? pickedSeriesCount : validSavedPickCount} saved picks</span>
          </div>
        </div>

        <div className="detail-card inset-card">
          <div className="nba-series-progress-strip">
            <span className="chip">{activeRoundPickedCount} of {activeSeries.length} picked</span>
            <span className="micro-copy">
              {loading
                ? "Loading picks…"
                : isViewingCurrentUser
                  ? `${formatSavedLabel(lastSavedAt, persistenceMode, saveState)}. Work the round one series at a time.`
                  : `${selectedViewer?.name ?? "This entry"} has ${scoreSummary.totalPoints} points with ${scoreSummary.exact} exact calls.`}
            </span>
          </div>
        </div>

        {currentSeries ? (
          <>
            <div className="nba-series-selector-bar">
              <div className="nba-series-selector-head">
                <span className="micro-label">Series in this round</span>
                <p>{formatSeriesSlotLabel(currentSeries)}</p>
              </div>
              <div className="nba-series-selector-actions">
                <button type="button" className="secondary-button" onClick={() => goToSeries(-1)}>
                  Previous
                </button>
                <select
                  className="nav-select"
                  value={currentSeries.id}
                  onChange={(event) => setActiveSeriesId(event.target.value)}
                  aria-label="Choose a series"
                >
                  {activeSeries.map((seriesItem) => {
                    const homeDisplay = formatSeriesTeam(seriesItem.homeTeam);
                    const awayDisplay = formatSeriesTeam(seriesItem.awayTeam);
                    const isPicked = isSeriesReadyForPicks(seriesItem) && Boolean(visiblePicksBySeriesId[seriesItem.id]?.winnerTeamId);
                    return (
                      <option key={seriesItem.id} value={seriesItem.id}>
                        {seriesItem.homeTeam.seed} {homeDisplay.short} vs {seriesItem.awayTeam.seed} {awayDisplay.short} {isPicked ? "• picked" : "• open"}
                      </option>
                    );
                  })}
                </select>
                <button type="button" className="secondary-button" onClick={() => goToSeries(1)}>
                  Next
                </button>
              </div>
            </div>

            <div className="nba-series-pick-grid nba-series-pick-grid-single">
          {(() => {
            const seriesItem = currentSeries;
            const rawPick = visiblePicksBySeriesId[seriesItem.id];
            const isSeriesReady = isSeriesReadyForPicks(seriesItem);
            const pick = isSeriesReady ? rawPick : null;
            const score = scoreSeriesPick(pick, seriesItem, settings);
            const marketFavorite =
              seriesItem.market.homeWinPct >= seriesItem.market.awayWinPct
                ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.market.homeWinPct}%`
                : `${seriesItem.awayTeam.abbreviation} ${seriesItem.market.awayWinPct}%`;
            const modelLean =
              seriesItem.model.homeWinPct >= seriesItem.model.awayWinPct
                ? `${seriesItem.homeTeam.abbreviation} ${seriesItem.model.homeWinPct}%`
                : `${seriesItem.awayTeam.abbreviation} ${seriesItem.model.awayWinPct}%`;
            const homeDisplay = formatSeriesTeam(seriesItem.homeTeam);
            const awayDisplay = formatSeriesTeam(seriesItem.awayTeam);
            const matchupLabel = `${homeDisplay.primary} vs ${awayDisplay.primary}`;
            const isEditable = isViewingCurrentUser && !roundLocks[seriesItem.roundKey] && isSeriesReady;
            const setupNote =
              getSeriesPlaceholderCopy(seriesItem.homeTeam) || getSeriesPlaceholderCopy(seriesItem.awayTeam)
                ? seriesItem.nextGame
                : `${seriesItem.homeTeam.abbreviation} ${seriesItem.market.homeWinPct}% market · ${seriesItem.awayTeam.abbreviation} ${seriesItem.market.awayWinPct}%`;

            return (
              <article className="nba-pick-card" key={seriesItem.id}>
                <div className="nba-series-head">
                  <div>
                    <h3>{matchupLabel}</h3>
                    <span className="micro-copy nba-series-head-note">{setupNote}</span>
                  </div>
                  <OutcomeChip score={score} />
                </div>

                <div className="nba-series-meta-grid">
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

                <div className="nba-team-pick-grid">
                  {[seriesItem.homeTeam, seriesItem.awayTeam].map((team) => {
                    const selected = pick?.winnerTeamId === team.id;
                    const isLocked = Boolean(roundLocks[seriesItem.roundKey]);
                    const teamDisplay = formatSeriesTeam(team);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        className={selected ? "nba-team-pick active" : "nba-team-pick"}
                        disabled={!isEditable}
                        onClick={() => saveSeriesPick(seriesItem.id, team.id, pick?.games ?? 6, seriesItem.roundKey)}
                      >
                        <span className="micro-label">Seed {team.seed}</span>
                        <strong>{teamDisplay.primary}</strong>
                        <span>{teamDisplay.secondary}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="nba-games-picker">
                  <div className="nba-games-picker-main">
                    <span className="micro-label">Series length</span>
                    <div className="nba-games-options">
                      {GAME_OPTIONS.map((games) => (
                        <button
                          key={games}
                          type="button"
                          className={pick?.games === games ? "nba-games-option active" : "nba-games-option"}
                          disabled={!isEditable || !pick?.winnerTeamId}
                          onClick={() => saveSeriesPick(seriesItem.id, pick?.winnerTeamId ?? seriesItem.homeTeam.id, games, seriesItem.roundKey)}
                        >
                          {games}
                        </button>
                      ))}
                    </div>
                    {!pick?.winnerTeamId ? <p className="micro-copy">Choose a winner first, then set the length.</p> : null}
                  </div>
                  <div className="nba-games-picker-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!isEditable}
                      onClick={() => clearSeriesPick(seriesItem.id)}
                    >
                      Clear pick
                    </button>
                  </div>
                </div>

                <div className="nba-pick-footer">
                  <div>
                    <span className="micro-label">{isViewingCurrentUser ? "Your pick" : `${selectedViewer?.name ?? "Their"} pick`}</span>
                    <p>
                      {pick
                        ? `${pick.winnerTeamId === seriesItem.homeTeam.id ? homeDisplay.primary : awayDisplay.primary} in ${pick.games}`
                        : "No pick saved yet"}
                    </p>
                  </div>
                </div>
                {roundLocks[seriesItem.roundKey] ? (
                  <div className="nba-lock-banner">
                    Commissioner has locked this round. Picks are read-only until it is reopened.
                  </div>
                ) : !isSeriesReady ? (
                  <div className="nba-lock-banner">
                    This matchup becomes pickable once the current round is set.
                  </div>
                ) : !isViewingCurrentUser ? (
                  <div className="nba-lock-banner">
                    You are viewing {selectedViewer?.name ?? "another entry"}'s public card. This view is read-only.
                  </div>
                ) : null}
              </article>
            );
          })()}
            </div>
          </>
        ) : null}

        <div className="nba-round-footer-nav">
          <div className="nba-round-footer-head">
            <span className="micro-label">Round navigation</span>
            <p>Lower-priority controls for jumping ahead once later rounds open up.</p>
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
                    <small>{formatRoundStatus(round, availableRoundKey, settings)}</small>
                  </button>
                </div>
              );
            })}
          </div>

          {isCommissioner ? (
            <div className="nba-commissioner-tools">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCommissionerControls((current) => !current)}
              >
                {showCommissionerControls ? "Hide commissioner controls" : "Commissioner controls"}
              </button>

              {showCommissionerControls ? (
                <div className="nba-round-lock-row">
                  {roundSummaries.map((round) => (
                    <button
                      key={round.key}
                      type="button"
                      className={roundLocks[round.key] ? "nba-lock-button locked" : "nba-lock-button"}
                      onClick={() => setRoundLock(round.key, !roundLocks[round.key])}
                    >
                      {roundLocks[round.key] ? `Unlock ${round.shortLabel}` : `Lock ${round.shortLabel}`}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

    </div>
  );
}
