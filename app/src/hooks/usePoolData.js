import { useMemo } from 'react'
import { usePool } from './usePool'
import { useAuth } from './useAuth'
import { KEY_SLOTS } from '../lib/scoring'
import {
  PLAYERS       as MOCK_PLAYERS,
  GAMES         as MOCK_GAMES,
  ROUNDS        as MOCK_ROUNDS,
  BRACKET       as MOCK_BRACKET,
  PLAYER_COLORS as MOCK_PLAYER_COLORS,
  LEVERAGE_GAMES   as MOCK_LEVERAGE_GAMES,
  CONSENSUS        as MOCK_CONSENSUS,
  ELIMINATION_STATS as MOCK_ELIMINATION_STATS,
  WIN_PROB_HISTORY  as MOCK_WIN_PROB_HISTORY,
  BEST_PATH        as MOCK_BEST_PATH,
  LEVERAGE_THRESHOLD as MOCK_LEVERAGE_THRESHOLD,
} from '../data/mockData'

// Slot layout constants
const REGION_SLOT_BASES = { midwest: 0, west: 15, south: 30, east: 45 }
const ROUND_SLOT_START  = { R64: 0, R32: 8, S16: 12, E8: 14 }

// All-game matrix metadata
const REGION_META = [
  { name: 'Midwest', color: '#f97316', base: 0  },
  { name: 'West',    color: '#06b6d4', base: 15 },
  { name: 'South',   color: '#a78bfa', base: 30 },
  { name: 'East',    color: '#22c55e', base: 45 },
]
const SLOT_ROUND_KEY = (() => {
  const m = {}
  for (const { base } of REGION_META) {
    for (let i = 0;  i < 8;  i++) m[base + i]       = 'R64'
    for (let i = 8;  i < 12; i++) m[base + i]       = 'R32'
    for (let i = 12; i < 14; i++) m[base + i]       = 'S16'
    m[base + 14] = 'E8'
  }
  m[60] = 'F4'; m[61] = 'F4'; m[62] = 'Champ'
  return m
})()
const ROUND_DISPLAY = { R64: 'R64', R32: 'R32', S16: 'S16', E8: 'E8', F4: 'Final Four', Champ: 'Championship' }
const ALL_ROUNDS    = ['R64', 'R32', 'S16', 'E8', 'Final Four', 'Championship']

/**
 * Annotate a bracket object (mock or live) by adding slotIndex to each game.
 * Operates on the shape { regionKey: { rounds: { roundKey: [game, ...] } } }.
 */
function annotateBracket(bracket) {
  const annotated = {}
  for (const [regionKey, region] of Object.entries(bracket)) {
    const base = REGION_SLOT_BASES[regionKey]
    if (base == null) { annotated[regionKey] = region; continue }
    const rounds = {}
    for (const [roundKey, games] of Object.entries(region.rounds ?? {})) {
      const start = ROUND_SLOT_START[roundKey] ?? 0
      rounds[roundKey] = games.map((game, i) => ({
        ...game,
        slotIndex: base + start + i,
      }))
    }
    annotated[regionKey] = { ...region, rounds }
  }
  return annotated
}

// Pre-annotated mock bracket (computed once at module load)
const ANNOTATED_MOCK_BRACKET = annotateBracket(MOCK_BRACKET)

function shortTeam(abbrev, name) {
  if (abbrev) return abbrev
  if (!name) return 'TBD'
  return name
}

