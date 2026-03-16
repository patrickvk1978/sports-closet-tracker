// ─── Full Bracket (round-by-round game data per region) ───────────────────────
//
// Seed-pair ordering follows standard bracket format:
//   R64: (1v16, 8v9), (5v12, 4v13), (6v11, 3v14), (7v10, 2v15)
//   Each adjacent pair feeds into the next round in order.

export const BRACKET = {
  midwest: {
    name: "Midwest", color: "#f97316",
    rounds: {
      R64: [
        { t1: "Kentucky",    s1: 1,  t2: "Hampton",      s2: 16, winner: "Kentucky",    status: "final" },
        { t1: "Cincinnati",  s1: 8,  t2: "Purdue",       s2: 9,  winner: "Purdue",      status: "final" },
        { t1: "W. Virginia", s1: 5,  t2: "Buffalo",      s2: 12, winner: "W. Virginia", status: "final" },
        { t1: "Maryland",    s1: 4,  t2: "Valparaiso",   s2: 13, winner: "Maryland",    status: "final" },
        { t1: "Butler",      s1: 6,  t2: "Texas",        s2: 11, winner: "Butler",      status: "final" },
        { t1: "Notre Dame",  s1: 3,  t2: "Northeastern", s2: 14, winner: "Notre Dame",  status: "final" },
        { t1: "Wichita St",  s1: 7,  t2: "Indiana",      s2: 10, winner: "Wichita St",  status: "final" },
        { t1: "Kansas",      s1: 2,  t2: "New Mex. St",  s2: 15, winner: "Kansas",      status: "final" },
      ],
      R32: [
        { t1: "Kentucky",    s1: 1,  t2: "Purdue",       s2: 9,  winner: "Kentucky",    status: "final" },
        { t1: "W. Virginia", s1: 5,  t2: "Maryland",     s2: 4,  winner: "Maryland",    status: "final" },
        { t1: "Butler",      s1: 6,  t2: "Notre Dame",   s2: 3,  winner: "Notre Dame",  status: "final" },
        { t1: "Wichita St",  s1: 7,  t2: "Kansas",       s2: 2,  winner: "Kansas",      status: "final" },
      ],
      S16: [
        { t1: "Kentucky",    s1: 1,  t2: "Maryland",     s2: 4,  winner: "Kentucky",    status: "final" },
        { t1: "Notre Dame",  s1: 3,  t2: "Kansas",       s2: 2,  winner: "Notre Dame",  status: "final" },
      ],
      E8: [
        { t1: "Kentucky",    s1: 1,  t2: "Notre Dame",   s2: 3,  winner: "Kentucky",    status: "final" },
      ],
    },
  },
  west: {
    name: "West", color: "#06b6d4",
    rounds: {
      R64: [
        { t1: "Wisconsin",   s1: 1,  t2: "Coastal Car.", s2: 16, winner: "Wisconsin",   status: "final" },
        { t1: "Oregon",      s1: 8,  t2: "Oklahoma St",  s2: 9,  winner: "Oregon",      status: "final" },
        { t1: "Arkansas",    s1: 5,  t2: "Wofford",      s2: 12, winner: "Arkansas",    status: "final" },
        { t1: "N. Carolina", s1: 4,  t2: "Harvard",      s2: 13, winner: "N. Carolina", status: "final" },
        { t1: "Xavier",      s1: 6,  t2: "Ole Miss",     s2: 11, winner: "Xavier",      status: "final" },
        { t1: "Baylor",      s1: 3,  t2: "Georgia St",   s2: 14, winner: "Baylor",      status: "final" },
        { t1: "VCU",         s1: 7,  t2: "Ohio St",      s2: 10, winner: "VCU",         status: "final" },
        { t1: "Arizona",     s1: 2,  t2: "Tex. Southern",s2: 15, winner: "Arizona",     status: "final" },
      ],
      R32: [
        { t1: "Wisconsin",   s1: 1,  t2: "Oregon",       s2: 8,  winner: "Wisconsin",   status: "final" },
        { t1: "Arkansas",    s1: 5,  t2: "N. Carolina",  s2: 4,  winner: "N. Carolina", status: "final" },
        { t1: "Xavier",      s1: 6,  t2: "Baylor",       s2: 3,  winner: "Baylor",      status: "final" },
        { t1: "VCU",         s1: 7,  t2: "Arizona",      s2: 2,  winner: "Arizona",     status: "final" },
      ],
      S16: [
        { t1: "Wisconsin",   s1: 1,  t2: "N. Carolina",  s2: 4,  winner: "Wisconsin",   status: "final" },
        { t1: "Baylor",      s1: 3,  t2: "Arizona",      s2: 2,  winner: "Arizona",     status: "final" },
      ],
      E8: [
        { t1: "Wisconsin",   s1: 1,  t2: "Arizona",      s2: 2,  winner: "Wisconsin",   status: "final" },
      ],
    },
  },
  south: {
    name: "South", color: "#a78bfa",
    rounds: {
      R64: [
        { t1: "Duke",        s1: 1,  t2: "R. Morris",    s2: 16, winner: "Duke",        status: "final" },
        { t1: "San Diego St",s1: 8,  t2: "St. John's",   s2: 9,  winner: "San Diego St",status: "final" },
        { t1: "Utah",        s1: 5,  t2: "SF Austin",    s2: 12, winner: "Utah",        status: "final" },
        { t1: "Georgetown",  s1: 4,  t2: "E. Washington",s2: 13, winner: "Georgetown",  status: "final" },
        { t1: "SMU",         s1: 6,  t2: "UCLA",         s2: 11, winner: "SMU",         status: "final" },
        { t1: "Iowa St",     s1: 3,  t2: "UAB",          s2: 14, winner: "Iowa St",     status: "final" },
        { t1: "Iowa",        s1: 7,  t2: "Davidson",     s2: 10, winner: "Iowa",        status: "final" },
        { t1: "Gonzaga",     s1: 2,  t2: "N. Dakota St", s2: 15, winner: "Gonzaga",     status: "final" },
      ],
      R32: [
        { t1: "Duke",        s1: 1,  t2: "San Diego St", s2: 8,  winner: "Duke",        status: "final" },
        { t1: "Utah",        s1: 5,  t2: "Georgetown",   s2: 4,  winner: "Georgetown",  status: "final" },
        { t1: "SMU",         s1: 6,  t2: "Iowa St",      s2: 3,  winner: "Iowa St",     status: "final" },
        { t1: "Iowa",        s1: 7,  t2: "Gonzaga",      s2: 2,  winner: "Gonzaga",     status: "final" },
      ],
      S16: [
        { t1: "Duke",        s1: 1,  t2: "Georgetown",   s2: 4,  winner: "Duke",        status: "final" },
        { t1: "Iowa St",     s1: 3,  t2: "Gonzaga",      s2: 2,  winner: "Gonzaga",     status: "final" },
      ],
      E8: [
        { t1: "Duke",        s1: 1,  t2: "Gonzaga",      s2: 2,  winner: "Duke",        status: "final" },
      ],
    },
  },
  east: {
    name: "East", color: "#22c55e",
    rounds: {
      R64: [
        { t1: "Villanova",   s1: 1,  t2: "Lafayette",   s2: 16, winner: "Villanova",   status: "final" },
        { t1: "NC State",    s1: 8,  t2: "LSU",          s2: 9,  winner: "NC State",    status: "final" },
        { t1: "N. Iowa",     s1: 5,  t2: "Wyoming",      s2: 12, winner: "N. Iowa",     status: "final" },
        { t1: "Louisville",  s1: 4,  t2: "UC Irvine",    s2: 13, winner: "Louisville",  status: "final" },
        { t1: "Providence",  s1: 6,  t2: "Dayton",       s2: 11, winner: "Providence",  status: "final" },
        { t1: "Oklahoma",    s1: 3,  t2: "Albany",       s2: 14, winner: "Oklahoma",    status: "final" },
        { t1: "Michigan St", s1: 7,  t2: "Georgia",      s2: 10, winner: "Michigan St", status: "final" },
        { t1: "Virginia",    s1: 2,  t2: "Belmont",      s2: 15, winner: "Virginia",    status: "final" },
      ],
      R32: [
        { t1: "Villanova",   s1: 1,  t2: "NC State",     s2: 8,  winner: "Villanova",   status: "final" },
        { t1: "N. Iowa",     s1: 5,  t2: "Louisville",   s2: 4,  winner: "Louisville",  status: "final" },
        { t1: "Providence",  s1: 6,  t2: "Oklahoma",     s2: 3,  winner: "Oklahoma",    status: "final" },
        { t1: "Michigan St", s1: 7,  t2: "Virginia",     s2: 2,  winner: "Michigan St", status: "final" },
      ],
      S16: [
        { t1: "Villanova",   s1: 1,  t2: "Louisville",   s2: 4,  winner: "Louisville",  status: "final" },
        { t1: "Oklahoma",    s1: 3,  t2: "Michigan St",  s2: 7,  winner: "Michigan St", status: "final" },
      ],
      E8: [
        { t1: "Louisville",  s1: 4,  t2: "Michigan St",  s2: 7,  winner: "Michigan St", status: "final" },
      ],
    },
  },
};

