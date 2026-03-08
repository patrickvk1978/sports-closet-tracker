import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Fetch and subscribe to the scores table for a given pool.
 * Returns an array of score rows: { bracket_id, pool_id, points, ppr, rank }
 */
export function useScores(poolId) {
  const [scores, setScores] = useState([])

  useEffect(() => {
    if (!poolId) return

    supabase
      .from('scores')
      .select('*')
      .eq('pool_id', poolId)
      .then(({ data }) => setScores(data ?? []))

    const channel = supabase
      .channel(`public:scores:${poolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          setScores((current) => {
            if (payload.eventType === 'DELETE') {
              return current.filter((s) => s.id !== payload.old.id)
            }
            const idx = current.findIndex((s) => s.id === payload.new.id)
            if (idx >= 0) {
              const updated = [...current]
              updated[idx] = payload.new
              return updated
            }
            return [...current, payload.new]
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId])

  return scores
}
