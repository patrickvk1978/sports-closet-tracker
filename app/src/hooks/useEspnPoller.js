import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchEspnGames, transformEspnGame, fetchEspnWinProb } from '../lib/espn'
import { useAuth } from './useAuth'
import { usePool } from './usePool'

/**
 * Admin-only hook: polls ESPN every 60s (30s when live games detected) and
 * upserts results to the games table. Other clients get updates via Realtime.
 *
 * @param {object} slotMapping - { [espn_id]: slot_index } — created once before
 *   the tournament by linking ESPN game IDs to the 63-slot bracket positions.
 */
export function useEspnPoller(slotMapping = {}) {
  const { profile } = useAuth()
  const { pool, games } = usePool()
  const [isPolling, setIsPolling] = useState(false)
  const timerRef = useRef(null)

  const hasLiveGames = games.some((g) => g.status === 'live')
  const interval     = hasLiveGames ? 30_000 : 60_000

  useEffect(() => {
    if (!profile?.is_admin || !pool) return

    async function poll() {
      setIsPolling(true)
      try {
        // Fetch today + next 4 days so upcoming game times populate before game day
        const dates = Array.from({ length: 5 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() + i)
          return d.toISOString().slice(0, 10).replace(/-/g, '')
        })
        const results = await Promise.allSettled(dates.map(fetchEspnGames))
        const events  = results.flatMap((r) => r.status === 'fulfilled' ? r.value : [])

        for (const event of events) {
          const transformed = transformEspnGame(event)
          if (!transformed) continue

          const slotIndex = slotMapping[transformed.espn_id]
          if (slotIndex === undefined) continue

          const upsertPayload = {
            espn_id:    transformed.espn_id,
            slot_index: slotIndex,
            teams: {
              ...transformed.teams,
              score1:   transformed.score1,
              score2:   transformed.score2,
              gameNote: transformed.gameNote,
              gameTime: transformed.gameTime ?? undefined,
            },
            winner:     transformed.winner,
            status:     transformed.status,
            updated_at: new Date().toISOString(),
          }

          // Phase 3: fetch live win probability for live games
          if (transformed.status === 'live') {
            const winProbHome = await fetchEspnWinProb(transformed.espn_id)
            if (winProbHome !== null) {
              upsertPayload.win_prob_home = winProbHome
            }
          } else if (transformed.status === 'final') {
            // Clear win prob once game is over
            upsertPayload.win_prob_home = null
          }

          await supabase.from('games').upsert(upsertPayload, { onConflict: 'espn_id' })
        }
      } catch (err) {
        console.error('[useEspnPoller] poll error:', err)
      }
      setIsPolling(false)
    }

    poll() // immediate first poll
    timerRef.current = setInterval(poll, interval)

    return () => clearInterval(timerRef.current)
  }, [profile?.is_admin, pool?.id, interval, slotMapping])

  return { isPolling }
}
