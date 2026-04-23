import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { takeSnapshot } from "./espnDraftcastProbe.mjs";

const DEFAULT_DRAFT_URL = "https://www.espn.com/nfl/draft/live";
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/espn-draft-sync");
const DEFAULT_POLL_MS = 5000;

const TEAM_ALIASES = {
  ARZ: "ARI",
  ARI: "ARI",
  ATL: "ATL",
  BAL: "BAL",
  BUF: "BUF",
  CAR: "CAR",
  CHI: "CHI",
  CIN: "CIN",
  CLE: "CLE",
  DAL: "DAL",
  DEN: "DEN",
  DET: "DET",
  GB: "GB",
  GNB: "GB",
  HOU: "HOU",
  IND: "IND",
  JAC: "JAX",
  JAX: "JAX",
  KC: "KC",
  LA: "LAR",
  LAR: "LAR",
  LAC: "LAC",
  LV: "LV",
  OAK: "LV",
  MIA: "MIA",
  MIN: "MIN",
  NE: "NE",
  NO: "NO",
  NYG: "NYG",
  NYJ: "NYJ",
  PHI: "PHI",
  PIT: "PIT",
  SEA: "SEA",
  SF: "SF",
  TB: "TB",
  TEN: "TEN",
  WAS: "WAS",
  WSH: "WAS",
};

