export const TEAMS = {
  TEN: { code: "TEN", name: "Titans", needs: ["QB", "EDGE", "WR"] },
  CLE: { code: "CLE", name: "Browns", needs: ["QB", "OT", "RB"] },
  NYG: { code: "NYG", name: "Giants", needs: ["QB", "WR", "CB"] },
  NE: { code: "NE", name: "Patriots", needs: ["OT", "WR", "CB"] },
  JAX: { code: "JAX", name: "Jaguars", needs: ["DT", "CB", "WR"] },
  LV: { code: "LV", name: "Raiders", needs: ["QB", "CB", "RB"] },
  NYJ: { code: "NYJ", name: "Jets", needs: ["TE", "RT", "DT"] },
  CAR: { code: "CAR", name: "Panthers", needs: ["EDGE", "WR", "S"] },
};

export const ROUND_ONE_PICKS = [
  { number: 1, originalTeam: "TEN", currentTeam: "TEN" },
  { number: 2, originalTeam: "CLE", currentTeam: "CLE" },
  { number: 3, originalTeam: "NYG", currentTeam: "NYG" },
  { number: 4, originalTeam: "NE", currentTeam: "NE" },
  { number: 5, originalTeam: "JAX", currentTeam: "JAX" },
  { number: 6, originalTeam: "LV", currentTeam: "LV" },
  { number: 7, originalTeam: "NYJ", currentTeam: "NYJ" },
  { number: 8, originalTeam: "CAR", currentTeam: "CAR" },
];

export const PROSPECTS = [
  {
    id: "cam-ward",
    name: "Cam Ward",
    position: "QB",
    school: "Miami",
    consensus: 1,
    espn: 1,
    pff: 2,
    dane: 1,
    predictedRange: "1-3",
    notes: "Creative off-platform thrower with starter traits and top-of-board buzz.",
  },
  {
    id: "travis-hunter",
    name: "Travis Hunter",
    position: "CB/WR",
    school: "Colorado",
    consensus: 2,
    espn: 2,
    pff: 1,
    dane: 2,
    predictedRange: "2-4",
    notes: "True two-way star. Elite ball skills and instant spotlight value.",
  },
  {
    id: "abdul-carter",
    name: "Abdul Carter",
    position: "EDGE",
    school: "Penn State",
    consensus: 3,
    espn: 3,
    pff: 4,
    dane: 3,
    predictedRange: "2-6",
    notes: "Explosive pass-rusher who consistently shows up in top-three scenarios.",
  },
  {
    id: "will-campbell",
    name: "Will Campbell",
    position: "OT",
    school: "LSU",
    consensus: 4,
    espn: 4,
    pff: 6,
    dane: 4,
    predictedRange: "4-8",
    notes: "High-floor tackle prospect and frequent fit for tackle-needy teams.",
  },
  {
    id: "tet-mcmillan",
    name: "Tetairoa McMillan",
    position: "WR",
    school: "Arizona",
    consensus: 5,
    espn: 5,
    pff: 3,
    dane: 5,
    predictedRange: "4-10",
    notes: "Boundary receiver with size, catch radius, and red-zone gravity.",
  },
  {
    id: "mason-graham",
    name: "Mason Graham",
    position: "DT",
    school: "Michigan",
    consensus: 6,
    espn: 7,
    pff: 5,
    dane: 6,
    predictedRange: "5-10",
    notes: "Quick disruptive interior defender with day-one impact profile.",
  },
  {
    id: "ashton-jeanty",
    name: "Ashton Jeanty",
    position: "RB",
    school: "Boise State",
    consensus: 7,
    espn: 6,
    pff: 7,
    dane: 8,
    predictedRange: "6-12",
    notes: "Feature back talent who could crash the top ten in the right script.",
  },
  {
    id: "will-johnson",
    name: "Will Johnson",
    position: "CB",
    school: "Michigan",
    consensus: 8,
    espn: 9,
    pff: 9,
    dane: 7,
    predictedRange: "7-14",
    notes: "Long corner with clear CB1 upside and sticky coverage traits.",
  },
  {
    id: "kelvin-banks",
    name: "Kelvin Banks",
    position: "OT",
    school: "Texas",
    consensus: 9,
    espn: 10,
    pff: 8,
    dane: 9,
    predictedRange: "8-14",
    notes: "Smooth pass protector with top-half of Round 1 range.",
  },
  {
    id: "jalen-milroe",
    name: "Jalen Milroe",
    position: "QB",
    school: "Alabama",
    consensus: 10,
    espn: 12,
    pff: 11,
    dane: 10,
    predictedRange: "10-20",
    notes: "High-variance quarterback with tools teams may chase.",
  },
];

export const DEFAULT_BIG_BOARD_IDS = PROSPECTS.map((prospect) => prospect.id);

export const DEFAULT_LIVE_PREDICTIONS = {
  1: "cam-ward",
  2: "travis-hunter",
  3: "abdul-carter",
  4: "will-campbell",
  5: "mason-graham",
  6: "ashton-jeanty",
  7: "will-johnson",
  8: "kelvin-banks",
};

export const DEFAULT_MOCK_PREDICTIONS = {
  1: "cam-ward",
  2: "travis-hunter",
  3: "abdul-carter",
  4: "will-campbell",
  5: "mason-graham",
  6: "ashton-jeanty",
  7: "will-johnson",
  8: "kelvin-banks",
};

export const DEFAULT_ACTUAL_PICKS = {
  1: "cam-ward",
  2: "travis-hunter",
  3: "abdul-carter",
  4: "will-campbell",
  5: "mason-graham",
  6: "ashton-jeanty",
  7: "will-johnson",
  8: "kelvin-banks",
};

export function getProspectById(prospectId) {
  return PROSPECTS.find((prospect) => prospect.id === prospectId) ?? null;
}

export function getPickLabel(pickNumber) {
  const pick = ROUND_ONE_PICKS.find((item) => item.number === pickNumber);
  if (!pick) return `Pick ${pickNumber}`;
  return `${TEAMS[pick.currentTeam].name} (${pick.number})`;
}
