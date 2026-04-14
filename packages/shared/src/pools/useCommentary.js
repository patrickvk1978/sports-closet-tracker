import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

/**
 * Fetch commentary output cards for a pool.
 * Optionally scoped to a specific user (for personal commentary).
 *
 * @param {string|null} poolId
 * @param {object} opts
 * @param {string|null} opts.userId - if provided, includes user-specific commentary
 * @param {number} opts.limit
 */
export function useCommentary(poolId, { userId = null, limit = 10 } = {}) {
  const [commentary, setCommentary] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!poolId) { setCommentary([]); setLoading(false); return }

    async function fetch() {
      setLoading(true)
      let query = supabase
        .from('commentary_outputs')
        .select('*')
        .eq('pool_id', poolId)
        .order('priority', { ascending: true })   // high first
        .order('created_at', { ascending: false })
        .limit(limit)

      // Include pool-wide (user_id IS NULL) + user-specific if userId provided
      if (userId) {
        query = query.or(`user_id.is.null,user_id.eq.${userId}`)
      } else {
        query = query.is('user_id', null)
      }

      const { data } = await query
      setCommentary(data ?? [])
      setLoading(false)
    }

    fetch()

    const channel = supabase
      .channel(`commentary-${poolId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commentary_outputs',
        filter: `pool_id=eq.${poolId}`,
      }, () => fetch())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [poolId, userId, limit])

  return { commentary, loading }
}
