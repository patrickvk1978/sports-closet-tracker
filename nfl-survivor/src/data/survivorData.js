export const SURVIVOR_SEASON = 2026;
export const SURVIVOR_CURRENT_WEEK = 4;

export const SURVIVOR_WEEKLY_SLATE = [
  {
    id: "wk4-det-chi",
    kickoff: "2026-09-27T13:00:00-04:00",
    networkWindow: "Early window",
    awayTeam: { code: "CHI", name: "Chicago Bears", shortName: "Bears" },
    homeTeam: { code: "DET", name: "Detroit Lions", shortName: "Lions" },
    favorite: "DET",
    marketWinPct: { CHI: 34, DET: 66 },
    modelWinPct: { CHI: 37, DET: 63 },
    publicPickPct: { CHI: 5, DET: 21 },
  },
  {
    id: "wk4-atl-car",
    kickoff: "2026-09-27T13:00:00-04:00",
    networkWindow: "Early window",
    awayTeam: { code: "ATL", name: "Atlanta Falcons", shortName: "Falcons" },
    homeTeam: { code: "CAR", name: "Carolina Panthers", shortName: "Panthers" },
    favorite: "ATL",
    marketWinPct: { ATL: 61, CAR: 39 },
    modelWinPct: { ATL: 58, CAR: 42 },
    publicPickPct: { ATL: 13, CAR: 2 },
  },
  {
    id: "wk4-bal-cle",
    kickoff: "2026-09-27T13:00:00-04:00",
    networkWindow: "Early window",
    awayTeam: { code: "BAL", name: "Baltimore Ravens", shortName: "Ravens" },
    homeTeam: { code: "CLE", name: "Cleveland Browns", shortName: "Browns" },
    favorite: "BAL",
    marketWinPct: { BAL: 72, CLE: 28 },
    modelWinPct: { BAL: 69, CLE: 31 },
    publicPickPct: { BAL: 18, CLE: 1 },
  },
  {
    id: "wk4-dal-nyg",
    kickoff: "2026-09-27T16:25:00-04:00",
    networkWindow: "Late window",
    awayTeam: { code: "DAL", name: "Dallas Cowboys", shortName: "Cowboys" },
    homeTeam: { code: "NYG", name: "New York Giants", shortName: "Giants" },
    favorite: "DAL",
    marketWinPct: { DAL: 64, NYG: 36 },
    modelWinPct: { DAL: 60, NYG: 40 },
    publicPickPct: { DAL: 11, NYG: 1 },
  },
  {
    id: "wk4-hou-jax",
    kickoff: "2026-09-27T16:25:00-04:00",
    networkWindow: "Late window",
    awayTeam: { code: "HOU", name: "Houston Texans", shortName: "Texans" },
    homeTeam: { code: "JAX", name: "Jacksonville Jaguars", shortName: "Jaguars" },
    favorite: "HOU",
    marketWinPct: { HOU: 56, JAX: 44 },
    modelWinPct: { HOU: 59, JAX: 41 },
    publicPickPct: { HOU: 8, JAX: 3 },
  },
  {
    id: "wk4-kc-lv",
    kickoff: "2026-09-27T20:20:00-04:00",
    networkWindow: "Sunday night",
    awayTeam: { code: "LV", name: "Las Vegas Raiders", shortName: "Raiders" },
    homeTeam: { code: "KC", name: "Kansas City Chiefs", shortName: "Chiefs" },
    favorite: "KC",
    marketWinPct: { LV: 24, KC: 76 },
    modelWinPct: { LV: 27, KC: 73 },
    publicPickPct: { LV: 1, KC: 17 },
  },
  {
    id: "wk4-sea-ari",
    kickoff: "2026-09-28T20:15:00-04:00",
    networkWindow: "Monday night",
    awayTeam: { code: "SEA", name: "Seattle Seahawks", shortName: "Seahawks" },
    homeTeam: { code: "ARI", name: "Arizona Cardinals", shortName: "Cardinals" },
    favorite: "SEA",
    marketWinPct: { SEA: 57, ARI: 43 },
    modelWinPct: { SEA: 54, ARI: 46 },
    publicPickPct: { SEA: 6, ARI: 2 },
  },
  {
    id: "wk4-buf-ne",
    kickoff: "2026-09-28T20:15:00-04:00",
    networkWindow: "Monday night",
    awayTeam: { code: "NE", name: "New England Patriots", shortName: "Patriots" },
    homeTeam: { code: "BUF", name: "Buffalo Bills", shortName: "Bills" },
    favorite: "BUF",
    marketWinPct: { NE: 31, BUF: 69 },
    modelWinPct: { NE: 34, BUF: 66 },
    publicPickPct: { NE: 2, BUF: 15 },
  },
];

export const SURVIVOR_DEFAULT_HISTORY = {
  usedTeams: ["BUF", "KC", "SF"],
  priorWeeks: [
    { week: 1, pick: "BUF", result: "safe" },
    { week: 2, pick: "KC", result: "safe" },
    { week: 3, pick: "SF", result: "safe" },
  ],
};

export const SURVIVOR_MEMBER_TEMPLATES = [
  {
    usedTeams: ["PHI", "CIN", "MIA"],
    priorWeeks: [
      { week: 1, pick: "PHI", result: "safe" },
      { week: 2, pick: "CIN", result: "safe" },
      { week: 3, pick: "MIA", result: "safe" },
    ],
    currentPick: "DET",
    currentGameId: "wk4-det-chi",
    status: "pending",
  },
  {
    usedTeams: ["DET", "BAL", "ATL"],
    priorWeeks: [
      { week: 1, pick: "DET", result: "safe" },
      { week: 2, pick: "BAL", result: "safe" },
      { week: 3, pick: "ATL", result: "safe" },
    ],
    currentPick: "DAL",
    currentGameId: "wk4-dal-nyg",
    status: "pending",
  },
  {
    usedTeams: ["DAL", "MIN", "GB"],
    priorWeeks: [
      { week: 1, pick: "DAL", result: "safe" },
      { week: 2, pick: "MIN", result: "safe" },
      { week: 3, pick: "GB", result: "out" },
    ],
    currentPick: null,
    currentGameId: null,
    status: "eliminated",
    eliminatedWeek: 3,
  },
  {
    usedTeams: ["BAL", "BUF", "LAR"],
    priorWeeks: [
      { week: 1, pick: "BAL", result: "safe" },
      { week: 2, pick: "BUF", result: "safe" },
      { week: 3, pick: "LAR", result: "safe" },
    ],
    currentPick: "SEA",
    currentGameId: "wk4-sea-ari",
    status: "pending",
  },
];

export function findGameById(gameId) {
  return SURVIVOR_WEEKLY_SLATE.find((game) => game.id === gameId) ?? null;
}

export function findGameByTeam(teamCode) {
  return SURVIVOR_WEEKLY_SLATE.find(
    (game) => game.homeTeam.code === teamCode || game.awayTeam.code === teamCode
  ) ?? null;
}
