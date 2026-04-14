import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Fetch and subscribe to the sim_results table for a given pool.
 * Returns the latest simulation result row, or null if none exists.
 *
 * Shape: { id, pool_id, run_at, iterations, player_probs, leverage_games, best_paths }
 */
export function useSimResults(poolId) {
  const [simResult, setSimResult] = useState(null)

  useEffect(() => {
    if (!poolId) return

    supabase
      .from('sim_results')
      .select('*')
      .eq('pool_id', poolId)
      .maybeSingle()
      .then(({ data }) => setSimResult(data ?? null))

    const channel = supabase
      .channel(`public:sim_results:${poolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sim_results', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSimResult(null)
          } else {
            setSimResult(payload.new)
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId])

  return simResult
}
