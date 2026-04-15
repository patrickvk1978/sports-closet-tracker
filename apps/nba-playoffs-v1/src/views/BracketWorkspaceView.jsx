import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePool } from "../hooks/usePool";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";
import { formatProbabilityFreshness, formatProbabilitySourceLabel } from "../lib/probabilityInputs";
import { areRoundPicksPublic } from "../lib/pickVisibility";

const EAST_SEMIS = [
  { id: "east-sf-1", sources: ["east-r1-1", "east-r1-3"] },
  { id: "east-sf-2", sources: ["east-r1-2", "east-r1-4"] },
];

const WEST_SEMIS = [
  { id: "west-sf-1", sources: ["west-r1-1", "west-r1-4"] },
  { id: "west-sf-2", sources: ["west-r1-2", "west-r1-3"] },
];

const EAST_FINALS = [{ id: "east-finals", sources: ["east-sf-1", "east-sf-2"] }];
const WEST_FINALS = [{ id: "west-finals", sources: ["west-sf-1", "west-sf-2"] }];
const NBA_FINALS = [{ id: "nba-finals", sources: ["east-finals", "west-finals"] }];
const ROUND_ONE_ORDER = ["1-8", "4-5", "3-6", "2-7"];

function getPickedTeam(seriesItem, pick, slot) {
  if (!seriesItem || !pick?.winnerTeamId) return null;
  const pickedTeam = pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  return {
    id: pickedTeam.id,
    abbreviation: pickedTeam.abbreviation === "TBD" ? "" : pickedTeam.abbreviation,
    detail: "",
    active: false,
    slot,
  };
}

function getRoundOneSlot(seriesItem, pick, side) {
  if (!seriesItem) return { id: `${side}-empty`, abbreviation: "", active: false, slot: side };
  const team = side === "top" ? seriesItem.homeTeam : seriesItem.awayTeam;
  const isSelected = pick?.winnerTeamId === team.id;
  return {
    id: team.id,
    abbreviation: team.abbreviation === "TBD" ? "" : team.abbreviation,
    detail: isSelected && pick?.games ? `IN ${pick.games}` : "",
    active: isSelected,
    slot: side,
  };
}

function formatPickLabel(seriesItem, pick) {
  if (!seriesItem || !pick?.winnerTeamId || !pick?.games) return "No pick yet";
  const pickedTeam = pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  return `${pickedTeam.abbreviation} in ${pick.games}`;
}

function formatLean(seriesItem, source) {
  if (!seriesItem || !source) return "Waiting on matchup";
  if ((source.homeWinPct ?? 0) === (source.awayWinPct ?? 0)) return "Even";
  return source.homeWinPct >= source.awayWinPct
    ? `${seriesItem.homeTeam.abbreviation} ${source.homeWinPct}%`
    : `${seriesItem.awayTeam.abbreviation} ${source.awayWinPct}%`;
}

function buildDisplayName(entry, seriesItem) {
  const top = entry.top.abbreviation || seriesItem?.homeTeam?.abbreviation || "";
  const bottom = entry.bottom.abbreviation || seriesItem?.awayTeam?.abbreviation || "";
  return [top, bottom].filter(Boolean).join(" vs ");
}

function getSeedOrderValue(seriesItem) {
  const matchup = `${seriesItem.homeSeed}-${seriesItem.awaySeed}`;
  const orderIndex = ROUND_ONE_ORDER.indexOf(matchup);
  return orderIndex === -1 ? ROUND_ONE_ORDER.length : orderIndex;
}

function BracketPopover({ detail }) {
  if (!detail) return null;

  return (
    <div className="nba-bracket-popover">
      <span className="micro-label">{detail.title}</span>
      <div className="nba-bracket-popover-grid">
        <div>
          <span className="micro-label">Current pick</span>
          <p>{detail.pickLabel}</p>
        </div>
        <div>
          <span className="micro-label">Market lean</span>
          <p>{detail.marketLean}</p>
          <span className="micro-copy">{detail.marketMeta}</span>
        </div>
        <div>
          <span className="micro-label">Model lean</span>
          <p>{detail.modelLean}</p>
          <span className="micro-copy">{detail.modelMeta}</span>
        </div>
      </div>
    </div>
  );
}

function BracketSeries({ entry, side, roundKey, style, isFocused, onFocus, onBlurSeries, detail }) {
  const { top, bottom } = entry;
  return (
    <button
      type="button"
      className={`nba-bracket-series ${side} ${roundKey} ${isFocused ? "is-focused" : ""}`}
      style={style}
      onMouseEnter={() => onFocus(entry.id)}
      onMouseLeave={onBlurSeries}
      onFocus={() => onFocus(entry.id)}
      onClick={() => onFocus(entry.id)}
    >
      {isFocused ? <BracketPopover detail={detail} /> : null}
      <div className={top.active ? "nba-bracket-line active" : "nba-bracket-line"}>
        <span>{top.abbreviation}</span>
        {top.detail ? <em>{top.detail}</em> : null}
      </div>
      <div className={bottom.active ? "nba-bracket-line active" : "nba-bracket-line"}>
        <span>{bottom.abbreviation}</span>
        {bottom.detail ? <em>{bottom.detail}</em> : null}
      </div>
    </button>
  );
}

