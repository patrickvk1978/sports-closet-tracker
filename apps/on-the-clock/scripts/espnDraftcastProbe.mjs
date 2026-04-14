import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const DEFAULT_URL = "https://www.espn.com/wnba/draft/live";
export const OUTPUT_DIR = path.resolve(process.cwd(), "tmp/espn-draft-probe");

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    interval: 0,
    outDir: OUTPUT_DIR,
    once: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--interval" && argv[index + 1]) {
      options.interval = Math.max(0, Number(argv[index + 1]) || 0);
      options.once = options.interval === 0;
      index += 1;
      continue;
    }

    if (arg === "--out-dir" && argv[index + 1]) {
      options.outDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
  }

  return options;
}

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function safeSlug(value) {
  return value.replaceAll(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

export function extractDraftcastJson(html) {
  const startMarker = "espn.draftcast.data = ";
  const start = html.indexOf(startMarker);
  if (start < 0) {
    throw new Error("Could not find espn.draftcast.data in the page HTML");
  }

  const afterStart = html.slice(start + startMarker.length);
  const endMarker = ";\n";
  const end = afterStart.indexOf(endMarker);
  if (end < 0) {
    throw new Error("Could not find the end of espn.draftcast.data assignment");
  }

  return afterStart.slice(0, end).trim();
}

export function selectionSummary(selection) {
  if (!selection) return null;
  return {
    id: selection.id ?? null,
    displayName: selection.displayName ?? selection.name ?? null,
    position: selection.position?.abbreviation ?? selection.position?.displayName ?? null,
    team: selection.team?.abbreviation ?? selection.team?.shortDisplayName ?? null,
    link: selection.link ?? null,
  };
}

export function pickSummary(pick, teamsById) {
  const chosenPlayer = pick.selection ?? pick.athlete ?? null;
  return {
    round: pick.round ?? null,
    pick: pick.pick ?? null,
    overall: pick.overall ?? null,
    status: pick.status ?? null,
    traded: Boolean(pick.traded),
    tradeNote: pick.tradeNote ?? "",
    teamId: pick.teamId ?? null,
    team: teamsById[String(pick.teamId)]?.abbreviation ?? teamsById[String(pick.teamId)]?.shortDisplayName ?? null,
    selection: selectionSummary(chosenPlayer),
    expires: pick.expires ?? null,
  };
}

export function buildSummary(data, sourceUrl) {
  const teams = Array.isArray(data.teams) ? data.teams : [];
  const picks = Array.isArray(data.picks) ? data.picks : [];
  const teamsById = Object.fromEntries(teams.map((team) => [String(team.id), team]));
  const selectedPicks = picks.filter((pick) => pick.selection || pick.athlete);
  const unresolvedPicks = picks.filter((pick) => !(pick.selection || pick.athlete));
  const currentPick = picks.find((pick) => pick.overall === data.current?.pickId) ?? unresolvedPicks[0] ?? null;
  const nextPicks = unresolvedPicks.slice(0, 5).map((pick) => pickSummary(pick, teamsById));

  return {
    fetchedAt: new Date().toISOString(),
    sourceUrl,
    displayName: data.displayName ?? null,
    shortDisplayName: data.shortDisplayName ?? null,
    year: data.year ?? null,
    rounds: data.rounds ?? null,
    next: data.next ?? null,
    status: {
      round: data.status?.round ?? null,
      name: data.status?.name ?? null,
      description: data.status?.description ?? null,
      state: data.status?.state ?? null,
    },
    counts: {
      teams: teams.length,
      picks: picks.length,
      selected: selectedPicks.length,
      remaining: unresolvedPicks.length,
    },
    current: {
      pickId: data.current?.pickId ?? null,
      bestAvailable: selectionSummary(data.current?.bestAvailable),
      bestFit: selectionSummary(data.current?.bestFit),
      bestAvailableCount: Array.isArray(data.current?.bestAvailablePicks) ? data.current.bestAvailablePicks.length : 0,
      currentPick: currentPick ? pickSummary(currentPick, teamsById) : null,
    },
    nextPicks,
    sampleKeys: {
      root: Object.keys(data).sort(),
      pick: picks[0] ? Object.keys(picks[0]).sort() : [],
      current: data.current ? Object.keys(data.current).sort() : [],
    },
  };
}

export function summarizeDiff(previous, next) {
  if (!previous) return ["Initial snapshot recorded"];

  const changes = [];

  if (previous.status?.state !== next.status?.state) {
    changes.push(`status.state ${previous.status?.state} -> ${next.status?.state}`);
  }

  if (previous.current?.pickId !== next.current?.pickId) {
    changes.push(`current.pickId ${previous.current?.pickId} -> ${next.current?.pickId}`);
  }

  if (previous.counts?.selected !== next.counts?.selected) {
    changes.push(`selected picks ${previous.counts?.selected} -> ${next.counts?.selected}`);
  }

  if (previous.current?.currentPick?.selection?.displayName !== next.current?.currentPick?.selection?.displayName) {
    changes.push(
      `current selection ${previous.current?.currentPick?.selection?.displayName ?? "none"} -> ${next.current?.currentPick?.selection?.displayName ?? "none"}`
    );
  }

  return changes.length ? changes : ["No structural change detected"];
}

export async function fetchDraftcastPage(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; OnTheClockProbe/1.0)",
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.text();
}

export async function writeSnapshot(outDir, payload) {
  await fs.mkdir(outDir, { recursive: true });

  const stamp = nowStamp();
  const baseName = safeSlug(payload.summary.shortDisplayName ?? payload.summary.displayName ?? "draftcast");
  const rawPath = path.join(outDir, `${baseName}-${stamp}.raw.json`);
  const summaryPath = path.join(outDir, `${baseName}-${stamp}.summary.json`);
  const latestPath = path.join(outDir, `${baseName}-latest.summary.json`);

  await fs.writeFile(rawPath, JSON.stringify(payload.raw, null, 2));
  await fs.writeFile(summaryPath, JSON.stringify(payload.summary, null, 2));
  await fs.writeFile(latestPath, JSON.stringify(payload.summary, null, 2));

  return { rawPath, summaryPath, latestPath };
}

export async function takeSnapshot(url, outDir, previousSummary) {
  const html = await fetchDraftcastPage(url);
  const jsonText = extractDraftcastJson(html);
  const raw = JSON.parse(jsonText);
  const summary = buildSummary(raw, url);
  const files = await writeSnapshot(outDir, { raw, summary });
  const changes = summarizeDiff(previousSummary, summary);

  return { raw, summary, files, changes };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let previousSummary = null;

  async function runOnce() {
    const snapshot = await takeSnapshot(options.url, options.outDir, previousSummary);
    previousSummary = snapshot.summary;

    console.log("");
    console.log(`[probe] ${snapshot.summary.fetchedAt}`);
    console.log(`[probe] source     ${snapshot.summary.sourceUrl}`);
    console.log(`[probe] status     ${snapshot.summary.status.state} / ${snapshot.summary.status.name}`);
    console.log(`[probe] current    pick ${snapshot.summary.current.pickId ?? "?"} · ${snapshot.summary.current.currentPick?.team ?? "?"}`);
    console.log(`[probe] selected   ${snapshot.summary.counts.selected}/${snapshot.summary.counts.picks}`);
    console.log(`[probe] best avail ${snapshot.summary.current.bestAvailable?.displayName ?? "n/a"}`);
    console.log(`[probe] changes    ${snapshot.changes.join(" | ")}`);
    console.log(`[probe] saved      ${snapshot.files.summaryPath}`);
  }

  await runOnce();

  if (options.once) return;

  console.log(`[probe] watching every ${options.interval}s`);
  setInterval(() => {
    runOnce().catch((error) => {
      console.error(`[probe] ${new Date().toISOString()} ${error.message}`);
    });
  }, options.interval * 1000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
