// ─── ESPN unofficial API ───────────────────────────────────────────────────────
// No API key required. Admin's browser polls this every 60-30s during the
// tournament and upserts results to the Supabase games table.
//
// Phase 3: also polls the ESPN Core probabilities endpoint for live games to
// populate games.win_prob_home (float 0–1, probability that home/team2 wins).

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=50'

// ESPN Core API — probabilities endpoint (only available for live games)
const ESPN_CORE_BASE =
  'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball'

/**
 * Fetch live win probability for a game from the ESPN Core API.
 * Only available while a game is live — returns null for pending/final games.
 *
 * ESPN convention: "home" = team2 in our schema.
 * The returned float is win_prob_home (probability that home/team2 wins).
 *
 * @param {string} espnId - ESPN event ID
 * @returns {Promise<number|null>} win probability for home team (0–1), or null
 */
export async function fetchEspnWinProb(espnId) {
  if (!espnId) return null
  try {
    const url = `${ESPN_CORE_BASE}/events/${espnId}/competitions/${espnId}/probabilities`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()

    // Response is a paginated items list; each item has a $ref link
    const items = data.items ?? []
    if (!items.length) return null

    // Follow the $ref of the last item (most recent probability)
    const lastRef = items[items.length - 1]?.$ref
    if (!lastRef) return null

    const refRes = await fetch(lastRef)
    if (!refRes.ok) return null
    const prob = await refRes.json()

    // homeTeamOdds.winPercentage is on a 0–100 scale
    const winPct = prob?.homeTeamOdds?.winPercentage
    if (winPct == null) return null
    return winPct / 100
  } catch {
    return null
  }
}

/**
 * Fetch today's (or a specific date's) NCAA tournament games from ESPN.
 * @param {string} [dateStr]  - YYYYMMDD; defaults to today
 * @returns {Promise<object[]>} - raw ESPN event objects
 */
export async function fetchEspnGames(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const url  = `${ESPN_SCOREBOARD_URL}&dates=${date}`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`ESPN API error: ${res.status} ${res.statusText}`)
  const data = await res.json()
  return data.events || []
}

/**
 * Transform a raw ESPN event object into the shape we upsert to the games table.
 * Returns null if the event can't be parsed.
 *
 * Note: slot_index is NOT filled here — it must come from the pre-seeded
 * espn_id → slot_index mapping table (created before the tournament starts).
 */
function formatGameTime(isoDate) {
  if (!isoDate) return null
  try {
    return new Date(isoDate).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' ET'
  } catch {
    return null
  }
}

export function transformEspnGame(event) {
  const comp = event?.competitions?.[0]
  if (!comp) return null

  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  const home = comp.competitors?.find((c) => c.homeAway === 'home')

  const statusState = comp.status?.type?.state
  const completed   = comp.status?.type?.completed ?? false
  const status = completed || statusState === 'post' ? 'final'
               : statusState === 'in'               ? 'live'
               : 'pending'

  let winner = null
  if (status === 'final' && away && home) {
    const awayScore = parseInt(away.score ?? 0, 10)
    const homeScore = parseInt(home.score ?? 0, 10)
    winner = awayScore > homeScore
      ? (away.team?.displayName ?? null)
      : (home.team?.displayName ?? null)
  }

  // Live score extraction
  const score1Raw = away?.score
  const score2Raw = home?.score
  const score1 = score1Raw != null && score1Raw !== '' ? parseInt(score1Raw, 10) : null
  const score2 = score2Raw != null && score2Raw !== '' ? parseInt(score2Raw, 10) : null

  // Game note: "2nd Half 12:34", "Final", or null if not started
  let gameNote = null
  if (status === 'final') {
    gameNote = 'Final'
  } else if (status === 'live') {
    const shortDetail  = event.status?.type?.shortDetail ?? ''
    const displayClock = comp.status?.displayClock ?? ''
    const period       = comp.status?.period ?? null
    if (shortDetail) {
      gameNote = shortDetail
    } else if (period && displayClock) {
      const half = period === 1 ? '1st Half' : '2nd Half'
      gameNote = `${half} ${displayClock}`
    }
  }

  return {
    espn_id: event.id,
    gameTime: status === 'pending' ? formatGameTime(event.date) : null,
    teams: {
      team1: away?.team?.displayName ?? null,
      seed1: parseInt(away?.curatedRank?.current ?? away?.seed ?? 0, 10) || null,
      team2: home?.team?.displayName ?? null,
      seed2: parseInt(home?.curatedRank?.current ?? home?.seed ?? 0, 10) || null,
    },
    score: {
      team1: parseInt(away?.score ?? 0, 10),
      team2: parseInt(home?.score ?? 0, 10),
    },
    score1,
    score2,
    gameNote,
    winner,
    status,
  }
}
