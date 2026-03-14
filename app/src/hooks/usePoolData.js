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

// Round name by KEY_SLOTS position
const KEY_ROUND_NAMES = [
  'Elite 8', 'Elite 8', 'Elite 8', 'Elite 8',
  'Final Four', 'Final Four', 'Championship',
]

function shortTeam(name) {
  if (!name) return 'TBD'
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

function buildLiveGames(dbGames) {
  return KEY_SLOTS.map((slot, idx) => {
    const g = dbGames.find((r) => r.slot_index === slot)
    if (!g) return null
    return {
      id:       idx + 1,
      round:    KEY_ROUND_NAMES[idx],
      matchup:  `${shortTeam(g.teams?.team1)} vs ${shortTeam(g.teams?.team2)}`,
      team1:    g.teams?.team1 ?? null,
      team2:    g.teams?.team2 ?? null,
      status:   g.status,
      winner:   g.winner,
      score1:   g.teams?.score1 ?? null,
      score2:   g.teams?.score2 ?? null,
      gameNote: g.teams?.gameNote ?? null,
    }
  }).filter(Boolean)
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
      const gameIdx = liveGames.indexOf(game)
      const counts  = {}
      players.forEach((p) => {
        const pick = p.picks[gameIdx]
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
  const { pool, PLAYERS_LIVE, games, brackets, isLoading } = usePool()
  const { profile } = useAuth()

  const liveGames = useMemo(
    () => (games.length > 0 ? buildLiveGames(games) : []),
    [games]
  )
  const liveBracket = useMemo(
    () => (games.length > 0 ? buildLiveBracket(games) : null),
    [games]
  )
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

  return {
    PLAYERS:            useLive ? PLAYERS_LIVE      : MOCK_PLAYERS,
    GAMES:              useLive && liveGames.length >= 7 ? liveGames : MOCK_GAMES,
    ROUNDS:             MOCK_ROUNDS,
    BRACKET:            useLive && liveBracket ? liveBracket : ANNOTATED_MOCK_BRACKET,
    PLAYER_COLORS:      MOCK_PLAYER_COLORS,
    LEVERAGE_GAMES:     MOCK_LEVERAGE_GAMES,        // Phase 3
    CONSENSUS:          useLive && liveConsensus ? liveConsensus : MOCK_CONSENSUS,
    ELIMINATION_STATS:  useLive && liveElimStats  ? liveElimStats  : MOCK_ELIMINATION_STATS,
    WIN_PROB_HISTORY:   MOCK_WIN_PROB_HISTORY,      // Phase 3
    BEST_PATH:          MOCK_BEST_PATH,             // Phase 3: replace with simulation output
    LEVERAGE_THRESHOLD: MOCK_LEVERAGE_THRESHOLD,
    userPicks,
    isLoading,
  }
}
