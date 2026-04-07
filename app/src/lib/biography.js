// ─── Bracket Biography — pure computation functions ─────────────────────────
// No hooks, no side effects. Takes data in, returns results out.

import { SLOT_ROUND, DEFAULT_ROUND_POINTS } from './scoring'
import { BRACKET_TREE, FORWARD_TREE } from './bracketTree'

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROUNDS_ORDER = ['R64', 'R32', 'S16', 'E8', 'F4', 'Champ']

// E8 slots per region
const E8_SLOTS = [14, 29, 44, 59]

// Region for a slot (0-59 only)
function slotRegion(slot) {
  if (slot < 15) return 'Midwest'
  if (slot < 30) return 'West'
  if (slot < 45) return 'South'
  if (slot < 60) return 'East'
  return 'Final'
}

// Build a gamesBySlot map for quick lookups
function buildGameMap(games) {
  const m = new Map()
  for (const g of games) m.set(g.slot_index, g)
  return m
}

// Get seed of a team in a game
function teamSeed(game, team) {
  if (!game || !team) return null
  if (game.team1 === team) return game.seed1
  if (game.team2 === team) return game.seed2
  return null
}

// Walk forward from a slot, collecting all downstream slots where the same team was picked
function collectDownstream(slot, team, picks, visited = new Set()) {
  const results = []
  for (const parent of FORWARD_TREE[slot]) {
    if (visited.has(parent)) continue
    visited.add(parent)
    if (picks[parent] === team) {
      results.push(parent)
      results.push(...collectDownstream(parent, team, picks, visited))
    }
  }
  return results
}

// ── Archetype ────────────────────────────────────────────────────────────────

/**
 * Determine a player's bracket archetype based on their picks vs the pool.
 *
 * @param {(string|null)[]} playerPicks  - 63-slot picks
 * @param {Array<{picks: (string|null)[]}>} allBrackets - all brackets in the pool
 * @param {object[]} games - GAMES array from usePoolData
 * @returns {{ key: string, label: string, description: string }}
 */
