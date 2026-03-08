// Generates seed.sql for the 63-slot games table.
// Uses the 2015 mock bracket as placeholder — update team names after Selection Sunday.
// Run: node supabase/gen-seed.mjs > supabase/seed.sql

const REGION_KEYS  = ['midwest', 'west', 'south', 'east']
const REGION_BASES = [0, 15, 30, 45]

// 2015 bracket data (placeholder until 2026 bracket is announced)
const BRACKET = {
  midwest: { rounds: {
    R64: [
      { t1: 'Kentucky',    s1: 1,  t2: 'Hampton',      s2: 16 },
      { t1: 'Cincinnati',  s1: 8,  t2: 'Purdue',        s2: 9  },
      { t1: 'W. Virginia', s1: 5,  t2: 'Buffalo',       s2: 12 },
      { t1: 'Maryland',    s1: 4,  t2: 'Valparaiso',    s2: 13 },
      { t1: 'Butler',      s1: 6,  t2: 'Texas',         s2: 11 },
      { t1: 'Notre Dame',  s1: 3,  t2: 'Northeastern',  s2: 14 },
      { t1: 'Wichita St',  s1: 7,  t2: 'Indiana',       s2: 10 },
      { t1: 'Kansas',      s1: 2,  t2: 'New Mex. St',   s2: 15 },
    ],
  }},
  west: { rounds: {
    R64: [
      { t1: 'Wisconsin',   s1: 1,  t2: 'Coastal Car.',  s2: 16 },
      { t1: 'Oregon',      s1: 8,  t2: 'Oklahoma St',   s2: 9  },
      { t1: 'Arkansas',    s1: 5,  t2: 'Wofford',       s2: 12 },
      { t1: 'N. Carolina', s1: 4,  t2: 'Harvard',       s2: 13 },
      { t1: 'Xavier',      s1: 6,  t2: 'Ole Miss',      s2: 11 },
      { t1: 'Baylor',      s1: 3,  t2: 'Georgia St',    s2: 14 },
      { t1: 'VCU',         s1: 7,  t2: 'Ohio St',       s2: 10 },
      { t1: 'Arizona',     s1: 2,  t2: 'Tex. Southern', s2: 15 },
    ],
  }},
  south: { rounds: {
    R64: [
      { t1: 'Duke',        s1: 1,  t2: 'R. Morris',     s2: 16 },
      { t1: 'San Diego St',s1: 8,  t2: 'St. Johns',      s2: 9  },
      { t1: 'Utah',        s1: 5,  t2: 'SF Austin',     s2: 12 },
      { t1: 'Georgetown',  s1: 4,  t2: 'E. Washington', s2: 13 },
      { t1: 'SMU',         s1: 6,  t2: 'UCLA',          s2: 11 },
      { t1: 'Iowa St',     s1: 3,  t2: 'UAB',           s2: 14 },
      { t1: 'Iowa',        s1: 7,  t2: 'Davidson',      s2: 10 },
      { t1: 'Gonzaga',     s1: 2,  t2: 'N. Dakota St',  s2: 15 },
    ],
  }},
  east: { rounds: {
    R64: [
      { t1: 'Villanova',   s1: 1,  t2: 'Lafayette',     s2: 16 },
      { t1: 'NC State',    s1: 8,  t2: 'LSU',           s2: 9  },
      { t1: 'N. Iowa',     s1: 5,  t2: 'Wyoming',       s2: 12 },
      { t1: 'Louisville',  s1: 4,  t2: 'UC Irvine',     s2: 13 },
      { t1: 'Providence',  s1: 6,  t2: 'Dayton',        s2: 11 },
      { t1: 'Oklahoma',    s1: 3,  t2: 'Albany',        s2: 14 },
      { t1: 'Michigan St', s1: 7,  t2: 'Georgia',       s2: 10 },
      { t1: 'Virginia',    s1: 2,  t2: 'Belmont',       s2: 15 },
    ],
  }},
}

const rows = []

// Regional games
REGION_KEYS.forEach((region, ri) => {
  const base  = REGION_BASES[ri]
  const r64   = BRACKET[region].rounds.R64

  // R64
  r64.forEach((g, gi) => {
    const teams = JSON.stringify({ team1: g.t1, seed1: g.s1, team2: g.t2, seed2: g.s2 })
    rows.push(`  (gen_random_uuid(), null, ${base + gi}, 'R64', '${region}', '${teams}'::jsonb, null, 'pending', now())`)
  })

  // R32 — teams null (derived from R64 picks)
  for (let i = 0; i < 4; i++) {
    rows.push(`  (gen_random_uuid(), null, ${base + 8 + i}, 'R32', '${region}', null, null, 'pending', now())`)
  }

  // S16
  for (let i = 0; i < 2; i++) {
    rows.push(`  (gen_random_uuid(), null, ${base + 12 + i}, 'S16', '${region}', null, null, 'pending', now())`)
  }

  // E8
  rows.push(`  (gen_random_uuid(), null, ${base + 14}, 'E8', '${region}', null, null, 'pending', now())`)
})

// Final Four
rows.push(`  (gen_random_uuid(), null, 60, 'F4',    null, null, null, 'pending', now())`)
rows.push(`  (gen_random_uuid(), null, 61, 'F4',    null, null, null, 'pending', now())`)
rows.push(`  (gen_random_uuid(), null, 62, 'Champ', null, null, null, 'pending', now())`)

console.log(`-- Seed: 63 tournament slots`)
console.log(`-- R64 teams use 2015 bracket as placeholder — update after Selection Sunday (Mar 15 2026).`)
console.log(`-- Run in Supabase SQL Editor after schema.sql.\n`)
console.log(`insert into public.games (id, espn_id, slot_index, round, region, teams, winner, status, updated_at) values`)
console.log(rows.join(',\n') + ';')
