// ─── Scoring constants ─────────────────────────────────────────────────────────

export const DEFAULT_ROUND_POINTS = { R64: 10, R32: 20, S16: 40, E8: 80, F4: 160, Champ: 320 }
// Legacy alias
export const ROUND_POINTS = DEFAULT_ROUND_POINTS

// Map slot index (0-62) → round key
export const SLOT_ROUND = {}
;[0, 15, 30, 45].forEach((base) => {
  for (let i = 0; i < 8; i++)  SLOT_ROUND[base + i]      = 'R64'
  for (let i = 8; i < 12; i++) SLOT_ROUND[base + i]      = 'R32'
  for (let i = 12; i < 14; i++) SLOT_ROUND[base + i]     = 'S16'
  SLOT_ROUND[base + 14]                                   = 'E8'
})
SLOT_ROUND[60] = 'F4'
SLOT_ROUND[61] = 'F4'
SLOT_ROUND[62] = 'Champ'

// The 7 "key" slots that existing views (Matrix, Bracket) display in order:
//   [0]=Midwest E8, [1]=West E8, [2]=East E8, [3]=South E8,
//   [4]=F4 SF1 (MidW vs West), [5]=F4 SF2 (South vs East), [6]=Championship
export const KEY_SLOTS = [14, 29, 59, 44, 60, 61, 62]

// ─── Score calculation ─────────────────────────────────────────────────────────

/**
 * Calculate total score for a 63-slot picks array against completed games.
 * @param {(string|null)[]} picks       - 63-element array of team name picks
 * @param {object[]}        games       - rows from DB: { slot_index, winner, status }
 * @param {object}          [roundPoints] - optional per-round point values (defaults to standard scoring)
 */
export function calculateScore(picks, games, roundPoints = DEFAULT_ROUND_POINTS) {
  let points = 0
  for (const game of games) {
    if (
      (game.status === 'final' || game.winner) &&
      game.winner &&
      picks[game.slot_index] === game.winner
    ) {
      points += roundPoints[SLOT_ROUND[game.slot_index]] ?? 0
    }
  }
  return points
}

/**
 * Calculate points-possible-remaining (PPR): max future points a player can still earn.
 * A pick is still eligible if the team has not been eliminated in any completed game.
 */
export function calculatePPR(picks, games, roundPoints = DEFAULT_ROUND_POINTS) {
  const eliminated = new Set()
  for (const game of games) {
    if ((game.status === 'final' || game.winner) && game.winner) {
      const teams = game.teams || {}
      const loser = teams.team1 === game.winner ? teams.team2 : teams.team1
      if (loser) eliminated.add(loser)
    }
  }

  let ppr = 0
  for (const game of games) {
    if (game.status !== 'final' && !game.winner) {
      const pick = picks[game.slot_index]
      if (pick && !eliminated.has(pick)) {
        ppr += roundPoints[SLOT_ROUND[game.slot_index]] ?? 0
      }
    }
  }
  return ppr
}

/**
 * Returns true if the player's championship pick has not been eliminated yet.
 */
function isChampAlive(picks, games) {
  const champTeam = picks[62]
  if (!champTeam) return false
  for (const game of games) {
    if ((game.status === 'final' || game.winner) && game.winner && game.winner !== champTeam) {
      const teams = game.teams || {}
      if (teams.team1 === champTeam || teams.team2 === champTeam) return false
    }
  }
  return true
}

/**
 * Transform DB rows into the PLAYERS array shape consumed by all views.
 *
 * @param {object[]} members   - pool_members rows joined with profiles: { user_id, profiles: { username } }
 * @param {object[]} brackets  - brackets rows: { user_id, picks: [...63] }
 * @param {object[]} games     - all 63 game rows from DB
 */
export function buildPlayersArray(members, brackets, games, roundPoints = DEFAULT_ROUND_POINTS) {
  const bracketsByUser = {}
  brackets.forEach((b) => { bracketsByUser[b.user_id] = b })

  const result = members.map((member) => {
    const bracket  = bracketsByUser[member.user_id]
    const picks63  = bracket?.picks || Array(63).fill(null)
    const points   = games.length > 0 ? calculateScore(picks63, games, roundPoints) : 0
    const ppr      = games.length > 0 ? calculatePPR(picks63, games, roundPoints) : 0

    return {
      name:       member.profiles?.username ?? `user_${member.user_id.slice(0, 6)}`,
      points,
      ppr,
      winProb:    0,     // Phase 3 Monte Carlo
      champAlive: isChampAlive(picks63, games),
      trend:      'same', // Phase 3
      picks:      picks63,
    }
  })

  result.sort((a, b) => b.points - a.points)
  // Standard competition ranking: tied players share the same rank (1, 1, 3, ...)
  let currentRank = 1
  for (let i = 0; i < result.length; i++) {
    if (i > 0 && result[i].points < result[i - 1].points) currentRank = i + 1
    result[i] = { ...result[i], rank: currentRank }
  }
  return result
}
