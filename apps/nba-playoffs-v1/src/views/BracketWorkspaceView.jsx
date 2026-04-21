import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useBackendSeriesSchedule } from "../hooks/useBackendSeriesSchedule";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { formatProbabilityMainFreshness, formatProbabilityMainLabel } from "../lib/probabilityInputs";
import { areRoundPicksPublic, isSeriesPickPublic } from "../lib/pickVisibility";
import { summarizeSeriesMarket } from "../lib/seriesPickem";
import { getTeamPalette } from "../../../../packages/shared/src/themes/teamColorBanks.js";

const EAST_SEMIS = [
  { id: "east-sf-1", sources: ["east-r1-1", "east-r1-4"] },
  { id: "east-sf-2", sources: ["east-r1-3", "east-r1-2"] },
];

const WEST_SEMIS = [
  { id: "west-sf-1", sources: ["west-r1-1", "west-r1-4"] },
  { id: "west-sf-2", sources: ["west-r1-3", "west-r1-2"] },
];

const EAST_FINALS = [{ id: "east-finals", sources: ["east-sf-1", "east-sf-2"] }];
const WEST_FINALS = [{ id: "west-finals", sources: ["west-sf-1", "west-sf-2"] }];
const NBA_FINALS = [{ id: "nba-finals", sources: ["east-finals", "west-finals"] }];
const ROUND_ONE_ORDER = ["1-8", "4-5", "3-6", "2-7"];

function getWinningTeamSlot(seriesItem, slot) {
  if (!seriesItem || !seriesItem.winnerTeamId) return null;
  if (seriesItem.homeTeam?.abbreviation === "TBD" || seriesItem.awayTeam?.abbreviation === "TBD") return null;
  const pickedTeam = seriesItem.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  if (!pickedTeam || pickedTeam.abbreviation === "TBD") return null;
  return {
    id: pickedTeam.id,
    abbreviation: pickedTeam.abbreviation === "TBD" ? "" : pickedTeam.abbreviation,
    detail: "",
    active: false,
    slot,
    palette: getTeamPalette("nba", pickedTeam),
  };
}

function getRoundOneSlot(seriesItem, pick, side, masked = false) {
  if (!seriesItem) return { id: `${side}-empty`, abbreviation: "", active: false, slot: side };
  const team = side === "top" ? seriesItem.homeTeam : seriesItem.awayTeam;
  const canShowSelection = seriesItem.homeTeam?.abbreviation !== "TBD" && seriesItem.awayTeam?.abbreviation !== "TBD";
  const isSelected = canShowSelection && pick?.winnerTeamId === team.id;
  return {
    id: team.id,
    abbreviation: team.abbreviation === "TBD" ? "" : team.abbreviation,
    detail: isSelected && pick?.games ? `IN ${pick.games}` : "",
    active: isSelected,
    masked,
    slot: side,
    palette: getTeamPalette("nba", team),
  };
}

function formatPickLabel(seriesItem, pick) {
  if (!seriesItem || !pick?.winnerTeamId || !pick?.games) return "No pick yet";
  if (seriesItem.homeTeam?.abbreviation === "TBD" || seriesItem.awayTeam?.abbreviation === "TBD") return "No pick yet";
  const pickedTeam = pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  if (!pickedTeam || pickedTeam.abbreviation === "TBD") return "No pick yet";
  return `${pickedTeam.abbreviation} in ${pick.games}`;
}

function buildSelectedPickBody(seriesItem, pick, allPicksByUser, memberList) {
  if (!pick?.winnerTeamId || !pick?.games) {
    return "Choose a team, then choose the number of games it takes them to win the series.";
  }
  const pickedTeam = pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  const marketSummary = summarizeSeriesMarket(allPicksByUser, memberList, seriesItem);
  const sameWinnerCount =
    pick.winnerTeamId === seriesItem.homeTeam.id ? marketSummary.homeBackers : marketSummary.awayBackers;
  const total = marketSummary.total;
  const fieldRead = total
    ? sameWinnerCount === total
      ? `Room lean: all visible picks are on ${pickedTeam.abbreviation}.`
      : `Room lean: ${sameWinnerCount} of ${total} visible picks are on ${pickedTeam.abbreviation}.`
    : "No public room lean yet.";
  const gamesRead = marketSummary.leadingGames
    ? `Most common series length is ${marketSummary.leadingGames}.`
    : "";
  return [`You chose ${pickedTeam.abbreviation} in ${pick.games}.`, fieldRead, gamesRead].filter(Boolean).join(" ");
}