function BracketColumn({ title, seriesList, side, roundKey, rowStarts, focusedSeriesId, onFocus, onBlurSeries, detailById }) {
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
            style={{ gridRow: `${rowStarts[index]} / span 2` }}
            isFocused={focusedSeriesId === entry.id}
            onFocus={onFocus}
            onBlurSeries={onBlurSeries}
            detail={detailById[entry.id]}
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
  const { picksBySeriesId, allPicksByUser } = useSeriesPickem(series);
  const currentMember = memberList.find((member) => member.isCurrentUser) ?? memberList[0] ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedSeriesId, setFocusedSeriesId] = useState(null);
  const activeSeries = seriesByRound[currentRound.key] ?? [];
  const canViewOtherBrackets = areRoundPicksPublic(activeSeries, currentRound.key, settings);
  const requestedViewerId = searchParams.get("viewer") ?? "";
  const availableViewers = memberList.filter((member) => member.id !== currentMember?.id);
  const selectedViewer = canViewOtherBrackets
    ? availableViewers.find((member) => member.id === requestedViewerId) ?? null
    : null;
  const isViewingCurrentUser = !selectedViewer;

  const effectiveSelectedMemberId = selectedViewer?.id ?? currentMember?.id ?? memberList[0]?.id ?? "";

  const selectedPicksBySeriesId = effectiveSelectedMemberId
    ? allPicksByUser[effectiveSelectedMemberId] ?? (effectiveSelectedMemberId === currentMember?.id ? picksBySeriesId : {})
    : picksBySeriesId;

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
    top: getRoundOneSlot(seriesItem, selectedPicksBySeriesId[seriesItem.id], "top"),
    bottom: getRoundOneSlot(seriesItem, selectedPicksBySeriesId[seriesItem.id], "bottom"),
  }));

  const westRoundOneDisplay = westRoundOne.map((seriesItem) => ({
    id: seriesItem.id,
    top: getRoundOneSlot(seriesItem, selectedPicksBySeriesId[seriesItem.id], "top"),
    bottom: getRoundOneSlot(seriesItem, selectedPicksBySeriesId[seriesItem.id], "bottom"),
  }));

  const buildProjectedRound = (definition) =>
    definition.map((entry) => ({
      id: entry.id,
      top: getPickedTeam(seriesById[entry.sources[0]], selectedPicksBySeriesId[entry.sources[0]], "top") ?? {
        id: `${entry.id}-top`,
        abbreviation: "",
        active: false,
        slot: "top",
      },
      bottom: getPickedTeam(seriesById[entry.sources[1]], selectedPicksBySeriesId[entry.sources[1]], "bottom") ?? {
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
  const activeFocusedSeriesId = displayEntryById[focusedSeriesId] ? focusedSeriesId : null;
  const detailById = Object.fromEntries(
    allDisplayEntries.map((entry) => {
      const seriesItem = seriesById[entry.id] ?? null;
      const pick = selectedPicksBySeriesId[entry.id] ?? null;
      return [
        entry.id,
        {
          title: buildDisplayName(entry, seriesItem),
          pickLabel: formatPickLabel(seriesItem, pick),
          marketLean: formatLean(seriesItem, seriesItem?.market),
          modelLean: formatLean(seriesItem, seriesItem?.model),
          marketMeta: `${formatProbabilitySourceLabel(seriesItem?.market)} · ${formatProbabilityFreshness(seriesItem?.market)}`,
          modelMeta: `${formatProbabilitySourceLabel(seriesItem?.model)} · ${formatProbabilityFreshness(seriesItem?.model)}`,
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
    if (!nextViewerId) {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ viewer: nextViewerId }, { replace: true });
  }

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Bracket</span>
            <h2>{isViewingCurrentUser ? "Playoff path" : `${selectedViewer?.name ?? "This entry"}'s playoff path`}</h2>
            <p className="subtle">
              Keep the board simple. Hover or tap a series to see the pick view plus market and model context.
            </p>
          </div>
          <div className="nba-report-actions">
            {canViewOtherBrackets ? (
              <label className="nba-bracket-viewer">
                <span className="micro-label">Viewing bracket as</span>
                <select
                  className="nav-select"
                  value={isViewingCurrentUser ? "" : effectiveSelectedMemberId}
                  onChange={handleViewerChange}
                >
                  <option value="">Viewing: My bracket</option>
                  {availableViewers.map((member) => (
                    <option key={member.id} value={member.id}>
                      View {member.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="tooltip-wrap tooltip-wrap-inline">
                <button type="button" className="secondary-button" disabled>
                  View another bracket
                </button>
                <span className="tooltip-bubble">Available once the round locks or games begin.</span>
              </span>
            )}
            <Link className="secondary-button" to="/matrix">
              Open matrix
            </Link>
          </div>
        </div>

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
                  onBlurSeries={() => setFocusedSeriesId(null)}
                  detailById={detailById}
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
                  style={{ gridRow: "5 / span 2" }}
                  isFocused={activeFocusedSeriesId === entry.id}
                  onFocus={setFocusedSeriesId}
                  onBlurSeries={() => setFocusedSeriesId(null)}
                  detail={detailById[entry.id]}
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
                  onBlurSeries={() => setFocusedSeriesId(null)}
                  detailById={detailById}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