// ─── Tournament Regions ────────────────────────────────────────────────────────

export const REGIONS = {
  midwest: {
    name: "Midwest",
    color: "#f97316",
    seeds: [
      { seed: 1,  team: "Kentucky",       eliminated: false },
      { seed: 16, team: "Hampton",         eliminated: true },
      { seed: 8,  team: "Cincinnati",      eliminated: true },
      { seed: 9,  team: "Purdue",          eliminated: true },
      { seed: 5,  team: "West Virginia",   eliminated: true },
      { seed: 12, team: "Buffalo",         eliminated: true },
      { seed: 4,  team: "Maryland",        eliminated: true },
      { seed: 13, team: "Valparaiso",      eliminated: true },
      { seed: 6,  team: "Butler",          eliminated: true },
      { seed: 11, team: "Texas",           eliminated: true },
      { seed: 3,  team: "Notre Dame",      eliminated: true },
      { seed: 14, team: "Northeastern",    eliminated: true },
      { seed: 7,  team: "Wichita St",      eliminated: true },
      { seed: 10, team: "Indiana",         eliminated: true },
      { seed: 2,  team: "Kansas",          eliminated: true },
      { seed: 15, team: "New Mexico St",   eliminated: true },
    ],
  },
  west: {
    name: "West",
    color: "#06b6d4",
    seeds: [
      { seed: 1,  team: "Wisconsin",       eliminated: false },
      { seed: 16, team: "Coastal Car.",    eliminated: true },
      { seed: 8,  team: "Oregon",          eliminated: true },
      { seed: 9,  team: "Oklahoma St",     eliminated: true },
      { seed: 5,  team: "Arkansas",        eliminated: true },
      { seed: 12, team: "Wofford",         eliminated: true },
      { seed: 4,  team: "North Carolina",  eliminated: true },
      { seed: 13, team: "Harvard",         eliminated: true },
      { seed: 6,  team: "Xavier",          eliminated: true },
      { seed: 11, team: "Ole Miss",        eliminated: true },
      { seed: 3,  team: "Baylor",          eliminated: true },
      { seed: 14, team: "Georgia St",      eliminated: true },
      { seed: 7,  team: "VCU",             eliminated: true },
      { seed: 10, team: "Ohio St",         eliminated: true },
      { seed: 2,  team: "Arizona",         eliminated: true },
      { seed: 15, team: "Texas Southern",  eliminated: true },
    ],
  },
  south: {
    name: "South",
    color: "#a78bfa",
    seeds: [
      { seed: 1,  team: "Duke",            eliminated: false },
      { seed: 16, team: "R. Morris",       eliminated: true },
      { seed: 8,  team: "San Diego St",    eliminated: true },
      { seed: 9,  team: "St. John's",      eliminated: true },
      { seed: 5,  team: "Utah",            eliminated: true },
      { seed: 12, team: "SF Austin",       eliminated: true },
      { seed: 4,  team: "Georgetown",      eliminated: true },
      { seed: 13, team: "E. Washington",   eliminated: true },
      { seed: 6,  team: "SMU",             eliminated: true },
      { seed: 11, team: "UCLA",            eliminated: true },
      { seed: 3,  team: "Iowa St",         eliminated: true },
      { seed: 14, team: "UAB",             eliminated: true },
      { seed: 7,  team: "Iowa",            eliminated: true },
      { seed: 10, team: "Davidson",        eliminated: true },
      { seed: 2,  team: "Gonzaga",         eliminated: true },
      { seed: 15, team: "N. Dakota St",    eliminated: true },
    ],
  },
  east: {
    name: "East",
    color: "#22c55e",
    seeds: [
      { seed: 1,  team: "Villanova",       eliminated: true },
      { seed: 16, team: "Lafayette",       eliminated: true },
      { seed: 8,  team: "NC State",        eliminated: true },
      { seed: 9,  team: "LSU",             eliminated: true },
      { seed: 5,  team: "Northern Iowa",   eliminated: true },
      { seed: 12, team: "Wyoming",         eliminated: true },
      { seed: 4,  team: "Louisville",      eliminated: true },
      { seed: 13, team: "UC Irvine",       eliminated: true },
      { seed: 6,  team: "Providence",      eliminated: true },
      { seed: 11, team: "Dayton",          eliminated: true },
      { seed: 3,  team: "Oklahoma",        eliminated: true },
      { seed: 14, team: "Albany",          eliminated: true },
      { seed: 7,  team: "Michigan St",     eliminated: false },
      { seed: 10, team: "Georgia",         eliminated: true },
      { seed: 2,  team: "Virginia",        eliminated: true },
      { seed: 15, team: "Belmont",         eliminated: true },
    ],
  },
};

