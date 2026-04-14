import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to the narrative_feed table for a given pool.
 * Returns the latest feed entries (newest first), with Realtime INSERT subscription.
 *
 * Shape: [{ id, pool_id, player_name, entry_type, persona, content, leverage_pct, created_at }]
 */
export function useNarrativeFeed(poolId, { limit = 50 } = {}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(async () => {
    if (!poolId) return
    const { data } = await supabase
      .from('narrative_feed')
      .select('*')
      .eq('pool_id', poolId)
      .order('created_at', { ascending: false })
      .limit(limit)
    setEntries(data ?? [])
    setLoading(false)
  }, [poolId, limit])

  useEffect(() => {
    if (!poolId) return
    fetchEntries()

    const channel = supabase
      .channel(`public:narrative_feed:${poolId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'narrative_feed', filter: `pool_id=eq.${poolId}` },
        (payload) => {
          setEntries((prev) => [payload.new, ...prev].slice(0, limit))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'narrative_feed' },
        () => {
          // Overnight clear — refetch to get clean state
          fetchEntries()
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId, limit, fetchEntries])

  return { entries, loading }
}
