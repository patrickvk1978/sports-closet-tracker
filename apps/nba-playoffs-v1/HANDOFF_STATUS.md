# NBA Playoffs Handoff Status

## What Is Real Right Now

- `Series Pick'em` is the only active NBA contest format in the app.
- `Bracket` is a visual context page for the series picks, not a separate game mode.
- `Reports` now has:
  - an overview page
  - dedicated deep-dive pages for key report types
  - scenario-aware behavior for the regular-season finale / Play-In window
- `Standings` has:
  - a table-first view
  - current-round win odds
  - points / exact / points-back style context
- commissioner / admin / normal-user role distinctions are present in the UI

## What Is Seeded / Placeholder

- `Market lean` and `Model lean` are still local seeded inputs, not live real feeds.
- current-round win odds are still produced locally in the frontend simulation layer.
- commentary is still local heuristic logic, not shared backend-generated commentary.
- some matchup slots are still seed placeholders because the playoff field is not fully locked.

## What Is Already Prepared For Shared Backend Work

### Shared-layer planning

- [`PROBABILITY_COMMENTARY_PLAN.md`](./PROBABILITY_COMMENTARY_PLAN.md)

### Probability input seam

- local data source: [`src/data/probabilityInputs.js`](./src/data/probabilityInputs.js)
- adapter layer: [`src/lib/probabilityInputs.js`](./src/lib/probabilityInputs.js)
- merge point: [`src/hooks/usePlayoffData.jsx`](./src/hooks/usePlayoffData.jsx)

### Future shared hook seam

- [`src/hooks/useProbabilityInputs.js`](./src/hooks/useProbabilityInputs.js)
- [`src/hooks/usePoolOdds.js`](./src/hooks/usePoolOdds.js)
- [`src/hooks/useCommentary.js`](./src/hooks/useCommentary.js)

These are not fully adopted everywhere yet, but they are the intended integration seams for:

1. probability inputs
2. simulation outputs
3. commentary outputs

## Current Product Shape

### Core pages

- `Dashboard`
  - today-aware / scenario-aware overview
  - selection-week framing
- `Series`
  - main gameplay surface
- `Bracket`
  - visual playoff map tied to the user’s series picks
- `Standings`
  - table-first snapshot
- `Reports`
  - overview + deep dives

### Current emphasis

The NBA app is now built around:

- round-by-round series selection
- pool context
- probability-informed interpretation
- report-driven differentiation

## Useful Files For Patrick

### Core UI

- [`src/views/DashboardView.jsx`](./src/views/DashboardView.jsx)
- [`src/views/SeriesTrackerView.jsx`](./src/views/SeriesTrackerView.jsx)
- [`src/views/BracketWorkspaceView.jsx`](./src/views/BracketWorkspaceView.jsx)
- [`src/views/StandingsView.jsx`](./src/views/StandingsView.jsx)
- [`src/views/ReportsView.jsx`](./src/views/ReportsView.jsx)
- [`src/views/ReportDetailView.jsx`](./src/views/ReportDetailView.jsx)
- [`src/views/SeriesReportView.jsx`](./src/views/SeriesReportView.jsx)
- [`src/views/OpponentReportView.jsx`](./src/views/OpponentReportView.jsx)

### Domain logic

- [`src/data/playoffData.js`](./src/data/playoffData.js)
- [`src/data/scenarioWatch.js`](./src/data/scenarioWatch.js)
- [`src/lib/seriesPickem.js`](./src/lib/seriesPickem.js)
- [`src/lib/standings.js`](./src/lib/standings.js)
- [`src/lib/insights.js`](./src/lib/insights.js)

## Recommended Next Integration Steps

1. Replace seeded `market` / `model` inputs with a shared source.
2. Decide where shared simulation outputs should live for NBA pools.
3. Attach shared commentary outputs to the Dashboard / Reports surfaces.
4. Unify schema direction with the broader Sports Closet multi-product backend.

## Short Honest Read

This is no longer just a shell. It is a credible local-first NBA product draft with:

- real app structure
- real contest flow
- meaningful report surfaces
- clear seams for shared backend integration

The biggest remaining gap is not frontend shape. It is the shared live data / simulation / commentary backend hookup.
