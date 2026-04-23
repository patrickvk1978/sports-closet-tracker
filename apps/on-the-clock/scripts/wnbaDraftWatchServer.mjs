import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { DEFAULT_URL, OUTPUT_DIR, takeSnapshot } from "./espnDraftcastProbe.mjs";

const DRAFT_URL = process.env.DRAFT_URL || DEFAULT_URL;
const DRAFT_OUTPUT_DIR = process.env.OUTPUT_DIR
  ? path.resolve(process.cwd(), process.env.OUTPUT_DIR)
  : OUTPUT_DIR;
const DRAFT_TITLE = process.env.DRAFT_TITLE || "WNBA Draft Watch";
const DRAFT_LABEL = process.env.DRAFT_LABEL || "WNBA Draft";
const PORT = Number(process.env.PORT || 8787);
const POLL_MS = Number(process.env.POLL_MS || 15000);
const HISTORY_LIMIT = 120;
const HISTORY_FILE = path.join(DRAFT_OUTPUT_DIR, "watch-history.jsonl");

let latest = null;
let previousSummary = null;
let isFetching = false;
let history = [];

function formatSelection(selection) {
  if (!selection) return "Waiting for selection";
  return `${selection.displayName}${selection.position ? ` · ${selection.position}` : ""}${selection.team ? ` · ${selection.team}` : ""}`;
}