export function computeArchetype(playerPicks, allBrackets, games) {
  const gameMap = buildGameMap(games)
  const n = allBrackets.length
  if (n < 2) return { key: 'bracket_maker', label: 'The Bracket Maker', description: 'Sole entry in the pool' }

  // 1. Average pick frequency (how consensus are their picks?)
  let freqSum = 0
  let freqCount = 0
  for (let slot = 0; slot < 63; slot++) {
    const pick = playerPicks[slot]
    if (!pick) continue
    const othersWithPick = allBrackets.filter(b => b.picks[slot] === pick).length
    freqSum += othersWithPick / n
    freqCount++
  }
  const avgFreq = freqCount > 0 ? freqSum / freqCount : 0.5

  // 2. Average seed of F4 + Champ picks (slots 60, 61, 62)
  const lateSlots = [60, 61, 62]
  let seedSum = 0
  let seedCount = 0
  for (const slot of lateSlots) {
    const pick = playerPicks[slot]
    if (!pick) continue
    // Find the R64 game where this team appeared to get its seed
    for (const g of games) {
      const s = teamSeed(g, pick)
      if (s != null) { seedSum += s; seedCount++; break }
    }
  }
  const avgLateSeed = seedCount > 0 ? seedSum / seedCount : 8

  // 3. Upset picks — picks where a lower seed (higher number) beats a higher seed
  let upsetPicks = 0
  for (let slot = 0; slot < 63; slot++) {
    const pick = playerPicks[slot]
    const [feed1, feed2] = BRACKET_TREE[slot]
    if (feed1 == null || !pick) continue // R64 seed-ins, skip
    const game = gameMap.get(slot)
    if (!game || !game.seed1 || !game.seed2) continue
    // Did they pick the higher-seeded (underdog) team?
    const pickedSeed = teamSeed(game, pick)
    const otherSeed = game.team1 === pick ? game.seed2 : game.seed1
    if (pickedSeed != null && otherSeed != null && pickedSeed > otherSeed) {
      upsetPicks++
    }
  }

  // 4. Regionalist — 3+ of 4 E8 picks from the same conference region
  const e8Regions = E8_SLOTS.map(s => {
    const pick = playerPicks[s]
    if (!pick) return null
    for (const g of games) {
      if ((g.team1 === pick || g.team2 === pick) && g.slot_index < 60) {
        return slotRegion(g.slot_index)
      }
    }
    return null
  }).filter(Boolean)
  const regionCounts = {}
  for (const r of e8Regions) regionCounts[r] = (regionCounts[r] || 0) + 1
  const maxRegionConcentration = Math.max(0, ...Object.values(regionCounts))
  const isRegionalist = maxRegionConcentration >= 3

  // 5. Bo Kimble — unique picks concentrated in late rounds despite being chalk early
  let lateUnique = 0
  let lateTotal = 0
  for (let slot = 0; slot < 63; slot++) {
    const round = SLOT_ROUND[slot]
    if (!['S16', 'E8', 'F4', 'Champ'].includes(round)) continue
    const pick = playerPicks[slot]
    if (!pick) continue
    lateTotal++
    const othersWithPick = allBrackets.filter(b => b.picks[slot] === pick).length
    if (othersWithPick === 1) lateUnique++
  }
  const lateUniqueRate = lateTotal > 0 ? lateUnique / lateTotal : 0
  const isBoKimble = avgFreq > 0.45 && lateUniqueRate > 0.3

  // 6. Christian Laettner — same team picked for multiple F4/Champ slots (all-in on one team)
  const latePickCounts = {}
  for (const slot of [60, 61, 62]) {
    const pick = playerPicks[slot]
    if (pick) latePickCounts[pick] = (latePickCounts[pick] || 0) + 1
  }
  const isLaettner = Object.values(latePickCounts).some(c => c >= 2)

  // Assign archetype (priority order)
  if (isRegionalist) {
    const topRegion = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0][0]
    return { key: 'dick_vitale', label: 'Dick Vitale', description: `Loaded up on ${topRegion} — passion for your guys clouds all judgment, BABY!` }
  }
  if (isLaettner) {
    return { key: 'christian_laettner', label: 'Christian Laettner', description: 'Everything rides on one team, one moment — legendary if it hits' }
  }
  if (isBoKimble) {
    return { key: 'bo_kimble', label: 'Bo Kimble', description: 'Played it safe early, then swung big where it mattered most — all heart, all or nothing' }
  }
  if (upsetPicks >= 8) {
    return { key: 'sister_jean', label: 'Sister Jean', description: `Pure faith — ${upsetPicks} upset picks and a belief that miracles happen` }
  }
  if (avgLateSeed <= 2.5) {
    return { key: 'coach_k', label: 'Coach K', description: 'Blue blood royalty all the way — always expects the best teams to win' }
  }
  if (avgFreq <= 0.35) {
    return { key: 'gonzaga_believer', label: 'The Gonzaga Believer', description: 'Nobody sees what you see — zigged where everyone else zagged' }
  }
  if (avgFreq >= 0.6) {
    return { key: 'jim_boeheim', label: 'Jim Boeheim', description: 'Syracuse zone energy — protect everything, concede nothing easy, grind it out' }
  }

  return { key: 'jay_wright', label: 'Jay Wright', description: 'The most complete bracket in the pool — no glaring weakness anywhere' }
}

// ── Correct Calls (rare correct picks) ───────────────────────────────────────

/**
 * Find the player's rarest correct picks, sorted by impact (rarity * points).
 *
 * @param {(string|null)[]} playerPicks
 * @param {Array<{picks: (string|null)[]}>} allBrackets
 * @param {object[]} games
 * @returns {Array<{ team, slot, round, pointValue, correctCount, totalPlayers, rarity, impact }>}
 */
export function computeCorrectCalls(playerPicks, allBrackets, games) {
  const gameMap = buildGameMap(games)
  const totalPlayers = allBrackets.length
  const results = []

  for (let slot = 0; slot < 63; slot++) {
    const game = gameMap.get(slot)
    if (!game || game.status !== 'final' || !game.winner) continue
    if (playerPicks[slot] !== game.winner) continue

    const correctCount = allBrackets.filter(b => b.picks[slot] === game.winner).length
    const rarity = 1 - (correctCount / totalPlayers)
    const pointValue = DEFAULT_ROUND_POINTS[SLOT_ROUND[slot]] ?? 0
    const impact = rarity * pointValue

    results.push({
      team: game.winner,
      slot,
      round: SLOT_ROUND[slot],
      pointValue,
      correctCount,
      totalPlayers,
      rarity,
      impact,
    })
  }

  results.sort((a, b) => b.impact - a.impact)
  return results.slice(0, 5)
}

