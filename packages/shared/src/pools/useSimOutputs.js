import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

/**
 * Fetch simulation outputs for a pool.
 * Works for any game type — data is written by the Python adapter.
 *
 * @param {string|null} poolId
 * @param {string} windowKey - 'current' | 'round_1' | 'final' etc.
 */
export function useSimOutputs(poolId, windowKey = 'current') {
  const [outputs, setOutputs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!poolId) { setOutputs([]); setLoading(false); return }

    setLoading(true)
    supabase
      .from('simulation_outputs')
      .select('*')
      .eq('pool_id', poolId)
      .eq('window_key', windowKey)
      .order('rank', { ascending: true })
      .then(({ data }) => {
        setOutputs(data ?? [])
        setLoading(false)
      })

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`sim-outputs-${poolId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'simulation_outputs',
        filter: `pool_id=eq.${poolId}`,
      }, () => {
        supabase
          .from('simulation_outputs')
          .select('*')
          .eq('pool_id', poolId)
          .eq('window_key', windowKey)
          .order('rank', { ascending: true })
          .then(({ data }) => setOutputs(data ?? []))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId, windowKey])

  return { outputs, loading }
}