function buildLiveGames(dbGames) {
  const games = []
  let id = 1

  // Four regions: slots 0–59
  for (const { name, color, base } of REGION_META) {
    for (let i = 0; i < 15; i++) {
      const slot     = base + i
      const roundKey = SLOT_ROUND_KEY[slot]
      const g        = dbGames.find((r) => r.slot_index === slot)
      games.push({
        id:            id++,
        slot_index:    slot,
        round:         ROUND_DISPLAY[roundKey],
        roundKey,
        region:        name,
        regionColor:   color,
        isKeyGame:     roundKey === 'E8',
        firstInRegion: i === 0,
        seed1:         g?.teams?.seed1 ?? null,
        seed2:         g?.teams?.seed2 ?? null,
        abbrev1:       g?.teams?.abbrev1 ?? null,
        abbrev2:       g?.teams?.abbrev2 ?? null,
        matchup:       g ? `${shortTeam(g.teams?.abbrev1, g.teams?.team1)} vs ${shortTeam(g.teams?.abbrev2, g.teams?.team2)}` : 'TBD vs TBD',
        team1:         g?.teams?.team1 ?? null,
        team2:         g?.teams?.team2 ?? null,
        status:        g?.status ?? 'pending',
        winner:        g?.winner ?? null,
        score1:        g?.teams?.score1 ?? null,
        score2:        g?.teams?.score2 ?? null,
        gameNote:      g?.teams?.gameNote ?? null,
        gameTime:      g?.teams?.gameTime ?? null,
        updated_at:    g?.updated_at ?? null,
      })
    }
  }

  // Final Four + Championship: slots 60–62
  for (const slot of [60, 61, 62]) {
    const roundKey = SLOT_ROUND_KEY[slot]
    const g        = dbGames.find((r) => r.slot_index === slot)
    games.push({
      id:            id++,
      slot_index:    slot,
      round:         ROUND_DISPLAY[roundKey],
      roundKey,
      region:        'Final',
      regionColor:   '#fbbf24',
      isKeyGame:     true,
      firstInRegion: slot === 60,
      seed1:         null,
      seed2:         null,
      abbrev1:       g?.teams?.abbrev1 ?? null,
      abbrev2:       g?.teams?.abbrev2 ?? null,
      matchup:       g ? `${shortTeam(g.teams?.abbrev1, g.teams?.team1)} vs ${shortTeam(g.teams?.abbrev2, g.teams?.team2)}` : 'TBD vs TBD',
      team1:         g?.teams?.team1 ?? null,
      team2:         g?.teams?.team2 ?? null,
      status:        g?.status ?? 'pending',
      winner:        g?.winner ?? null,
      score1:        g?.teams?.score1 ?? null,
      score2:        g?.teams?.score2 ?? null,
      gameNote:      g?.teams?.gameNote ?? null,
      updated_at:    g?.updated_at ?? null,
    })
  }

  return games
}

function buildLiveBracket(dbGames) {
  const REGION_BASES  = [0, 15, 30, 45]
  const REGION_KEYS   = ['midwest', 'west', 'south', 'east']
  const REGION_NAMES  = ['Midwest', 'West', 'South', 'East']
  const REGION_COLORS = ['#f97316', '#06b6d4', '#a78bfa', '#22c55e']
  const ROUND_DEFS    = [
    { key: 'R64', start: 0,  count: 8 },
    { key: 'R32', start: 8,  count: 4 },
    { key: 'S16', start: 12, count: 2 },
    { key: 'E8',  start: 14, count: 1 },
  ]

  const result = {}
  REGION_BASES.forEach((base, ri) => {
    const rounds = {}
    ROUND_DEFS.forEach(({ key, start, count }) => {
      rounds[key] = []
      for (let i = 0; i < count; i++) {
        const slot = base + start + i
        const g    = dbGames.find((r) => r.slot_index === slot)
        if (!g) continue  // skip missing slots; do not abort the whole round
        rounds[key].push({
          slotIndex: slot,
          t1:       g.teams?.team1 ?? 'TBD',
          s1:       g.teams?.seed1 ?? null,
          t2:       g.teams?.team2 ?? 'TBD',
          s2:       g.teams?.seed2 ?? null,
          winner:   g.winner,
          status:   g.status,
          score1:   g.teams?.score1 ?? null,
          score2:   g.teams?.score2 ?? null,
          gameNote: g.teams?.gameNote ?? null,
        })
      }
    })
    result[REGION_KEYS[ri]] = {
      name:   REGION_NAMES[ri],
      color:  REGION_COLORS[ri],
      rounds,
    }
  })
  return result
}

function computeEliminationStats(players) {
  const total = players.length
  const champAliveCount = players.filter((p) => p.champAlive).length
  return [
    { label: 'Champion Still Alive',    count: champAliveCount, total, icon: '🏆' },
    { label: 'Final Four Intact (3+)',  count: 0,               total, icon: '🎯' },
    { label: 'Mathematically Alive',   count: total,            total, icon: '📊' },
    { label: 'Effectively Eliminated', count: 0,                total, icon: '💀' },
  ]
}

function computeConsensus(players, liveGames) {
  return liveGames
    .filter((g) => g.status !== 'final')
    .map((game) => {
      const counts  = {}
      players.forEach((p) => {
        const pick = p.picks[game.slot_index]
        if (pick) counts[pick] = (counts[pick] || 0) + 1
      })
      const total = players.length || 1
      const [team1, team2] = [game.team1, game.team2]
      return {
        game:  game.matchup,
        team1: team1 ?? 'TBD',
        team2: team2 ?? 'TBD',
        pct1:  Math.round(((counts[team1] ?? 0) / total) * 100),
        pct2:  Math.round(((counts[team2] ?? 0) / total) * 100),
      }
    })
    .filter((c) => c.team1 !== 'TBD')
}

