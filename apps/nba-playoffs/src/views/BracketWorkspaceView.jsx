import { useMemo } from "react";
import { usePlayoffData } from "../hooks/usePlayoffData.jsx";
import { useSeriesPickem } from "../hooks/useSeriesPickem";

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

function getPickedTeam(seriesItem, pick, slot) {
  if (!seriesItem || !pick?.winnerTeamId) return null;
  const pickedTeam = pick.winnerTeamId === seriesItem.homeTeam.id ? seriesItem.homeTeam : seriesItem.awayTeam;
  return {
    id: pickedTeam.id,
    abbreviation: pickedTeam.abbreviation === "TBD" ? "" : pickedTeam.abbreviation,
    active: true,
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
    active: isSelected,
    slot: side,
  };
}

function BracketSeries({ top, bottom, side, roundKey, style }) {
  return (
    <div className={`nba-bracket-series ${side} ${roundKey}`} style={style}>
      <div className={top.active ? "nba-bracket-line active" : "nba-bracket-line"}>
        <span>{top.abbreviation}</span>
      </div>
      <div className={bottom.active ? "nba-bracket-line active" : "nba-bracket-line"}>
        <span>{bottom.abbreviation}</span>
      </div>
    </div>
  );
}

function BracketColumn({ title, seriesList, side, roundKey, rowStarts }) {
  return (
    <div className={`nba-bracket-column ${side}`}>
      <span className="micro-label">{title}</span>
      <div className={`nba-bracket-column-stack ${side}`}>
        {seriesList.map((entry, index) => (
          <BracketSeries
            key={entry.id}
            top={entry.top}
            bottom={entry.bottom}
            side={side}
            roundKey={roundKey}
            style={{ gridRow: `${rowStarts[index]} / span 2` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function BracketWorkspaceView() {
  const { series, seriesByConference } = usePlayoffData();
  const { picksBySeriesId } = useSeriesPickem(series);

  const seriesById = useMemo(
    () => Object.fromEntries(series.map((seriesItem) => [seriesItem.id, seriesItem])),
    [series]
  );

  const eastRoundOne = seriesByConference.East.filter((seriesItem) => seriesItem.roundKey === "round_1");
  const westRoundOne = seriesByConference.West.filter((seriesItem) => seriesItem.roundKey === "round_1");

  const eastRoundOneDisplay = eastRoundOne.map((seriesItem) => ({
    id: seriesItem.id,
    top: getRoundOneSlot(seriesItem, picksBySeriesId[seriesItem.id], "top"),
    bottom: getRoundOneSlot(seriesItem, picksBySeriesId[seriesItem.id], "bottom"),
  }));

  const westRoundOneDisplay = westRoundOne.map((seriesItem) => ({
    id: seriesItem.id,
    top: getRoundOneSlot(seriesItem, picksBySeriesId[seriesItem.id], "top"),
    bottom: getRoundOneSlot(seriesItem, picksBySeriesId[seriesItem.id], "bottom"),
  }));

  const buildProjectedRound = (definition) =>
    definition.map((entry) => ({
      id: entry.id,
      top: getPickedTeam(seriesById[entry.sources[0]], picksBySeriesId[entry.sources[0]], "top") ?? {
        id: `${entry.id}-top`,
        abbreviation: "",
        active: false,
        slot: "top",
      },
      bottom: getPickedTeam(seriesById[entry.sources[1]], picksBySeriesId[entry.sources[1]], "bottom") ?? {
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

  const eastLayout = [
    { title: "Round 1", seriesList: eastRoundOneDisplay, side: "east", roundKey: "round-1", rowStarts: [1, 3, 5, 7] },
    { title: "Semifinals", seriesList: eastSemisDisplay, side: "east", roundKey: "semis", rowStarts: [2, 6] },
    { title: "Conference Finals", seriesList: eastFinalsDisplay, side: "east", roundKey: "finals", rowStarts: [4] },
  ];

  const westLayout = [
    { title: "Conference Finals", seriesList: westFinalsDisplay, side: "west", roundKey: "finals", rowStarts: [4] },
    { title: "Semifinals", seriesList: westSemisDisplay, side: "west", roundKey: "semis", rowStarts: [2, 6] },
    { title: "Round 1", seriesList: westRoundOneDisplay, side: "west", roundKey: "round-1", rowStarts: [1, 3, 5, 7] },
  ];

  return (
    <div className="nba-shell">
      <section className="panel">
        <div className="panel-header">
          <div>
            <span className="label">Bracket</span>
            <h2>Playoff path</h2>
          </div>
        </div>

        <div className="nba-bracket-simple">
          <section className="nba-bracket-side">
            <div className="nba-bracket-side-header">
              <span className="label">East</span>
            </div>
            <div className="nba-bracket-side-grid">
              {eastLayout.map((column) => (
                <BracketColumn key={column.title} {...column} />
              ))}
            </div>
          </section>

          <section className="nba-bracket-center">
            <span className="label">Finals</span>
            <div className="nba-bracket-column-stack center">
              {nbaFinalsDisplay.map((entry) => (
                <BracketSeries
                  key={entry.id}
                  top={entry.top}
                  bottom={entry.bottom}
                  side="center"
                  roundKey="finals"
                  style={{ gridRow: "4 / span 2" }}
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
                <BracketColumn key={column.title} {...column} />
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