// ─── Final Four & Championship ─────────────────────────────────────────────────

export const FINAL_FOUR = [
  { game: 1, team1: "Kentucky", seed1: 1, team2: "Wisconsin",   seed2: 1, winner: "Wisconsin",  status: "final" },
  { game: 2, team1: "Duke",     seed1: 1, team2: "Michigan St", seed2: 7, winner: null,          status: "live"  },
];

export const CHAMPIONSHIP = {
  team1: "Wisconsin",
  team2: "TBD",
  winner: null,
  status: "pending",
};

// ─── Matrix Games ──────────────────────────────────────────────────────────────

// KEY_SLOTS = [14(Midwest E8), 29(West E8), 59(East E8), 44(South E8), 60(F4-SF1), 61(F4-SF2), 62(Champ)]
// Mock GAMES covers only the 7 key slots; real data covers all 63.
// slot_index enables correct picks lookup: player.picks[game.slot_index]
function _g(id, slotIdx, round, roundKey, region, regionColor, matchup, t1, t2, status, winner) {
  return { id, slot_index: slotIdx, round, roundKey, region, regionColor,
    isKeyGame: ['E8','F4','Champ'].includes(roundKey), firstInRegion: false,
    seed1: null, seed2: null, matchup, team1: t1, team2: t2,
    status, winner, score1: null, score2: null, gameNote: null }
}
export const GAMES = [
  _g(1, 14, 'E8',          'E8',    'Midwest', '#f97316', 'Kent vs ND',   'Kentucky',   'Notre Dame',  'final',   'Kentucky'  ),
  _g(2, 29, 'E8',          'E8',    'West',    '#06b6d4', 'Wisc vs Ariz', 'Wisconsin',  'Arizona',     'final',   'Wisconsin' ),
  _g(3, 59, 'E8',          'E8',    'East',    '#22c55e', 'MSU vs Lou',   'Michigan St','Louisville',  'final',   'Michigan St'),
  _g(4, 44, 'E8',          'E8',    'South',   '#a78bfa', 'Duke vs Gonz', 'Duke',       'Gonzaga',     'final',   'Duke'      ),
  _g(5, 60, 'Final Four',  'F4',    'Final',   '#fbbf24', 'Kent vs Wisc', 'Kentucky',   'Wisconsin',   'final',   'Wisconsin' ),
  _g(6, 61, 'Final Four',  'F4',    'Final',   '#fbbf24', 'Duke vs MSU',  'Duke',       'Michigan St', 'live',    null        ),
  _g(7, 62, 'Championship','Champ', 'Final',   '#fbbf24', 'TBD vs TBD',   null,          null,          'pending', null        ),
];