function parseArgs(argv) {
  const options = {
    url: process.env.DRAFT_URL || DEFAULT_DRAFT_URL,
    outDir: process.env.OUTPUT_DIR ? path.resolve(process.cwd(), process.env.OUTPUT_DIR) : DEFAULT_OUTPUT_DIR,
    pollMs: Number(process.env.POLL_MS || DEFAULT_POLL_MS),
    once: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--url" && argv[index + 1]) {
      options.url = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out-dir" && argv[index + 1]) {
      options.outDir = path.resolve(process.cwd(), argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--poll-ms" && argv[index + 1]) {
      options.pollMs = Math.max(1000, Number(argv[index + 1]) || DEFAULT_POLL_MS);
      index += 1;
      continue;
    }
    if (arg === "--once") {
      options.once = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function mapProviderStatus(status) {
  if (status === "PICK_IS_IN") return "pick_is_in";
  if (status === "SELECTION_MADE") return "revealed";
  return "on_clock";
}

function normalizeTeamCode(value) {
  const upper = String(value ?? "").trim().toUpperCase();
  return TEAM_ALIASES[upper] ?? upper ?? null;
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

function buildProspectMatchers(rows) {
  const byName = new Map();
  rows.forEach((row) => {
    const key = normalizeText(row.name);
    if (key) byName.set(key, row.id);
  });
  return {
    findId(selection) {
      const name = selection?.displayName ?? selection?.name ?? null;
      if (!name) return null;
      return byName.get(normalizeText(name)) ?? null;
    },
  };
}

function buildProviderBoard(snapshot, roundOneBaseTeams) {
  const rawTeams = Array.isArray(snapshot.raw?.teams) ? snapshot.raw.teams : [];
  const teamsById = Object.fromEntries(
    rawTeams.map((team) => [
      String(team.id),
      normalizeTeamCode(team.abbreviation ?? team.shortDisplayName ?? team.name ?? null),
    ])
  );
  const rawPicks = Array.isArray(snapshot.raw?.picks) ? snapshot.raw.picks : [];
  const picks = rawPicks
    .filter((pick) => Number(pick.overall) >= 1 && Number(pick.overall) <= 32)
    .map((pick) => {
      const selection = pick.selection ?? pick.athlete ?? null;
      const pickNumber = Number(pick.overall);
      const teamCode = teamsById[String(pick.teamId)] ?? null;
      return {
        pickNumber,
        providerStatus: pick.status ?? null,
        status: mapProviderStatus(pick.status ?? null),
        teamCode,
        tradeNote: pick.tradeNote ?? "",
        isTrade: teamCode !== roundOneBaseTeams[pickNumber],
        selection,
        expiresAt: pick.expires ?? null,
      };
    });

  const currentPickNumber = Math.min(Math.max(Number(snapshot.summary.current?.pickId ?? 1), 1), 32);
  const currentPick = picks.find((pick) => pick.pickNumber === currentPickNumber) ?? null;
  const phase = snapshot.summary.counts?.selected ? "live" : "pre_draft";

  return {
    phase,
    currentPickNumber,
    currentStatus: currentPick?.status ?? "on_clock",
    providerExpiresAt: currentPick?.status === "ON_THE_CLOCK" ? (currentPick?.expiresAt ?? null) : null,
    picks,
  };
}

async function safeUpsertFeed(draftDb, existingFeed, payload) {
  const hasChanges = Object.entries(payload).some(([key, value]) => existingFeed?.[key] !== value);
  if (existingFeed && !hasChanges) return;

  const basePayload = {
    ...(existingFeed ?? {}),
    ...payload,
    id: 1,
    updated_at: new Date().toISOString(),
  };

  const optionalKeys = ["pick_is_in_at", "provider_expires_at"];
  let attemptPayload = { ...basePayload };
  let { error } = existingFeed
    ? await draftDb.from("feed").update(attemptPayload).eq("id", 1)
    : await draftDb.from("feed").upsert(attemptPayload, { onConflict: "id" });

  while (error) {
    const keyToRemove = optionalKeys.find((key) => Object.prototype.hasOwnProperty.call(attemptPayload, key));
    if (!keyToRemove) break;
    delete attemptPayload[keyToRemove];
    ({ error } = existingFeed
      ? await draftDb.from("feed").update(attemptPayload).eq("id", 1)
      : await draftDb.from("feed").upsert(attemptPayload, { onConflict: "id" }));
  }

  if (error) throw error;
}

async function loadDbState(publicDb, draftDb) {
  const [feedRes, actualRes, overrideRes, picksRes, prospectsRes] = await Promise.all([
    draftDb.from("feed").select("*").eq("id", 1).maybeSingle(),
    draftDb.from("actual_picks").select("*"),
    draftDb.from("team_overrides").select("*"),
    publicDb.from("round_1_picks").select("pick_number,current_team").order("pick_number"),
    publicDb.from("prospects").select("id,name"),
  ]);

  if (feedRes.error) throw feedRes.error;
  if (actualRes.error) throw actualRes.error;
  if (overrideRes.error) throw overrideRes.error;
  if (picksRes.error) throw picksRes.error;
  if (prospectsRes.error) throw prospectsRes.error;

  return {
    feed: feedRes.data ?? null,
    actualPicks: Object.fromEntries((actualRes.data ?? []).map((row) => [Number(row.pick_number), row.prospect_id])),
    teamOverrides: Object.fromEntries((overrideRes.data ?? []).map((row) => [Number(row.pick_number), row.team_code])),
    roundOneBaseTeams: Object.fromEntries((picksRes.data ?? []).map((row) => [Number(row.pick_number), normalizeTeamCode(row.current_team)])),
    prospectMatchers: buildProspectMatchers(prospectsRes.data ?? []),
  };
}

async function applyProviderBoard({ draftDb, dbState, providerBoard, appliedState, dryRun }) {
  const nowIso = new Date().toISOString();
  const feedPayload = {
    phase: providerBoard.phase,
    current_pick_number: providerBoard.currentPickNumber,
    current_status: providerBoard.currentStatus,
    provider_expires_at: providerBoard.providerExpiresAt,
  };

  if (providerBoard.currentStatus === "pick_is_in" && dbState.feed?.current_status !== "pick_is_in") {
    feedPayload.pick_is_in_at = nowIso;
  }
  if (providerBoard.currentStatus !== "pick_is_in") {
    feedPayload.pick_is_in_at = null;
  }

  if (!dryRun) {
    await safeUpsertFeed(draftDb, dbState.feed, feedPayload);
  }

  const nextAppliedState = {
    actualPicks: { ...(appliedState.actualPicks ?? {}) },
    teamOverrides: { ...(appliedState.teamOverrides ?? {}) },
  };

  const appliedOps = [];
  const skippedOps = [];

  for (const pick of providerBoard.picks) {
    const appliedTeam = nextAppliedState.teamOverrides[pick.pickNumber] ?? null;
    const dbTeam = dbState.teamOverrides[pick.pickNumber] ?? null;
    const baseTeam = dbState.roundOneBaseTeams[pick.pickNumber] ?? null;

    if (pick.teamCode && baseTeam && pick.teamCode !== baseTeam) {
      if (!dbTeam || dbTeam === pick.teamCode || (appliedTeam && dbTeam === appliedTeam)) {
        if (!dryRun) {
          const { error } = await draftDb.from("team_overrides").upsert({
            pick_number: pick.pickNumber,
            team_code: pick.teamCode,
          });
          if (error) throw error;
        }
        nextAppliedState.teamOverrides[pick.pickNumber] = pick.teamCode;
        appliedOps.push(`team override pick ${pick.pickNumber} -> ${pick.teamCode}`);
      } else {
        skippedOps.push(`team override pick ${pick.pickNumber} kept admin value ${dbTeam} over provider ${pick.teamCode}`);
      }
    } else if (dbTeam && appliedTeam && dbTeam === appliedTeam) {
      if (!dryRun) {
        const { error } = await draftDb.from("team_overrides").delete().eq("pick_number", pick.pickNumber);
        if (error) throw error;
      }
      delete nextAppliedState.teamOverrides[pick.pickNumber];
      appliedOps.push(`cleared provider team override for pick ${pick.pickNumber}`);
    }

    const providerProspectId = dbState.prospectMatchers.findId(pick.selection);
    if (!pick.selection || !providerProspectId) {
      if (pick.selection && !providerProspectId) {
        skippedOps.push(`selection for pick ${pick.pickNumber} unresolved: ${pick.selection.displayName ?? pick.selection.name ?? "unknown"}`);
      }
      continue;
    }

    const dbProspectId = dbState.actualPicks[pick.pickNumber] ?? null;
    const appliedProspectId = nextAppliedState.actualPicks[pick.pickNumber] ?? null;

    if (!dbProspectId || dbProspectId === providerProspectId || (appliedProspectId && dbProspectId === appliedProspectId)) {
      if (!dryRun) {
        const { error } = await draftDb.from("actual_picks").upsert({
          pick_number: pick.pickNumber,
          prospect_id: providerProspectId,
        });
        if (error) throw error;
      }
      nextAppliedState.actualPicks[pick.pickNumber] = providerProspectId;
      appliedOps.push(`actual pick ${pick.pickNumber} -> ${providerProspectId}`);
      dbState.actualPicks[pick.pickNumber] = providerProspectId;
    } else {
      skippedOps.push(`actual pick ${pick.pickNumber} kept admin value ${dbProspectId} over provider ${providerProspectId}`);
    }
  }

  return { nextAppliedState, appliedOps, skippedOps };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseKey) {
    console.error("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the draft sync.");
    process.exitCode = 1;
    return;
  }

  const publicDb = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const draftDb = publicDb.schema("draft");
  const stateFile = path.join(options.outDir, "provider-applied-state.json");

  let previousSummary = null;
  let tickInFlight = false;

  async function runOnce() {
    if (tickInFlight) return;
    tickInFlight = true;

    try {
      const snapshot = await takeSnapshot(options.url, options.outDir, previousSummary);
      previousSummary = snapshot.summary;

      const dbState = await loadDbState(publicDb, draftDb);
      const providerBoard = buildProviderBoard(snapshot, dbState.roundOneBaseTeams);
      const appliedState = await readJson(stateFile, { actualPicks: {}, teamOverrides: {} });
      const { nextAppliedState, appliedOps, skippedOps } = await applyProviderBoard({
        draftDb,
        dbState,
        providerBoard,
        appliedState,
        dryRun: options.dryRun,
      });

      if (!options.dryRun) {
        await writeJson(stateFile, nextAppliedState);
      }

      console.log(
        `[sync] ${snapshot.summary.fetchedAt} pick ${providerBoard.currentPickNumber} ${providerBoard.currentStatus} applied=${appliedOps.length} skipped=${skippedOps.length}`
      );
      appliedOps.forEach((line) => console.log(`[sync:apply] ${line}`));
      skippedOps.forEach((line) => console.log(`[sync:skip] ${line}`));
    } catch (error) {
      console.error(`[sync] ${new Date().toISOString()} ${error.message}`);
    } finally {
      tickInFlight = false;
    }
  }

  await runOnce();
  if (options.once) return;

  console.log(`[sync] polling ${options.url} every ${Math.round(options.pollMs / 1000)}s`);
  setInterval(() => {
    runOnce().catch((error) => {
      console.error(`[sync] ${new Date().toISOString()} ${error.message}`);
    });
  }, options.pollMs);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