function formatLean(seriesItem, source) {
  if (!seriesItem || !source) return "Waiting on matchup";
  if ((source.homeWinPct ?? 0) === (source.awayWinPct ?? 0)) return "Even";
  return source.homeWinPct >= source.awayWinPct
    ? `${seriesItem.homeTeam.abbreviation} ${source.homeWinPct}%`
    : `${seriesItem.awayTeam.abbreviation} ${source.awayWinPct}%`;
}

function buildDisplayName(entry, seriesItem) {
  const top = entry.top.abbreviation || "";
  const bottom = entry.bottom.abbreviation || "";
  return [top, bottom].filter(Boolean).join(" vs ");
}

function canPickSeries(seriesItem, currentRoundKey, isViewingCurrentUser) {
  if (!seriesItem || !isViewingCurrentUser) return false;
  if (seriesItem.roundKey !== currentRoundKey) return false;
  if (seriesItem.status === "completed") return false;
  if (!seriesItem.homeTeam || !seriesItem.awayTeam) return false;
  if (seriesItem.homeTeam.abbreviation === "TBD" || seriesItem.awayTeam.abbreviation === "TBD") return false;
  return true;
}

function hasSeriesTipoffPassed(seriesItem, backendSchedule) {
  const lockAt = backendSchedule?.lockAt ?? seriesItem?.schedule?.lockAt ?? null;
  if (!lockAt) return false;
  const date = new Date(lockAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() >= date.getTime();
}

function hasSeriesTipoffLocked(seriesItem, settings, backendSchedule) {
  if (settings?.allow_edits_until_tipoff === false) return false;
  return hasSeriesTipoffPassed(seriesItem, backendSchedule);
}

function isSeriesPublic(seriesItem, settings, backendSchedule) {
  if (!seriesItem) return false;
  const roundLocks = settings?.round_locks ?? {};
  if (roundLocks[seriesItem.roundKey]) return true;
  const explicitLockState = hasSeriesTipoffPassed(seriesItem, backendSchedule);
  if (explicitLockState) return true;
  const lockAt = backendSchedule?.lockAt ?? seriesItem?.schedule?.lockAt ?? null;
  if (lockAt) return false;
  return isSeriesPickPublic(seriesItem, settings);
}

function getSeedOrderValue(seriesItem) {
  const matchup = `${seriesItem.homeSeed}-${seriesItem.awaySeed}`;
  const orderIndex = ROUND_ONE_ORDER.indexOf(matchup);
  return orderIndex === -1 ? ROUND_ONE_ORDER.length : orderIndex;
}

function BracketPopover({ detail, placement, onClose, onPickGames, onClearSelection }) {
  if (!detail) return null;

  if (detail.mode === "selector") {
    return (
      <div className={`nba-bracket-popover nba-bracket-popover-${placement}`}>
        <span className="micro-label">{detail.title}</span>
        <p className="nba-bracket-popover-copy">{detail.body}</p>
        <div className="nba-bracket-games-picker" role="group" aria-label={`Choose games for ${detail.title}`}>
          {[4, 5, 6, 7].map((games) => (
            <button
              key={games}
              type="button"
              className={`nba-bracket-games-pill ${detail.currentGames === games ? "active" : ""}`}
              style={detail.teamPalette ? {
                "--slot-primary": detail.teamPalette.primary,
                "--slot-primary-dark": detail.teamPalette.primaryDark,
                "--slot-secondary": detail.teamPalette.secondary,
                "--slot-text": detail.teamPalette.text,
                "--slot-border": detail.teamPalette.border,
              } : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onPickGames(games);
              }}
            >
              {games}
            </button>
          ))}
        </div>
        {detail.canClear ? (
          <button
            type="button"
            className="nba-bracket-clear-link"
            onClick={(event) => {
              event.stopPropagation();
              onClearSelection();
            }}
          >
            Clear Pick
          </button>
        ) : (
          <button
            type="button"
            className="nba-bracket-clear-link"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`nba-bracket-popover nba-bracket-popover-${placement}`}>
      <span className="micro-label">{detail.title}</span>
      {detail.body ? <p className="nba-bracket-popover-copy">{detail.body}</p> : null}
      {detail.showGrid ? (
        <div className="nba-bracket-popover-grid">
          <div>
            <span className="micro-label">Current pick</span>
            <p>{detail.pickLabel}</p>
          </div>
          <div>
            <span className="micro-label">Market lean</span>
            <p>{detail.marketLean}</p>
            {detail.marketMeta ? <span className="micro-copy">{detail.marketMeta}</span> : null}
          </div>
          <div>
            <span className="micro-label">Model lean</span>
            <p>{detail.modelLean}</p>
            {detail.modelMeta ? <span className="micro-copy">{detail.modelMeta}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BracketSeries({
  entry,
  side,
  roundKey,
  rowStart,
  style,
  isFocused,
  onFocus,
  onBlurSeries,
  detail,
  interactive,
  onSelectTeam,
  selectionState,
  onPickGames,
  onCancelSelection,
  onClearSelection,
}) {
  const { top, bottom } = entry;
  const isMasked = Boolean(entry.masked);
  const selectorDetail = selectionState
    ? {
        mode: "selector",
        title: selectionState.teamAbbreviation,
        body: "Pick the number of games it takes this team to win the series.",
        currentGames: selectionState.currentGames,
        canClear: true,
        teamPalette: selectionState.teamPalette,
      }
    : null;
  const activeDetail = selectorDetail ?? detail;
  const horizontalPlacement = side === "west" ? "west" : side === "center" ? "center" : "east";
  const verticalPlacement = rowStart >= 6 ? "north" : "south";
  const placement = `${horizontalPlacement}-${verticalPlacement}`;

  return (
    <div
      className={`nba-bracket-series ${side} ${roundKey} ${isFocused ? "is-focused" : ""}`}
      style={style}
      onMouseEnter={() => onFocus(entry.id)}
      onMouseLeave={onBlurSeries}
    >
      {isFocused ? (
        <BracketPopover
          detail={activeDetail}
          placement={placement}
          onClose={onCancelSelection}
          onPickGames={onPickGames}
          onClearSelection={onClearSelection}
        />
      ) : null}
      <button
        type="button"
        className={`${top.active ? "nba-bracket-line active" : "nba-bracket-line"} ${interactive ? "is-pickable" : "is-static"} ${isMasked ? "is-masked" : ""} ${top.palette && !isMasked ? "has-team-palette" : ""}`}
        style={top.palette && !isMasked ? {
          "--slot-primary": top.palette.primary,
          "--slot-primary-dark": top.palette.primaryDark,
          "--slot-secondary": top.palette.secondary,
          "--slot-text": top.palette.text,
          "--slot-border": top.palette.border,
        } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!interactive) {
            onFocus(entry.id);
            return;
          }
          onSelectTeam(top.id, top.abbreviation);
        }}
        disabled={!interactive}
      >
        <span>{top.abbreviation}</span>
        {top.detail ? <em>{top.detail}</em> : null}
      </button>
      <button
        type="button"
        className={`${bottom.active ? "nba-bracket-line active" : "nba-bracket-line"} ${interactive ? "is-pickable" : "is-static"} ${isMasked ? "is-masked" : ""} ${bottom.palette && !isMasked ? "has-team-palette" : ""}`}
        style={bottom.palette && !isMasked ? {
          "--slot-primary": bottom.palette.primary,
          "--slot-primary-dark": bottom.palette.primaryDark,
          "--slot-secondary": bottom.palette.secondary,
          "--slot-text": bottom.palette.text,
          "--slot-border": bottom.palette.border,
        } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!interactive) {
            onFocus(entry.id);
            return;
          }
          onSelectTeam(bottom.id, bottom.abbreviation);
        }}
        disabled={!interactive}
      >
        <span>{bottom.abbreviation}</span>
        {bottom.detail ? <em>{bottom.detail}</em> : null}
      </button>
    </div>
  );
}

function BracketColumn({
  title,
  seriesList,
  side,
  roundKey,
  rowStarts,
  focusedSeriesId,
  onFocus,
  onBlurSeries,
  detailById,
  interactiveIds,
  selectionState,
  onSelectTeam,
  onPickGames,
  onCancelSelection,
  onClearSelection,
}) {
  return (
    <div className={`nba-bracket-column ${side}`}>
      <span className="micro-label">{title}</span>
      <div className={`nba-bracket-column-stack ${side}`}>
        {seriesList.map((entry, index) => (
          <BracketSeries
            key={entry.id}
            entry={entry}
            side={side}
            roundKey={roundKey}
            rowStart={rowStarts[index]}
            style={{ gridRow: `${rowStarts[index]} / span 2` }}
            isFocused={focusedSeriesId === entry.id}
            onFocus={onFocus}
            onBlurSeries={onBlurSeries}
            detail={detailById[entry.id]}
            interactive={interactiveIds.has(entry.id)}
            selectionState={selectionState?.seriesId === entry.id ? selectionState : null}
            onSelectTeam={(teamId, teamAbbreviation) => onSelectTeam(entry.id, teamId, teamAbbreviation)}
            onPickGames={(games) => onPickGames(entry.id, games)}
            onCancelSelection={onCancelSelection}
            onClearSelection={onClearSelection}
          />
        ))}
      </div>
    </div>
  );
}

export default function BracketWorkspaceView() {
  const { series, seriesByConference, currentRound, seriesByRound } = usePlayoffData();
  const { memberList, pool, settingsForPool } = usePool();
  const settings = settingsForPool(pool);
  const { scheduleBySeriesId } = useBackendSeriesSchedule(pool?.id);
  const { picksBySeriesId, allPicksByUser, saveSeriesPick, clearSeriesPick } = useSeriesPickem(series);
  const currentMember = memberList.find((member) => member.isCurrentUser) ?? memberList[0] ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedSeriesId, setFocusedSeriesId] = useState(null);
  const [selectionState, setSelectionState] = useState(null);
  const activeSeries = seriesByRound[currentRound.key] ?? [];
  const canViewMatrix = areRoundPicksPublic(activeSeries, currentRound.key, settings);
  const roundLocks = settings.round_locks ?? {};
  const seriesUnlockOverrides = settings.series_unlock_overrides ?? {};
  const requestedViewerId = searchParams.get("viewer") ?? "";
  const availableViewers = memberList.filter((member) => member.id !== currentMember?.id);
  const selectedViewer = availableViewers.find((member) => member.id === requestedViewerId) ?? null;
  const isViewingCurrentUser = !selectedViewer;
  const publicSeriesIds = useMemo(
    () =>
      new Set(
        series
          .filter((seriesItem) => isSeriesPublic(seriesItem, settings, scheduleBySeriesId[seriesItem.id]))
          .map((seriesItem) => seriesItem.id)
      ),
    [scheduleBySeriesId, series, settings]
  );

  const effectiveSelectedMemberId = selectedViewer?.id ?? currentMember?.id ?? memberList[0]?.id ?? "";
  const selectedPicksBySeriesId = useMemo(() => {
    if (!effectiveSelectedMemberId) return picksBySeriesId;
    const sourcePicks =
      effectiveSelectedMemberId === currentMember?.id
        ? picksBySeriesId
        : allPicksByUser[effectiveSelectedMemberId] ?? {};
    if (isViewingCurrentUser) return sourcePicks;
    return Object.fromEntries(
      Object.entries(sourcePicks).filter(([seriesId]) => publicSeriesIds.has(seriesId))
    );
  }, [allPicksByUser, currentMember?.id, effectiveSelectedMemberId, isViewingCurrentUser, picksBySeriesId, publicSeriesIds]);

  const seriesById = useMemo(
    () => Object.fromEntries(series.map((seriesItem) => [seriesItem.id, seriesItem])),
    [series]
  );

  const eastRoundOne = [...seriesByConference.East.filter((seriesItem) => seriesItem.roundKey === "round_1")].sort(
    (a, b) => getSeedOrderValue(a) - getSeedOrderValue(b)
  );
  const westRoundOne = [...seriesByConference.West.filter((seriesItem) => seriesItem.roundKey === "round_1")].sort(
    (a, b) => getSeedOrderValue(a) - getSeedOrderValue(b)
  );

  const eastRoundOneDisplay = eastRoundOne.map((seriesItem) => ({
    id: seriesItem.id,
    masked: false,
    top: getRoundOneSlot(
      seriesItem,
      selectedPicksBySeriesId[seriesItem.id],
      "top",
      false
    ),
    bottom: getRoundOneSlot(
      seriesItem,
      selectedPicksBySeriesId[seriesItem.id],
      "bottom",
      false
    ),
  }));

  const westRoundOneDisplay = westRoundOne.map((seriesItem) => ({
    id: seriesItem.id,
    masked: false,
    top: getRoundOneSlot(
      seriesItem,
      selectedPicksBySeriesId[seriesItem.id],
      "top",
      false
    ),
    bottom: getRoundOneSlot(
      seriesItem,
      selectedPicksBySeriesId[seriesItem.id],
      "bottom",
      false
    ),
  }));

  const buildProjectedRound = (definition) =>
    definition.map((entry) => ({
      id: entry.id,
      top: getWinningTeamSlot(seriesById[entry.sources[0]], "top") ?? {
        id: `${entry.id}-top`,
        abbreviation: "",
        active: false,
        slot: "top",
      },
      bottom: getWinningTeamSlot(seriesById[entry.sources[1]], "bottom") ?? {
        id: `${entry.id}-bottom`,
        abbreviation: "",
        active: false,
        slot: "bottom",
      },
    }));

  const eastSemisDisplay = buildProjectedRound(EAST_SEMIS);
  const westSemisDisplay = buildProjectedRound(WEST_SEMIS);
  const eastFinalsDisplay = buildProjectedRound(EAST_FINALS);
  const westFinalsDisplay = buildProjectedRound(WEST_FINALS);
  const nbaFinalsDisplay = buildProjectedRound(NBA_FINALS);
  const allDisplayEntries = [
    ...eastRoundOneDisplay,
    ...westRoundOneDisplay,
    ...eastSemisDisplay,
    ...westSemisDisplay,
    ...eastFinalsDisplay,
    ...westFinalsDisplay,
    ...nbaFinalsDisplay,
  ];
  const displayEntryById = Object.fromEntries(allDisplayEntries.map((entry) => [entry.id, entry]));
  const activeFocusedSeriesId = displayEntryById[focusedSeriesId] ? focusedSeriesId : selectionState?.seriesId ?? null;
  const interactiveSeriesIds = new Set(
    series
      .filter((seriesItem) => {
        if (!canPickSeries(seriesItem, currentRound.key, isViewingCurrentUser)) return false;
        const lockedByRound = Boolean(roundLocks[seriesItem.roundKey]);
        const lockedByTipoff = hasSeriesTipoffLocked(seriesItem, settings, scheduleBySeriesId[seriesItem.id]);
        const unlockedForEveryone = Boolean(seriesUnlockOverrides[seriesItem.id]);
        return !lockedByRound && (!lockedByTipoff || unlockedForEveryone);
      })
      .map((seriesItem) => seriesItem.id)
  );
  const detailById = Object.fromEntries(
    allDisplayEntries.map((entry) => {
      const seriesItem = seriesById[entry.id] ?? null;
      const pick = selectedPicksBySeriesId[entry.id] ?? null;
      const isInteractive = interactiveSeriesIds.has(entry.id);
      const actualSeriesPublic = Boolean(seriesItem && isSeriesPublic(seriesItem, settings, scheduleBySeriesId[seriesItem.id]));
      const isPublicSeries = !selectedViewer ? actualSeriesPublic : actualSeriesPublic;
      const isCurrentRoundSeries = Boolean(seriesItem && seriesItem.roundKey === currentRound.key);
      const isLockedCurrentSeries = Boolean(seriesItem && isCurrentRoundSeries && !isInteractive);
      const isFutureSeries = !seriesItem || !isCurrentRoundSeries;
      return [
        entry.id,
        !isViewingCurrentUser && seriesItem && !isPublicSeries
          ? {
              title: buildDisplayName(entry, seriesItem),
              body: "This pick becomes visible once that series locks or Game 1 begins.",
              showGrid: false,
            }
          : !isViewingCurrentUser && seriesItem && isPublicSeries
            ? {
                title: buildDisplayName(entry, seriesItem),
                pickLabel: formatPickLabel(seriesItem, pick),
                marketLean: formatLean(seriesItem, seriesItem?.market),
                modelLean: formatLean(seriesItem, seriesItem?.model),
                marketMeta: [formatProbabilityMainLabel(seriesItem?.market), formatProbabilityMainFreshness(seriesItem?.market)].filter(Boolean).join(" · "),
                modelMeta: [formatProbabilityMainLabel(seriesItem?.model), formatProbabilityMainFreshness(seriesItem?.model)].filter(Boolean).join(" · "),
                showGrid: true,
              }
          : isViewingCurrentUser && seriesItem && pick?.winnerTeamId && actualSeriesPublic
            ? {
                title: buildDisplayName(entry, seriesItem),
                body: buildSelectedPickBody(seriesItem, pick, allPicksByUser, memberList),
                pickLabel: formatPickLabel(seriesItem, pick),
                marketLean: formatLean(seriesItem, seriesItem?.market),
                modelLean: formatLean(seriesItem, seriesItem?.model),
                marketMeta: [formatProbabilityMainLabel(seriesItem?.market), formatProbabilityMainFreshness(seriesItem?.market)].filter(Boolean).join(" · "),
                modelMeta: [formatProbabilityMainLabel(seriesItem?.model), formatProbabilityMainFreshness(seriesItem?.model)].filter(Boolean).join(" · "),
                showGrid: true,
              }
          : isViewingCurrentUser && seriesItem && pick?.winnerTeamId
            ? {
                title: buildDisplayName(entry, seriesItem),
                body: "",
                pickLabel: formatPickLabel(seriesItem, pick),
                marketLean: formatLean(seriesItem, seriesItem?.market),
                modelLean: formatLean(seriesItem, seriesItem?.model),
                marketMeta: [formatProbabilityMainLabel(seriesItem?.market), formatProbabilityMainFreshness(seriesItem?.market)].filter(Boolean).join(" · "),
                modelMeta: [formatProbabilityMainLabel(seriesItem?.model), formatProbabilityMainFreshness(seriesItem?.model)].filter(Boolean).join(" · "),
                showGrid: true,
              }
          : isViewingCurrentUser && isLockedCurrentSeries
            ? {
                title: buildDisplayName(entry, seriesItem),
                body: "This series is locked. Hover here to follow the market and model read while the result plays out.",
                pickLabel: formatPickLabel(seriesItem, pick),
                marketLean: formatLean(seriesItem, seriesItem?.market),
                modelLean: formatLean(seriesItem, seriesItem?.model),
                marketMeta: [formatProbabilityMainLabel(seriesItem?.market), formatProbabilityMainFreshness(seriesItem?.market)].filter(Boolean).join(" · "),
                modelMeta: [formatProbabilityMainLabel(seriesItem?.model), formatProbabilityMainFreshness(seriesItem?.model)].filter(Boolean).join(" · "),
                showGrid: true,
              }
          :
        isFutureSeries
          ? {
              title: buildDisplayName(entry, seriesItem) || "Series TBD",
              body: seriesItem
                ? isViewingCurrentUser
                  ? "This matchup becomes pickable once the current round is set."
                  : "This matchup fills in once the current round is decided."
                : isViewingCurrentUser
                  ? "This series is still TBD until the current round settles."
                  : "This series stays unresolved until the current round settles.",
              showGrid: false,
            }
          : {
              title: buildDisplayName(entry, seriesItem),
              pickLabel: formatPickLabel(seriesItem, pick),
              marketLean: formatLean(seriesItem, seriesItem?.market),
              modelLean: formatLean(seriesItem, seriesItem?.model),
              marketMeta: [formatProbabilityMainLabel(seriesItem?.market), formatProbabilityMainFreshness(seriesItem?.market)].filter(Boolean).join(" · "),
              modelMeta: [formatProbabilityMainLabel(seriesItem?.model), formatProbabilityMainFreshness(seriesItem?.model)].filter(Boolean).join(" · "),
              showGrid: true,
            },
      ];
    })
  );

  const eastLayout = [
    { title: "Round 1", seriesList: eastRoundOneDisplay, side: "east", roundKey: "round-1", rowStarts: [1, 4, 7, 10] },
    { title: "Semifinals", seriesList: eastSemisDisplay, side: "east", roundKey: "semis", rowStarts: [2, 8] },
    { title: "Conference Finals", seriesList: eastFinalsDisplay, side: "east", roundKey: "finals", rowStarts: [5] },
  ];

  const westLayout = [
    { title: "Conference Finals", seriesList: westFinalsDisplay, side: "west", roundKey: "finals", rowStarts: [5] },
    { title: "Semifinals", seriesList: westSemisDisplay, side: "west", roundKey: "semis", rowStarts: [2, 8] },
    { title: "Round 1", seriesList: westRoundOneDisplay, side: "west", roundKey: "round-1", rowStarts: [1, 4, 7, 10] },
  ];

  function handleViewerChange(event) {
    const nextViewerId = event.target.value;
    event.target.blur();
    setSelectionState(null);
    setFocusedSeriesId(null);
    if (!nextViewerId) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ viewer: nextViewerId }, { replace: true });
  }

  function handleSelectTeam(seriesId, teamId, teamAbbreviation) {
    const currentPick = selectedPicksBySeriesId[seriesId] ?? null;
    setFocusedSeriesId(seriesId);
    setSelectionState({
      seriesId,
      teamId,
      teamAbbreviation,
      teamPalette: getTeamPalette("nba", seriesById[seriesId]?.homeTeam?.id === teamId ? seriesById[seriesId]?.homeTeam : seriesById[seriesId]?.awayTeam ?? teamId),
      currentGames: currentPick?.winnerTeamId === teamId ? currentPick.games : null,
      hasExistingPick: Boolean(currentPick?.winnerTeamId),
    });
  }

  async function handlePickGames(seriesId, games) {
    const seriesItem = seriesById[seriesId];
    if (!seriesItem || !selectionState?.teamId) return;
    await saveSeriesPick(seriesId, selectionState.teamId, games, seriesItem.roundKey);
    setSelectionState(null);
    setFocusedSeriesId(seriesId);
  }

  function handleBlurSeries() {
    if (selectionState) return;
    setFocusedSeriesId(null);
  }

  async function handleClearSelection() {
    if (!selectionState?.seriesId) return;
    if (!selectionState.hasExistingPick) {
      setSelectionState(null);
      return;
    }
    await clearSeriesPick(selectionState.seriesId);
    setSelectionState(null);
    setFocusedSeriesId(selectionState.seriesId);
  }

  useEffect(() => {
    if (!isViewingCurrentUser) {
      setSelectionState(null);
    }
  }, [isViewingCurrentUser]);

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header nba-bracket-hero-header">
          <div className="nba-bracket-hero-copy">
            <h2>{isViewingCurrentUser ? "Make Your Picks" : `${selectedViewer?.name ?? "This entry"}'s Bracket`}</h2>
            <p className="nba-bracket-hero-body">
              {isViewingCurrentUser
                ? <>Choose winners for the current round directly in the bracket.<br />Hover for context, then click a team and choose 4-7 games to save the series.<br />Future rounds stay locked until this round is set.</>
                : <>Locked series are visible here as they tip.<br />Unlocked series stay muted until their own Game 1 begins.</>}
            </p>
          </div>
          <div className="nba-bracket-tool-grid">
            <span className="tooltip-wrap tooltip-wrap-inline nba-bracket-tool-slot nba-bracket-tool-slot-series">
              <Link className="secondary-button bracket-tool-button bracket-tool-button-series" to="/series">
                Series View
              </Link>
              <span className="tooltip-bubble">Use the more detailed series-by-series picker if you want a slower, guided selection flow.</span>
            </span>
            <span className="tooltip-wrap tooltip-wrap-inline nba-bracket-tool-slot nba-bracket-tool-slot-reports">
              <Link className="secondary-button bracket-tool-button bracket-tool-button-reports" to="/reports">
                Reports Page
              </Link>
              <span className="tooltip-bubble">Open the deeper probability, leverage, and pool-reading tools without leaving your picks behind.</span>
            </span>
            <span className="tooltip-wrap tooltip-wrap-inline nba-bracket-tool-slot nba-bracket-tool-slot-matrix">
              <Link className="secondary-button bracket-tool-button bracket-tool-button-matrix" to="/matrix">
                Picks Matrix
              </Link>
              <span className="tooltip-bubble">See the room at once. Locked or tipped series show live; untouched series stay hidden.</span>
            </span>
          </div>
        </div>
        <div className="nba-bracket-hero-divider" aria-hidden="true" />
        <div className="nba-bracket-toolbar-row">
          <span className="tooltip-wrap tooltip-wrap-inline nba-bracket-viewer-pill-wrap">
            <label className="nba-bracket-viewer-pill">
              <select
                className="nba-bracket-pill-select"
                aria-label="Choose bracket view"
                value={isViewingCurrentUser ? "" : effectiveSelectedMemberId}
                onChange={handleViewerChange}
              >
                <option value="">My Bracket</option>
                {availableViewers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="tooltip-bubble">Switch between your bracket and any pool entry. Locked series reveal one by one as they go live.</span>
          </span>
        </div>

        <div className="nba-bracket-simple-shell">
        <div className="nba-bracket-simple">
          <section className="nba-bracket-side">
            <div className="nba-bracket-side-header">
              <span className="label">East</span>
            </div>
            <div className="nba-bracket-side-grid">
              {eastLayout.map((column) => (
                <BracketColumn
                  key={column.title}
                  {...column}
                  focusedSeriesId={activeFocusedSeriesId}
                  onFocus={setFocusedSeriesId}
                  onBlurSeries={handleBlurSeries}
                  detailById={detailById}
                  interactiveIds={interactiveSeriesIds}
                  selectionState={selectionState}
                  onSelectTeam={handleSelectTeam}
                  onPickGames={handlePickGames}
                  onCancelSelection={() => setSelectionState(null)}
                  onClearSelection={handleClearSelection}
                />
              ))}
            </div>
          </section>

          <section className="nba-bracket-center">
            <span className="label">Finals</span>
            <div className="nba-bracket-column-stack center">
              {nbaFinalsDisplay.map((entry) => (
                <BracketSeries
                  key={entry.id}
                  entry={entry}
                  side="center"
                  roundKey="finals"
                  rowStart={5}
                  style={{ gridRow: "5 / span 2" }}
                  isFocused={activeFocusedSeriesId === entry.id}
                  onFocus={setFocusedSeriesId}
                  onBlurSeries={handleBlurSeries}
                  detail={detailById[entry.id]}
                  interactive={interactiveSeriesIds.has(entry.id)}
                  selectionState={selectionState?.seriesId === entry.id ? selectionState : null}
                  onSelectTeam={(teamId, teamAbbreviation) => handleSelectTeam(entry.id, teamId, teamAbbreviation)}
                  onPickGames={(games) => handlePickGames(entry.id, games)}
                  onCancelSelection={() => setSelectionState(null)}
                  onClearSelection={handleClearSelection}
                />
              ))}
            </div>
          </section>

          <section className="nba-bracket-side">
            <div className="nba-bracket-side-header nba-bracket-side-header-right">
              <span className="label">West</span>
            </div>
            <div className="nba-bracket-side-grid">
              {westLayout.map((column) => (
                <BracketColumn
                  key={column.title}
                  {...column}
                  focusedSeriesId={activeFocusedSeriesId}
                  onFocus={setFocusedSeriesId}
                  onBlurSeries={handleBlurSeries}
                  detailById={detailById}
                  interactiveIds={interactiveSeriesIds}
                  selectionState={selectionState}
                  onSelectTeam={handleSelectTeam}
                  onPickGames={handlePickGames}
                  onCancelSelection={() => setSelectionState(null)}
                  onClearSelection={handleClearSelection}
                />
              ))}
            </div>
          </section>
        </div>
        </div>
      </section>
    </div>
  );
}
