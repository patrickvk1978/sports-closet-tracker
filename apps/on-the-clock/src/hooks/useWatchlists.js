import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { usePool } from './usePool'
import { supabase, draftDb } from '../lib/supabase'

/**
 * Per-user team watchlists.
 *
 * Shape: watchlistsByTeam[teamCode] = [prospectId, prospectId, ...]
 * Private to the current user (RLS enforced).
 */
export function useWatchlists() {
  const { session } = useAuth()
  const { pool } = usePool()
  const poolId = pool?.id
  const userId = session?.user?.id

  const [rows, setRows] = useState([]) // raw rows
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!poolId || !userId) { setRows([]); setLoading(false); return }
    setLoading(true)
    const { data } = await draftDb
      .from('user_watchlists')
      .select('*')
      .eq('pool_id', poolId)
      .eq('user_id', userId)
      .order('added_at', { ascending: true })
    setRows(data ?? [])
    setLoading(false)
  }, [poolId, userId])

  useEffect(() => { load() }, [load])

  // Realtime (own rows only — RLS filters)
  useEffect(() => {
    if (!poolId || !userId) return
    const channel = supabase
      .channel(`watchlists-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'draft', table: 'user_watchlists' }, (payload) => {
        const row = payload.new ?? payload.old
        if (!row || row.pool_id !== poolId || row.user_id !== userId) return
        if (payload.eventType === 'INSERT') {
          setRows(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new])
        } else if (payload.eventType === 'DELETE') {
          setRows(prev => prev.filter(r => r.id !== payload.old.id))
        } else if (payload.eventType === 'UPDATE') {
          setRows(prev => prev.map(r => r.id === payload.new.id ? payload.new : r))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [poolId, userId])

  const watchlistsByTeam = useMemo(() => {
    const map = {}
    for (const r of rows) {
      if (!map[r.team_code]) map[r.team_code] = []
      map[r.team_code].push(r.prospect_id)
    }
    return map
  }, [rows])

  const addToWatchlist = useCallback(async (teamCode, prospectId) => {
    if (!poolId || !userId || !teamCode || !prospectId) return { error: 'missing args' }
    const current = rows.filter(r => r.team_code === teamCode)
    if (current.some(r => r.prospect_id === prospectId)) return { error: 'Already on watchlist' }
    const { data, error } = await draftDb
      .from('user_watchlists')
      .insert({ pool_id: poolId, user_id: userId, team_code: teamCode, prospect_id: prospectId })
      .select()
      .single()
    if (!error && data) {
      setRows(prev => prev.some(r => r.id === data.id) ? prev : [...prev, data])
    }
    return { error: error?.message ?? null }
  }, [poolId, userId, rows])

  const removeFromWatchlist = useCallback(async (teamCode, prospectId) => {
    if (!poolId || !userId) return
    const row = rows.find(r => r.team_code === teamCode && r.prospect_id === prospectId)
    if (!row) return
    setRows(prev => prev.filter(r => r.id !== row.id)) // optimistic
    await draftDb.from('user_watchlists').delete().eq('id', row.id)
  }, [poolId, userId, rows])

  return { watchlistsByTeam, loading, addToWatchlist, removeFromWatchlist }
}
