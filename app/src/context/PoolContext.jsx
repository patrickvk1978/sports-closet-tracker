import { createContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useGames } from '../hooks/useGames'
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

  const [pool,     setPool]     = useState(null)
  const [members,  setMembers]  = useState([])
  const [brackets, setBrackets] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!session) {
      setPool(null)
      setMembers([])
      setBrackets([])
      setIsLoading(false)
      return
    }
    loadPoolData()
  }, [session])

  async function loadPoolData() {
    setIsLoading(true)

    // 1. Find this user's pool membership (take first pool if multiple)
    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', session.user.id)
      .limit(1)

    if (!memberships || memberships.length === 0) {
      setIsLoading(false)
      return
    }
    const poolId = memberships[0].pool_id

    // 2. Pool details
    const { data: poolData } = await supabase
      .from('pools')
      .select('*')
      .eq('id', poolId)
      .single()
    setPool(poolData ?? null)

    // 3. Members with profiles — use security-definer RPC to bypass RLS
    //    which would otherwise restrict each user to seeing only their own row.
    const { data: membersData } = await supabase
      .rpc('get_pool_members', { p_pool_id: poolId })
    // Reshape to match expected format: { user_id, joined_at, profiles: { username, is_admin } }
    const members = (membersData ?? []).map((m) => ({
      user_id:   m.user_id,
      joined_at: m.joined_at,
      profiles:  { username: m.username, is_admin: m.is_admin },
    }))
    setMembers(members)

    // 4. All brackets in this pool
    const { data: bracketsData } = await supabase
      .from('brackets')
      .select('*')
      .eq('pool_id', poolId)
    setBrackets(bracketsData ?? [])

    setIsLoading(false)
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

    await loadPoolData()
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

    await loadPoolData()
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
      members,
      brackets,
      games,
      PLAYERS_LIVE,
      isLoading,
      joinPool,
      createPool,
      refreshPool: loadPoolData,
    }}>
      {children}
    </PoolContext.Provider>
  )
}