// ── The Turn (wrong pick with most downstream damage) ────────────────────────

/**
 * Find the single wrong pick that caused the most downstream bracket damage.
 *
 * For the pool winner (rank 1), returns the closest-margin correct pick instead.
 *
 * @param {(string|null)[]} playerPicks
 * @param {object[]} games
 * @param {number} [playerRank] - if 1, switches to "closest call" mode
 * @returns {object|null}
 */
export function computeTheTurn(playerPicks, games, playerRank) {
  const gameMap = buildGameMap(games)

  // Pool winner variant: The Closest Call
  if (playerRank === 1) {
    let closestCall = null
    for (let slot = 0; slot < 63; slot++) {
      const game = gameMap.get(slot)
      if (!game || game.status !== 'final' || !game.winner) continue
      if (playerPicks[slot] !== game.winner) continue
      if (game.score1 == null || game.score2 == null) continue
      const margin = Math.abs(game.score1 - game.score2)
      if (!closestCall || margin < closestCall.margin) {
        closestCall = {
          slot,
          team: game.winner,
          opponent: game.team1 === game.winner ? game.team2 : game.team1,
          score1: game.score1,
          score2: game.score2,
          team1: game.team1,
          team2: game.team2,
          margin,
          round: SLOT_ROUND[slot],
          isClosestCall: true,
        }
      }
    }
    return closestCall
  }

  // Standard: find wrong pick with most downstream damage
  let worst = null

  for (let slot = 0; slot < 63; slot++) {
    const game = gameMap.get(slot)
    if (!game || game.status !== 'final' || !game.winner) continue
    if (playerPicks[slot] === game.winner) continue // correct pick

    const pickedTeam = playerPicks[slot]
    if (!pickedTeam) continue

    const pointsLost = DEFAULT_ROUND_POINTS[SLOT_ROUND[slot]] ?? 0
    const downstreamSlots = collectDownstream(slot, pickedTeam, playerPicks)
    const downstreamDamage = downstreamSlots.reduce(
      (sum, ds) => sum + (DEFAULT_ROUND_POINTS[SLOT_ROUND[ds]] ?? 0), 0
    )
    const totalDamage = pointsLost + downstreamDamage

    if (!worst || totalDamage > worst.totalDamage) {
      worst = {
        slot,
        team: pickedTeam,
        winner: game.winner,
        score1: game.score1,
        score2: game.score2,
        team1: game.team1,
        team2: game.team2,
        round: SLOT_ROUND[slot],
        pointsLost,
        downstreamDamage,
        totalDamage,
        downstreamSlots: downstreamSlots.length,
        isClosestCall: false,
      }
    }
  }

  return worst
}

// ── Round-by-Round Analysis ──────────────────────────────────────────────────

/**
 * Per-round accuracy breakdown with pool context.
 *
 * @param {(string|null)[]} playerPicks
 * @param {Array<{picks: (string|null)[]}>} allBrackets
 * @param {object[]} games
 * @returns {Array<{ round, correct, total, accuracy, poolBest, poolAvg }>}
 */
export function computeRoundAnalysis(playerPicks, allBrackets, games) {
  const gameMap = buildGameMap(games)

  // Group final games by round
  const roundGames = {}
  for (const round of ROUNDS_ORDER) roundGames[round] = []
  for (let slot = 0; slot < 63; slot++) {
    const game = gameMap.get(slot)
    if (game && game.status === 'final' && game.winner) {
      roundGames[SLOT_ROUND[slot]].push({ slot, winner: game.winner })
    }
  }

  return ROUNDS_ORDER.map(round => {
    const rGames = roundGames[round]
    const total = rGames.length
    if (total === 0) return { round, correct: 0, total: 0, accuracy: 0, poolBest: 0, poolAvg: 0 }

    const correct = rGames.filter(g => playerPicks[g.slot] === g.winner).length
    const accuracy = Math.round((correct / total) * 100)

    // Pool context
    const playerAccuracies = allBrackets.map(b => {
      const c = rGames.filter(g => b.picks[g.slot] === g.winner).length
      return Math.round((c / total) * 100)
    })
    const poolBest = Math.max(...playerAccuracies)
    const poolAvg = Math.round(playerAccuracies.reduce((s, v) => s + v, 0) / playerAccuracies.length)

    return { round, correct, total, accuracy, poolBest, poolAvg }
  })
}
