import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to the narrative_log table for a given pool (plus global entries).
 * Returns the latest log entries (newest first), with Realtime INSERT subscription.
 *
 * Shape: [{ id, pool_id, source, level, event_type, message, metadata, created_at }]
 */
export function useNarrativeLog(poolId, { limit = 200 } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(async () => {
    if (!poolId) return
    const { data } = await supabase
      .from('narrative_log')
      .select('*')
      .or(`pool_id.eq.${poolId},pool_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(limit)
    setEntries(data ?? [])
    setLoading(false)
  }, [poolId, limit])

  useEffect(() => {
    if (!poolId) return
    fetchEntries()

    const channel = supabase
      .channel(`public:narrative_log:${poolId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'narrative_log' },
        (payload) => {
          const entry = payload.new
          // Include if it's global (no pool_id) or matches this pool
          if (!entry.pool_id || entry.pool_id === poolId) {
            setEntries((prev) => [entry, ...prev].slice(0, limit))
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId, limit, fetchEntries])

  return { entries, loading }
}
