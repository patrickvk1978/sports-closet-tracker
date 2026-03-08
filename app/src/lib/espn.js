// ─── ESPN unofficial API ───────────────────────────────────────────────────────
// No API key required. Admin's browser polls this every 60-30s during the
// tournament and upserts results to the Supabase games table.

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=50'

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

  return {
    espn_id: event.id,
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
    winner,
    status,
  }
}