export const ROUNDS = ['E8', 'Final Four', 'Championship'];

// ─── Players ───────────────────────────────────────────────────────────────────

// Expand 7 key picks into full 63-slot array.
// KEY_SLOTS = [14(MidE8), 29(WstE8), 59(EstE8), 44(SthE8), 60(F4-1), 61(F4-2), 62(Champ)]
function _p(e8mw, e8w, e8e, e8s, sf1, sf2, champ) {
  const p = Array(63).fill(null);
  p[14]=e8mw; p[29]=e8w; p[59]=e8e; p[44]=e8s; p[60]=sf1; p[61]=sf2; p[62]=champ;
  return p;
}
export const PLAYERS = [
  { rank: 1,  name: "erika-lenhart",  points: 1370, ppr: 480, winProb: 23.4, champAlive: true,  trend: "up",   picks: _p("Kentucky","Wisconsin","Virginia",   "Duke",     "Kentucky","Duke",      "Duke"      ) },
  { rank: 2,  name: "PayThePlayers",  points: 1330, ppr: 480, winProb: 19.1, champAlive: true,  trend: "up",   picks: _p("Kentucky","Wisconsin","Virginia",   "Duke",     "Kentucky","Duke",      "Duke"      ) },
  { rank: 3,  name: "ewolfe9",        points: 1150, ppr: 640, winProb: 15.7, champAlive: true,  trend: "up",   picks: _p("Kentucky","UNC",      "Villanova",  "Duke",     "Kentucky","Duke",      "Duke"      ) },
  { rank: 4,  name: "Stefan G.",      points: 1130, ppr: 480, winProb: 8.2,  champAlive: false, trend: "down", picks: _p("Kentucky","Wisconsin","Oklahoma",   "Duke",     "Wisconsin","Duke",     "Wisconsin" ) },
  { rank: 5,  name: "Roberto8464",    points: 1080, ppr: 320, winProb: 6.8,  champAlive: true,  trend: "same", picks: _p("Kentucky","Wisconsin","Louisville", "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 5,  name: "DancingInDark",  points: 1080, ppr: 480, winProb: 6.1,  champAlive: true,  trend: "up",   picks: _p("Kentucky","Wisconsin","Louisville", "Duke",     "Wisconsin","Duke",     "Kentucky"  ) },
  { rank: 7,  name: "Eric4197",       points: 1030, ppr: 480, winProb: 5.3,  champAlive: false, trend: "down", picks: _p("Kentucky","Wisconsin","Villanova",  "Duke",     "Wisconsin","Villanova","Villanova" ) },
  { rank: 8,  name: "dukesucks15",    points: 1020, ppr: 480, winProb: 4.9,  champAlive: true,  trend: "same", picks: _p("Kentucky","Wisconsin","Virginia",   "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 9,  name: "josedavila",     points: 1010, ppr: 480, winProb: 3.2,  champAlive: true,  trend: "up",   picks: _p("Kentucky","Wisconsin","Virginia",   "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 10, name: "MediocreBrckt",  points: 1000, ppr: 320, winProb: 2.8,  champAlive: true,  trend: "same", picks: _p("Kentucky","Arizona",   "Villanova",  "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 10, name: "KicyMotley",     points: 1000, ppr: 320, winProb: 2.1,  champAlive: true,  trend: "same", picks: _p("Kentucky","Arizona",   "Virginia",   "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 10, name: "on Paul Lupo",   points: 1000, ppr: 480, winProb: 1.9,  champAlive: true,  trend: "up",   picks: _p("Kentucky","UNC",      "Michigan St","Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 13, name: "Bing",           points: 970,  ppr: 320, winProb: 0.5,  champAlive: true,  trend: "down", picks: _p("Kentucky","UNC",      "Louisville", "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
  { rank: 14, name: "jackiedee",      points: 960,  ppr: 480, winProb: 0.3,  champAlive: false, trend: "down", picks: _p("Kentucky","Wisconsin","Villanova",  "Iowa St",  "Wisconsin","Villanova","Wisconsin" ) },
  { rank: 14, name: "Josh Gold",      points: 960,  ppr: 320, winProb: 0.1,  champAlive: true,  trend: "down", picks: _p("Kentucky","Wisconsin","Virginia",   "Duke",     "Kentucky","Duke",      "Kentucky"  ) },
];

export const PLAYER_COLORS = {
  "erika-lenhart": "#f97316",
  "PayThePlayers":  "#06b6d4",
  "ewolfe9":        "#a78bfa",
  "Stefan G.":      "#f43f5e",
  "Roberto8464":    "#22c55e",
};

// ─── Dashboard Data ────────────────────────────────────────────────────────────

export const LEVERAGE_GAMES = [
  {
    id: 1,
    matchup: "Duke vs Michigan St",
    time: "LIVE — 2nd Half",
    team1: "Duke",
    team2: "Michigan St",
    status: "live",
    score1: 34,
    score2: 29,
    gameNote: "2nd Half 8:42",
    leverage: 85,
    pickPct1: 78,
    pickPct2: 22,
    playerImpacts: [
      { player: "erika-lenhart", ifTeam1: 28.1, ifTeam2: 11.2, swing: 16.9 },
      { player: "ewolfe9",       ifTeam1: 19.3, ifTeam2: 8.8,  swing: 10.5 },
      { player: "PayThePlayers", ifTeam1: 22.7, ifTeam2: 14.1, swing: 8.6  },
      { player: "Stefan G.",     ifTeam1: 6.1,  ifTeam2: 9.4,  swing: 3.3  },
    ],
  },
  {
    id: 2,
    matchup: "Kentucky vs Notre Dame",
    time: "Today 7:09 PM ET",
    team1: "Kentucky",
    team2: "Notre Dame",
    status: "upcoming",
    score1: null,
    score2: null,
    gameNote: null,
    leverage: 62,
    pickPct1: 55,
    pickPct2: 45,
    playerImpacts: [
      { player: "ewolfe9",       ifTeam1: 22.1, ifTeam2: 9.4,  swing: 12.7 },
      { player: "PayThePlayers", ifTeam1: 18.3, ifTeam2: 11.2, swing: 7.1  },
      { player: "erika-lenhart", ifTeam1: 21.8, ifTeam2: 17.6, swing: 4.2  },
    ],
  },
  {
    id: 3,
    matchup: "Wisconsin vs Arizona",
    time: "Today 9:39 PM ET",
    team1: "Wisconsin",
    team2: "Arizona",
    status: "upcoming",
    score1: null,
    score2: null,
    gameNote: null,
    leverage: 58,
    pickPct1: 62,
    pickPct2: 38,
    playerImpacts: [
      { player: "Stefan G.",     ifTeam1: 11.4, ifTeam2: 5.2,  swing: 6.2  },
      { player: "erika-lenhart", ifTeam1: 24.1, ifTeam2: 19.3, swing: 4.8  },
      { player: "ewolfe9",       ifTeam1: 16.7, ifTeam2: 13.1, swing: 3.6  },
    ],
  },
  {
    id: 4,
    matchup: "Villanova vs Louisville",
    time: "Tomorrow 7:00 PM ET",
    team1: "Villanova",
    team2: "Louisville",
    status: "upcoming",
    score1: null,
    score2: null,
    gameNote: null,
    leverage: 41,
    pickPct1: 44,
    pickPct2: 56,
    playerImpacts: [
      { player: "ewolfe9",       ifTeam1: 18.9, ifTeam2: 12.4, swing: 6.5  },
      { player: "KicyMotley",    ifTeam1: 3.8,  ifTeam2: 1.1,  swing: 2.7  },
      { player: "erika-lenhart", ifTeam1: 22.9, ifTeam2: 21.4, swing: 1.5  },
    ],
  },
  {
    id: 5,
    matchup: "Championship — TBD vs TBD",
    time: "Monday 9:00 PM ET",
    team1: "TBD",
    team2: "TBD",
    status: "upcoming",
    score1: null,
    score2: null,
    gameNote: null,
    leverage: 92,
    pickPct1: 50,
    pickPct2: 50,
    playerImpacts: [
      { player: "ewolfe9",       ifTeam1: 31.2, ifTeam2: 4.1,  swing: 27.1 },
      { player: "erika-lenhart", ifTeam1: 26.8, ifTeam2: 18.9, swing: 7.9  },
      { player: "PayThePlayers", ifTeam1: 21.3, ifTeam2: 14.7, swing: 6.6  },
    ],
  },
];

export const CONSENSUS = [
  { game: "Duke vs Michigan St", team1: "Duke", team2: "Michigan St", pct1: 78, pct2: 22 },
];

export const ELIMINATION_STATS = [
  { label: "Champion Still Alive",    count: 9,  total: 15, icon: "🏆" },
  { label: "Final Four Intact (3+)", count: 4,  total: 15, icon: "🎯" },
  { label: "Mathematically Alive",   count: 12, total: 15, icon: "📊" },
  { label: "Effectively Eliminated", count: 3,  total: 15, icon: "💀" },
];

export const WIN_PROB_HISTORY = [
  { round: "R64", players: { "erika-lenhart": 5.2,  "PayThePlayers": 4.8,  "ewolfe9": 3.1,  "Stefan G.": 6.7,  "Roberto8464": 2.9 } },
  { round: "R32", players: { "erika-lenhart": 8.4,  "PayThePlayers": 9.1,  "ewolfe9": 5.6,  "Stefan G.": 11.2, "Roberto8464": 3.4 } },
  { round: "S16", players: { "erika-lenhart": 14.2, "PayThePlayers": 12.8, "ewolfe9": 9.3,  "Stefan G.": 13.5, "Roberto8464": 5.1 } },
  { round: "E8",  players: { "erika-lenhart": 19.8, "PayThePlayers": 16.4, "ewolfe9": 12.1, "Stefan G.": 9.8,  "Roberto8464": 7.2 } },
  { round: "F4",  players: { "erika-lenhart": 23.4, "PayThePlayers": 19.1, "ewolfe9": 15.7, "Stefan G.": 8.2,  "Roberto8464": 6.8 } },
];

// ─── Phase 3 placeholders (replaced by Monte Carlo output) ────────────────────

export const LEVERAGE_THRESHOLD = 15 // min swing % to surface a game as "key"

// Best path bullets — keyed by player name; Phase 3 derives these from simulations
export const BEST_PATH = {
  "erika-lenhart": [
    { text: "Duke wins the championship", type: "good" },
    { text: "Michigan St eliminated before Final Four", type: "good" },
    { text: "Maintain lead over PayThePlayers", type: "neutral" },
  ],
  "ewolfe9": [
    { text: "Duke wins the championship", type: "good" },
    { text: "Villanova upsets the field", type: "good" },
    { text: "erika-lenhart's champion eliminated", type: "neutral" },
  ],
  _default: [
    { text: "Your champion keeps winning", type: "good" },
    { text: "Top seed eliminated in your region", type: "neutral" },
    { text: "Pool leader's picks go cold", type: "neutral" },
  ],
}
