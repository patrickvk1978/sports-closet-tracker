import { createContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useGames } from '../hooks/useGames'
import { useSimResults } from '../hooks/useSimResults'
import { buildPlayersArray } from '../lib/scoring'

export const PoolContext = createContext(null)

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function PoolProvider({ children }) {
  const { session } = useAuth()
  const games = useGames()

  const [pool,      setPool]      = useState(null)
  const [allPools,  setAllPools]  = useState([])
  const [members,   setMembers]   = useState([])
  const [brackets,  setBrackets]  = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const simResult = useSimResults(pool?.id)

  useEffect(() => {
    if (!session) {
      setPool(null)
      setAllPools([])
      setMembers([])
      setBrackets([])
      setIsLoading(false)
      return
    }
    loadPoolData()
  }, [session])

  async function loadPoolData(overrideActiveId) {
    setIsLoading(true)

    // 1. Get ALL memberships
    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', session.user.id)

    if (!memberships?.length) {
      setAllPools([])
      setPool(null)
      setMembers([])
      setBrackets([])
      setIsLoading(false)
      return
    }

    // 2. Load all pool details
    const poolIds = memberships.map(m => m.pool_id)
    const { data: allPoolsData } = await supabase
      .from('pools')
      .select('*')
      .in('id', poolIds)
    setAllPools(allPoolsData ?? [])

    // 3. Determine active pool
    const savedId = overrideActiveId ?? localStorage.getItem('activePoolId')
    const active = allPoolsData?.find(p => p.id === savedId) ?? allPoolsData?.[0]
    if (!active) {
      setPool(null)
      setMembers([])
      setBrackets([])
      setIsLoading(false)
      return
    }
    setPool(active)
    localStorage.setItem('activePoolId', active.id)

    await loadActivePoolDetails(active.id)
  }

  async function loadActivePoolDetails(poolId) {
    // Members with profiles — use security-definer RPC to bypass RLS
    const { data: membersData } = await supabase
      .rpc('get_pool_members', { p_pool_id: poolId })
    // Reshape to match expected format: { user_id, joined_at, profiles: { username, is_admin } }
    const reshapedMembers = (membersData ?? []).map((m) => ({
      user_id:   m.user_id,
      joined_at: m.joined_at,
      profiles:  { username: m.username, is_admin: m.is_admin },
    }))
    setMembers(reshapedMembers)

    // All brackets in this pool
    const { data: bracketsData } = await supabase
      .from('brackets')
      .select('*')
      .eq('pool_id', poolId)
    setBrackets(bracketsData ?? [])

    setIsLoading(false)
  }

  function switchPool(poolId) {
    const target = allPools.find(p => p.id === poolId)
    if (!target) return
    localStorage.setItem('activePoolId', poolId)
    setPool(target)
    setMembers([])
    setBrackets([])
    setIsLoading(true)
    loadActivePoolDetails(poolId)
  }

  async function joinPool(inviteCode) {
    const { data: rows, error } = await supabase
      .rpc('get_pool_by_invite_code', { code: inviteCode.trim() })

    const targetPool = rows?.[0] ?? null
    if (error || !targetPool) return { error: 'Invalid invite code' }

    const { error: joinError } = await supabase
      .from('pool_members')
      .insert({ pool_id: targetPool.id, user_id: session.user.id })

    if (joinError) return { error: joinError.message }

    // Set the newly joined pool as active
    localStorage.setItem('activePoolId', targetPool.id)
    await loadPoolData(targetPool.id)
    return { pool: targetPool }
  }

  async function createPool(name) {
    const inviteCode = generateInviteCode()

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        scoring_config: { R64: 10, R32: 20, S16: 40, E8: 80, F4: 160, Champ: 320 },
        locked: false,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    await supabase
      .from('pool_members')
      .insert({ pool_id: newPool.id, user_id: session.user.id })

    // Set the newly created pool as active
    localStorage.setItem('activePoolId', newPool.id)
    await loadPoolData(newPool.id)
    return { pool: newPool }
  }

  // Derived PLAYERS array — recomputed whenever brackets or games change
  const PLAYERS_LIVE = useMemo(() => {
    if (!members.length) return null
    return buildPlayersArray(members, brackets, games)
  }, [members, brackets, games])

  return (
    <PoolContext.Provider value={{
      pool,
      allPools,
      activePoolId: pool?.id ?? null,
      members,
      brackets,
      games,
      PLAYERS_LIVE,
      simResult,
      isLoading,
      joinPool,
      createPool,
      switchPool,
      refreshPool: loadPoolData,
    }}>
      {children}
    </PoolContext.Provider>
  )
}