function formatClock(expiresAt) {
  if (!expiresAt) return null;
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return null;
  const deltaMs = target - Date.now();
  if (deltaMs <= 0) return "00:00";
  const totalSeconds = Math.floor(deltaMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildCoverage(snapshot, currentPick) {
  const rawCurrent = snapshot.raw.current ?? {};
  const rawPicks = Array.isArray(snapshot.raw.picks) ? snapshot.raw.picks : [];
  const hasClock = Boolean(
    rawCurrent.clock ??
    rawCurrent.displayClock ??
    rawCurrent.timeRemaining ??
    currentPick?.expires ??
    null
  );
  const hasTeamOnClock = Boolean(currentPick?.team);
  const hasPickStatus = rawPicks.some((pick) => pick.status != null);
  const hasSelection = rawPicks.some((pick) => pick.selection != null);
  const hasTradeInfo = rawPicks.some((pick) => pick.traded || pick.tradeNote);

  return {
    clock: {
      present: hasClock,
      detail: hasClock ? "A clock-like field is present in the current payload." : "No dedicated countdown field found yet.",
    },
    teamOnClock: {
      present: hasTeamOnClock,
      detail: hasTeamOnClock ? `Current team resolves as ${currentPick.team}.` : "Could not resolve team on the clock from the current payload.",
    },
    pickStatus: {
      present: hasPickStatus,
      detail: hasPickStatus ? `Current row status is ${currentPick?.status ?? "unknown"}.` : "No status field found on picks yet.",
    },
    selection: {
      present: hasSelection,
      detail: hasSelection ? "The payload supports a populated selection object when a pick is revealed." : "No revealed selection has shown up yet.",
    },
    tradeInfo: {
      present: hasTradeInfo,
      detail: hasTradeInfo ? (currentPick?.tradeNote || "Trade flags or notes are present on at least one pick.") : "No trade metadata has appeared yet.",
    },
  };
}

function normalizePicks(rawPicks, summary) {
  const teams = Array.isArray(summary.raw?.teams) ? summary.raw.teams : [];
  const teamsById = Object.fromEntries(teams.map((team) => [String(team.id), team]));

  return rawPicks.map((pick) => ({
    round: pick.round ?? null,
    pick: pick.pick ?? null,
    overall: pick.overall ?? null,
    status: pick.status ?? null,
    traded: Boolean(pick.traded),
    tradeNote: pick.tradeNote ?? "",
    teamId: pick.teamId ?? null,
    team: teamsById[String(pick.teamId)]?.abbreviation ?? teamsById[String(pick.teamId)]?.shortDisplayName ?? null,
    selection: (pick.selection ?? pick.athlete)
      ? {
          id: (pick.selection ?? pick.athlete).id ?? null,
          displayName: (pick.selection ?? pick.athlete).displayName ?? (pick.selection ?? pick.athlete).name ?? null,
          position: (pick.selection ?? pick.athlete).position?.abbreviation ?? (pick.selection ?? pick.athlete).position?.displayName ?? null,
          team: (pick.selection ?? pick.athlete).team?.abbreviation ?? (pick.selection ?? pick.athlete).team?.shortDisplayName ?? null,
          link: (pick.selection ?? pick.athlete).link ?? null,
        }
      : null,
    expires: pick.expires ?? null,
  }));
}

function normalizeForUi(snapshot) {
  const summary = snapshot.summary;
  const rawCurrent = snapshot.raw.current ?? {};
  const rawPicks = Array.isArray(snapshot.raw.picks) ? snapshot.raw.picks : [];
  const allPicks = normalizePicks(rawPicks, snapshot);
  const currentPick = allPicks.find((pick) => pick.overall === summary.current?.pickId) ?? allPicks.find((pick) => !pick.selection) ?? null;
  const currentSelection = currentPick?.selection ?? null;

  return {
    fetchedAt: summary.fetchedAt,
    sourceUrl: summary.sourceUrl,
    headline: summary.displayName ?? "WNBA Draft",
    status: summary.status,
    counts: summary.counts,
    current: {
      pickId: summary.current?.pickId ?? null,
      round: currentPick?.round ?? null,
      pick: currentPick?.pick ?? null,
      overall: currentPick?.overall ?? null,
      team: currentPick?.team ?? null,
      status: currentPick?.status ?? null,
      traded: currentPick?.traded ?? false,
      tradeNote: currentPick?.tradeNote ?? "",
      selection: currentSelection,
      selectionText: formatSelection(currentSelection),
      bestAvailable: summary.current?.bestAvailable ?? null,
      bestFit: summary.current?.bestFit ?? null,
      clock:
        formatClock(currentPick?.expires) ??
        rawCurrent.clock ??
        rawCurrent.displayClock ??
        rawCurrent.timeRemaining ??
        null,
    },
    allPicks,
    nextPicks: allPicks.filter((pick) => !pick.selection).slice(0, 8),
    changes: snapshot.changes,
    coverage: buildCoverage(snapshot, currentPick),
    rawPreview: {
      status: snapshot.raw.status ?? null,
      current: snapshot.raw.current ?? null,
      firstPick: rawPicks[0] ?? null,
    },
  };
}

function buildEvents(snapshot, previous, normalized) {
  const events = [];
  const fetchedAt = normalized.fetchedAt;
  const previousPicks = previous?.raw?.picks ?? [];
  const currentPicks = snapshot.raw.picks ?? [];
  const previousByOverall = Object.fromEntries(previousPicks.map((pick) => [pick.overall, pick]));

  if (previous) {
    if (previous.summary.status?.state !== snapshot.summary.status?.state || previous.summary.status?.name !== snapshot.summary.status?.name) {
      events.push({
        type: "draft-status",
        at: fetchedAt,
        title: `Draft status ${previous.summary.status?.state ?? "unknown"} -> ${snapshot.summary.status?.state ?? "unknown"}`,
        detail: `${previous.summary.status?.name ?? "unknown"} -> ${snapshot.summary.status?.name ?? "unknown"}`,
      });
    }

    if (previous.summary.current?.pickId !== snapshot.summary.current?.pickId) {
      events.push({
        type: "current-pick",
        at: fetchedAt,
        title: `Current pick ${previous.summary.current?.pickId ?? "?"} -> ${snapshot.summary.current?.pickId ?? "?"}`,
        detail: `${normalized.current.team ?? "Unknown team"} is now on the clock`,
      });
    }
  }

  currentPicks.forEach((pick) => {
    const prior = previousByOverall[pick.overall];
    const priorStatus = prior?.status ?? null;
    const nextStatus = pick.status ?? null;

    if (prior && priorStatus !== nextStatus) {
      events.push({
        type: "pick-status",
        at: fetchedAt,
        title: `Pick ${pick.overall} status ${priorStatus ?? "unknown"} -> ${nextStatus ?? "unknown"}`,
        detail: `${pick.teamId ?? "team"} changed status`,
      });
    }

    const priorSelection = prior?.selection?.displayName ?? prior?.selection?.name ?? prior?.athlete?.displayName ?? prior?.athlete?.name ?? null;
    const nextSelection = pick.selection?.displayName ?? pick.selection?.name ?? pick.athlete?.displayName ?? pick.athlete?.name ?? null;
    if (nextSelection && priorSelection !== nextSelection) {
      events.push({
        type: "selection",
        at: fetchedAt,
        title: `Pick ${pick.overall} revealed`,
        detail: `${nextSelection}${pick.tradeNote ? ` · ${pick.tradeNote}` : ""}`,
      });
    }

    if ((pick.tradeNote ?? "") !== (prior?.tradeNote ?? "")) {
      events.push({
        type: "trade-note",
        at: fetchedAt,
        title: `Trade note updated for pick ${pick.overall}`,
        detail: pick.tradeNote || "Trade note cleared",
      });
    }
  });

  if (!previous) {
    events.push({
      type: "snapshot",
      at: fetchedAt,
      title: "Initial snapshot recorded",
      detail: `${normalized.counts.selected}/${normalized.counts.picks} selections revealed`,
    });
  }

  return events;
}

async function appendHistory(events) {
  if (!events.length) return;
  await fs.mkdir(DRAFT_OUTPUT_DIR, { recursive: true });
  const lines = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  await fs.appendFile(HISTORY_FILE, lines, "utf8");
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

async function refresh() {
  if (isFetching) return;
  isFetching = true;

  try {
    const snapshot = await takeSnapshot(DRAFT_URL, DRAFT_OUTPUT_DIR, previousSummary);
    const normalized = normalizeForUi(snapshot);
    const events = buildEvents(snapshot, latest?._snapshot ?? null, normalized);

    previousSummary = snapshot.summary;
    history = [...history, ...events].slice(-HISTORY_LIMIT);
    await appendHistory(events);

    latest = {
      ok: true,
      data: normalized,
      error: null,
      history,
      _snapshot: snapshot,
    };

    console.log(
      `[watch] ${snapshot.summary.fetchedAt} pick ${snapshot.summary.current.pickId ?? "?"} ${normalized.current.team ?? "?"} ${snapshot.summary.status.state}/${snapshot.summary.status.name}`
    );
    events.forEach((event) => {
      console.log(`[watch:event] ${event.title} :: ${event.detail}`);
    });
  } catch (error) {
    latest = {
      ok: false,
      data: latest?.data ?? null,
      error: error.message,
      history,
      _snapshot: latest?._snapshot ?? null,
    };
    console.error(`[watch] ${new Date().toISOString()} ${error.message}`);
  } finally {
    isFetching = false;
  }
}

function html() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${DRAFT_TITLE}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #081120;
        --panel: #101c30;
        --panel-2: #13233a;
        --border: #2a4162;
        --text: #eef4ff;
        --muted: #9fb0cc;
        --accent: #ff7a45;
        --accent-soft: rgba(255, 122, 69, 0.14);
        --good: #22c55e;
        --warn: #facc15;
        --bad: #ef4444;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, system-ui, sans-serif;
        background: linear-gradient(180deg, #07101d 0%, #0b1830 100%);
        color: var(--text);
      }
      .shell { max-width: 1440px; margin: 0 auto; padding: 28px; }
      .header {
        display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px;
      }
      .header h1 { margin: 0 0 6px; font-size: 2.3rem; }
      .subtle { color: var(--muted); }
      .button {
        border: 1px solid var(--border); background: var(--panel); color: var(--text);
        padding: 10px 16px; border-radius: 999px; cursor: pointer; font-weight: 700;
      }
      .button:hover { border-color: var(--accent); }
      .top-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 18px; margin-bottom: 18px; }
      .bottom-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
      .stack { display: grid; gap: 18px; }
      .panel {
        background: rgba(16, 28, 48, 0.94); border: 1px solid var(--border);
        border-radius: 24px; padding: 20px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
      }
      .label {
        display: inline-block; margin-bottom: 10px; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem; font-weight: 700;
      }
      .hero { display: grid; gap: 16px; }
      .headline-row {
        display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;
      }
      .status-chip {
        padding: 8px 12px; border-radius: 999px; background: var(--accent-soft); color: #ffd5c1; font-weight: 700;
      }
      .hero h2 { margin: 0; font-size: 2rem; }
      .current-meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .metric {
        background: var(--panel-2); border: 1px solid var(--border); border-radius: 18px; padding: 14px;
      }
      .metric strong { display: block; font-size: 1.1rem; margin-top: 6px; }
      .pick-grid, .event-list, .coverage-list { display: grid; gap: 10px; }
      .pick-row {
        display: grid; grid-template-columns: 72px 88px 120px 1fr auto; gap: 12px; align-items: center;
        padding: 12px 14px; border-radius: 16px; border: 1px solid var(--border); background: rgba(19, 35, 58, 0.85);
      }
      .pick-row.current { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
      .pick-row .team { font-weight: 700; }
      .trade { display: inline-block; margin-top: 4px; color: var(--warn); font-size: 0.85rem; }
      .selection { color: var(--muted); }
      .selection strong { color: var(--text); }
      .pill {
        display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 4px 10px;
        font-size: 0.82rem; font-weight: 700; border: 1px solid var(--border); background: rgba(8, 17, 32, 0.7);
      }
      .pill.good { color: #d3ffe3; border-color: rgba(34,197,94,.5); background: rgba(34,197,94,.14); }
      .pill.warn { color: #fff0a1; border-color: rgba(250,204,21,.5); background: rgba(250,204,21,.12); }
      .pill.bad { color: #ffd0d0; border-color: rgba(239,68,68,.5); background: rgba(239,68,68,.12); }
      .event-row, .coverage-row {
        border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; background: rgba(19, 35, 58, 0.85);
      }
      .event-row strong, .coverage-row strong { display: block; margin-bottom: 4px; }
      .event-time { color: var(--muted); font-size: 0.8rem; }
      details summary { cursor: pointer; font-weight: 700; color: var(--muted); }
      pre {
        margin: 12px 0 0; background: #07101d; border: 1px solid var(--border); border-radius: 16px;
        padding: 14px; overflow: auto; font-size: 0.78rem; line-height: 1.45;
      }
      .error { border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.12); }
      @media (max-width: 1180px) {
        .top-grid, .bottom-grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 980px) {
        .current-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .pick-row { grid-template-columns: 56px 72px 1fr; }
        .pick-row .status { grid-column: 1 / -1; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
          <div>
            <div class="label">Draft rehearsal</div>
            <h1>${DRAFT_TITLE}</h1>
            <div class="subtle">A lightweight monitor for ESPN draftcast data. This tells us what On the Clock can trust on draft night.</div>
          </div>
        <button class="button" id="refresh">Refresh now</button>
      </div>

      <div class="top-grid">
        <section class="panel hero" id="hero"></section>
        <section class="panel">
          <div class="label">Coverage checklist</div>
          <div class="coverage-list" id="coverage"></div>
        </section>
      </div>

      <div class="bottom-grid">
        <div class="stack">
          <section class="panel">
            <div class="headline-row">
              <div>
                <div class="label">Draft board</div>
                <h2 style="font-size:1.35rem;margin:0;">Full board</h2>
              </div>
            </div>
            <div class="pick-grid" id="all-picks"></div>
          </section>
          <section class="panel">
            <details>
              <summary>Raw payload preview</summary>
              <pre id="raw"></pre>
            </details>
          </section>
        </div>

        <div class="stack">
          <section class="panel">
            <div class="label">Event log</div>
            <div class="event-list" id="events"></div>
          </section>
        </div>
      </div>
    </div>

    <script>
      function pillClass(present) {
        return present ? "pill good" : "pill warn";
      }

      function render(data, history, ok, error) {
        const hero = document.getElementById("hero");
        const coverage = document.getElementById("coverage");
        const allPicks = document.getElementById("all-picks");
        const events = document.getElementById("events");
        const raw = document.getElementById("raw");

        if (!ok && !data) {
          hero.innerHTML = '<div class="panel error"><strong>Could not load draft state.</strong><div class="subtle">' + error + '</div></div>';
          return;
        }

        hero.innerHTML = \`
          <div class="headline-row">
            <div>
              <div class="label">\${data.headline}</div>
              <h2>\${data.current.team ?? "Unknown team"} · Pick \${data.current.pickId ?? "?"}</h2>
              <div class="subtle">Fetched \${new Date(data.fetchedAt).toLocaleTimeString()} · Source: <a href="\${data.sourceUrl}" target="_blank" rel="noreferrer" style="color:#9fc7ff;">ESPN draft page</a></div>
            </div>
            <div class="status-chip">\${data.status.state ?? "unknown"} / \${data.status.name ?? "unknown"}</div>
          </div>
          <div class="current-meta">
            <div class="metric">
              <div class="label">Team on the clock</div>
              <strong>\${data.current.team ?? "Unknown"}</strong>
            </div>
            <div class="metric">
              <div class="label">Pick status</div>
              <strong>\${data.current.status ?? "Not exposed"}</strong>
            </div>
            <div class="metric">
              <div class="label">Selection</div>
              <strong>\${data.current.selectionText}</strong>
            </div>
            <div class="metric">
              <div class="label">Clock</div>
              <strong>\${data.current.clock ?? "Not exposed in payload"}</strong>
            </div>
          </div>
          <div class="current-meta">
            <div class="metric">
              <div class="label">Best available</div>
              <strong>\${data.current.bestAvailable?.displayName ?? "n/a"}</strong>
            </div>
            <div class="metric">
              <div class="label">Best fit</div>
              <strong>\${data.current.bestFit?.displayName ?? "n/a"}</strong>
            </div>
            <div class="metric">
              <div class="label">Trade note</div>
              <strong>\${data.current.tradeNote || "None"}</strong>
            </div>
            <div class="metric">
              <div class="label">Revealed picks</div>
              <strong>\${data.counts.selected}/\${data.counts.picks}</strong>
            </div>
          </div>
        \`;

        coverage.innerHTML = Object.entries(data.coverage).map(([key, item]) => \`
          <div class="coverage-row">
            <span class="\${pillClass(item.present)}">\${item.present ? "Present" : "Missing / unclear"}</span>
            <strong>\${key}</strong>
            <div class="subtle">\${item.detail}</div>
          </div>
        \`).join("");

        allPicks.innerHTML = data.allPicks.map((pick) => \`
          <div class="pick-row \${pick.overall === data.current.pickId ? "current" : ""}">
            <div><strong>#\${pick.overall ?? "?"}</strong></div>
            <div>\${pick.round ?? "?"}.\${pick.pick ?? "?"}</div>
            <div class="team">\${pick.team ?? "?"}</div>
            <div class="selection">
              <strong>\${pick.selection?.displayName ?? "Waiting"}</strong>
              \${pick.selection?.position ? " · " + pick.selection.position : ""}
              \${pick.tradeNote ? '<div class="trade">' + pick.tradeNote + '</div>' : ''}
            </div>
            <div class="status status-chip">\${pick.status ?? "unknown"}</div>
          </div>
        \`).join("");

        events.innerHTML = (history || []).slice().reverse().map((event) => \`
          <div class="event-row">
            <div class="event-time">\${new Date(event.at).toLocaleTimeString()}</div>
            <strong>\${event.title}</strong>
            <div class="subtle">\${event.detail}</div>
          </div>
        \`).join("");

        raw.textContent = JSON.stringify(data.rawPreview, null, 2);

        if (!ok && error) {
          const note = document.createElement("div");
          note.className = "event-row error";
          note.innerHTML = "<strong>Latest refresh failed.</strong><div class='subtle'>" + error + "</div>";
          events.prepend(note);
        }
      }

      async function load() {
        const response = await fetch("/api/state");
        const payload = await response.json();
        render(payload.data, payload.history, payload.ok, payload.error);
      }

      document.getElementById("refresh").addEventListener("click", load);
      load();
      setInterval(load, ${POLL_MS});
    </script>
  </body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/api/state") {
    if (!latest) {
      await refresh();
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({
      ok: latest.ok,
      data: latest.data,
      error: latest.error,
      history: latest.history,
    }));
    return;
  }

  if (req.url === "/" || req.url?.startsWith("/?")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html());
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

history = await loadHistory();
await refresh();
server.listen(PORT, () => {
  console.log(`[watch] ${DRAFT_LABEL} watch server running at http://localhost:${PORT}`);
  console.log(`[watch] polling ESPN every ${Math.round(POLL_MS / 1000)}s`);
  console.log(`[watch] history file ${HISTORY_FILE}`);
});

setInterval(() => {
  refresh().catch((error) => {
    console.error(`[watch] ${new Date().toISOString()} ${error.message}`);
  });
}, POLL_MS);
