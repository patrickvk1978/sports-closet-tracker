/**
 * Shared PoolContext — handles membership, join/create/switch.
 * Game-specific data (brackets, picks, sim results) lives in each app's
 * own extended context that wraps this one.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useAuth } from '../auth/useAuth.js'
import { generateInviteCode } from '../utils/invite-codes.js'

export const PoolContext = createContext(null)

export function PoolProvider({ children, gameType }) {
  const { session } = useAuth()

  const [pool,      setPool]      = useState(null)
  const [allPools,  setAllPools]  = useState([])
  const [members,   setMembers]   = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setPool(null)
      setAllPools([])
      setMembers([])
      setIsLoading(false)
      return
    }
    loadPoolData()
  }, [session])

  function updatePoolLocally(poolId, patch) {
    setAllPools(prev => prev.map(p => p.id === poolId ? { ...p, ...patch } : p))
    setPool(prev => prev?.id === poolId ? { ...prev, ...patch } : prev)
  }

  async function loadPoolData(overrideActiveId) {
    setIsLoading(true)

    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', session.user.id)

    if (!memberships?.length) {
      setAllPools([])
      setPool(null)
      setMembers([])
      setIsLoading(false)
      return
    }

    const poolIds = memberships.map(m => m.pool_id)
    const query = supabase.from('pools').select('*').in('id', poolIds)

    // If a gameType is provided, scope pools to this app
    const { data: allPoolsData } = gameType
      ? await query.eq('game_type', gameType)
      : await query

    setAllPools(allPoolsData ?? [])

    const savedId = overrideActiveId ?? localStorage.getItem('activePoolId')
    const active = allPoolsData?.find(p => p.id === savedId) ?? allPoolsData?.[0]
    if (!active) {
      setPool(null)
      setMembers([])
      setIsLoading(false)
      return
    }

    setPool(active)
    localStorage.setItem('activePoolId', active.id)
    await loadMembers(active.id)
  }

  async function loadMembers(poolId) {
    const { data: membersData } = await supabase
      .rpc('get_pool_members', { p_pool_id: poolId })

    setMembers(
      (membersData ?? []).map(m => ({
        user_id:  m.user_id,
        joined_at: m.joined_at,
        profiles: { username: m.username, is_admin: m.is_admin },
      }))
    )
    setIsLoading(false)
  }

  function switchPool(poolId) {
    const target = allPools.find(p => p.id === poolId)
    if (!target) return
    localStorage.setItem('activePoolId', poolId)
    setPool(target)
    setMembers([])
    setIsLoading(true)
    loadMembers(poolId)
  }

  async function joinPool(inviteCode) {
    const { data: rows, error } = await supabase
      .rpc('get_pool_by_invite_code', { code: inviteCode.trim() })

    const targetPool = rows?.[0] ?? null
    if (error || !targetPool) return { error: 'Invalid invite code' }

    const { error: joinError } = await supabase
      .from('pool_members')
      .insert({ pool_id: targetPool.id, user_id: session.user.id })

    if (joinError) {
      if (joinError.code === '23505') {
        localStorage.setItem('activePoolId', targetPool.id)
        await loadPoolData(targetPool.id)
        return { pool: targetPool }
      }
      return { error: joinError.message }
    }

    localStorage.setItem('activePoolId', targetPool.id)
    await loadPoolData(targetPool.id)
    return { pool: targetPool }
  }

  async function createPool(name, options = {}) {
    const {
      startRound = 'R64',
      scoringConfig,
      prizePlaces = [1],
      settings = {}
    } = options

    const inviteCode = generateInviteCode()
    const defaultScoring = { R64: 10, R32: 20, S16: 40, E8: 80, F4: 160, Champ: 320 }
    const poolScoringConfig = { ...(scoringConfig ?? defaultScoring), prize_places: prizePlaces }

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        game_type: gameType,
        admin_id: session.user.id,
        invite_code: inviteCode,
        scoring_config: poolScoringConfig,
        start_round: startRound,
        locked: false,
        settings,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    await supabase
      .from('pool_members')
      .insert({ pool_id: newPool.id, user_id: session.user.id })

    localStorage.setItem('activePoolId', newPool.id)
    await loadPoolData(newPool.id)
    return { pool: newPool }
  }

  return (
    <PoolContext.Provider value={{
      pool,
      allPools,
      activePoolId: pool?.id ?? null,
      members,
      isLoading,
      joinPool,
      createPool,
      switchPool,
      refreshPool: loadPoolData,
      updatePoolLocally,
    }}>
      {children}
    </PoolContext.Provider>
  )
}