/**
 * Adapter hook: returns the exact same shape as mockData.js so that all
 * existing views work without logic changes. Falls back to mock data when
 * loading or when no pool is active.
 */
export function usePoolData() {
  const { pool, PLAYERS_LIVE, games, brackets, simResult, isLoading } = usePool()
  const { profile } = useAuth()

  const liveGames = useMemo(
    () => (games.length > 0 ? buildLiveGames(games) : []),
    [games]
  )
  const liveBracket = useMemo(
    () => (games.length > 0 ? buildLiveBracket(games) : null),
    [games]
  )
  // Build displayName → abbreviation lookup from game data
  const teamAbbrevMap = useMemo(() => {
    const map = {}
    for (const g of games) {
      const t = g.teams || {}
      if (t.team1 && t.abbrev1) map[t.team1] = t.abbrev1
      if (t.team2 && t.abbrev2) map[t.team2] = t.abbrev2
    }
    return map
  }, [games])

  const liveConsensus = useMemo(
    () => (PLAYERS_LIVE && liveGames.length ? computeConsensus(PLAYERS_LIVE, liveGames) : null),
    [PLAYERS_LIVE, liveGames]
  )
  const liveElimStats = useMemo(
    () => (PLAYERS_LIVE ? computeEliminationStats(PLAYERS_LIVE) : null),
    [PLAYERS_LIVE]
  )

  // Fall back to mock data when: loading, no active pool, or no live data yet
  const useLive = !isLoading && pool && PLAYERS_LIVE && PLAYERS_LIVE.length > 0

  // Current user's 63-slot picks array (null entries where they made no pick)
  const userPicks = useMemo(() => {
    if (!profile || !brackets) return []
    const userBracket = brackets.find((b) => b.user_id === profile.id)
    return userBracket?.picks ?? []
  }, [profile, brackets])

  // ── Phase 3: merge simulation results ────────────────────────────────────────

  // 1. Win probabilities: merge player_probs + deltas from simResult into PLAYERS_LIVE
  const PLAYERS_WITH_PROBS = useMemo(() => {
    const base = useLive ? PLAYERS_LIVE : MOCK_PLAYERS
    if (!simResult?.player_probs) return base
    const prev = simResult?.prev_player_probs ?? {}
    const hasPrev = Object.keys(prev).length > 0
    return base.map((p) => {
      const current = (simResult.player_probs[p.name] ?? 0) * 100
      const prevPct = (prev[p.name] ?? 0) * 100
      return {
        ...p,
        winProb: parseFloat(current.toFixed(1)),
        winProbDelta: hasPrev ? parseFloat((current - prevPct).toFixed(1)) : null,
      }
    })
  }, [useLive, PLAYERS_LIVE, simResult])

  // 2. Leverage games: use sim result if available, else mock
  const LEVERAGE_GAMES_LIVE = useLive && simResult?.leverage_games?.length
    ? simResult.leverage_games
    : MOCK_LEVERAGE_GAMES

  // 3. Best paths: use sim result if available, else mock
  const BEST_PATH_LIVE = useLive && simResult?.best_paths
    ? simResult.best_paths
    : MOCK_BEST_PATH

  // 4. Per-player leverage: { playerName: [top-5 games by personal swing] }
  const PLAYER_LEVERAGE_LIVE = useLive && simResult?.player_leverage
    ? simResult.player_leverage
    : {}

  // 5. AI narratives: { playerName: "sentence" }
  const NARRATIVES = simResult?.narratives ?? {}

  return {
    PLAYERS:            PLAYERS_WITH_PROBS,
    GAMES:              useLive ? liveGames : MOCK_GAMES,
    ROUNDS:             useLive ? ALL_ROUNDS : MOCK_ROUNDS,
    BRACKET:            useLive && liveBracket ? liveBracket : ANNOTATED_MOCK_BRACKET,
    PLAYER_COLORS:      MOCK_PLAYER_COLORS,
    LEVERAGE_GAMES:     LEVERAGE_GAMES_LIVE,
    CONSENSUS:          useLive && liveConsensus ? liveConsensus : MOCK_CONSENSUS,
    ELIMINATION_STATS:  useLive && liveElimStats  ? liveElimStats  : MOCK_ELIMINATION_STATS,
    WIN_PROB_HISTORY:   MOCK_WIN_PROB_HISTORY,
    BEST_PATH:          BEST_PATH_LIVE,
    PLAYER_LEVERAGE:    PLAYER_LEVERAGE_LIVE,
    LEVERAGE_THRESHOLD: MOCK_LEVERAGE_THRESHOLD,
    NARRATIVES,
    TEAM_ABBREV: teamAbbrevMap,
    simResult,
    userPicks,
    isLoading,
  }
}
