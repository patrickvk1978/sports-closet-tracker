import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export const PoolContext = createContext(null)

const ACTIVE_KEY = 'nba_playoffs_active_pool_id'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const BRACKET_SETTINGS_DEFAULTS = {
  rounds: 4,
  reseed_after_round: false,
  lock_behavior: 'before_tipoff',
}

const SERIES_SETTINGS_DEFAULTS = {
  points_per_correct_series: 3,
  bonus_for_exact_games: 1,
  allow_edits_until_tipoff: true,
}

export function PoolProvider({ children }) {
  const { session, profile } = useAuth()
  const [pool, setPool] = useState(null)
  const [allPools, setAllPools] = useState([])
  const [members, setMembers] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const loadPools = useCallback(async () => {
    if (!session?.user) {
      setPool(null)
      setAllPools([])
      setMembers([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    // Get all pools this user belongs to
    const { data: memberships } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', session.user.id)

    if (!memberships || memberships.length === 0) {
      setAllPools([])
      setPool(null)
      setMembers([])
      setIsLoading(false)
      return
    }

    const poolIds = memberships.map(m => m.pool_id)
    const { data: pools } = await supabase
      .from('pools')
      .select('*')
      .in('id', poolIds)
      .order('created_at', { ascending: false })

    const ownedPools = pools ?? []
    setAllPools(ownedPools)

    // Restore active pool from localStorage
    const activeId = localStorage.getItem(ACTIVE_KEY) ?? ownedPools[0]?.id ?? null
    const activePool = ownedPools.find(p => p.id === activeId) ?? ownedPools[0] ?? null
    setPool(activePool)

    if (activePool) {
      localStorage.setItem(ACTIVE_KEY, activePool.id)
      await loadMembers(activePool.id)
    } else {
      setMembers([])
    }

    setIsLoading(false)
  }, [session?.user?.id])

  async function loadMembers(poolId) {
    const { data } = await supabase.rpc('get_pool_members', { p_pool_id: poolId })
    setMembers(data ?? [])
  }

  useEffect(() => {
    loadPools()
  }, [loadPools])

  // Derived member list for views
  const memberList = useMemo(() => {
    return members.map(m => ({
      id: m.user_id,
      name: m.username,
      isSiteAdmin: m.is_admin,
      isCommissioner: pool?.admin_id === m.user_id,
      isCurrentUser: m.user_id === session?.user?.id,
      roleLabel:
        m.user_id === session?.user?.id && m.is_admin
          ? "You · Site admin"
          : m.user_id === session?.user?.id && pool?.admin_id === m.user_id
            ? "You · Commissioner"
            : m.user_id === session?.user?.id
              ? "You"
              : m.is_admin
                ? "Site admin"
                : pool?.admin_id === m.user_id
                  ? "Commissioner"
                  : "Member",
    }))
  }, [members, pool?.admin_id, session?.user?.id])

  function settingsForPool(targetPool = pool) {
    if (!targetPool) return BRACKET_SETTINGS_DEFAULTS
    return targetPool.game_mode === 'series_pickem'
      ? { ...SERIES_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
      : { ...BRACKET_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
  }

  async function createPool({ name, gameMode, settings }) {
    const inviteCode = generateInviteCode()
    const defaultSettings = gameMode === 'series_pickem' ? SERIES_SETTINGS_DEFAULTS : BRACKET_SETTINGS_DEFAULTS

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        game_mode: gameMode,
        settings: settings ?? defaultSettings,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    // Join the pool as creator
    await supabase.from('pool_members').insert({
      pool_id: newPool.id,
      user_id: session.user.id,
    })

    localStorage.setItem(ACTIVE_KEY, newPool.id)

    // Set state directly — do not call loadPools() here, as its async
    // re-fetch can transiently set pool=null and bounce PoolGuard to /join.
    setPool(newPool)
    setAllPools(prev => [newPool, ...prev])
    setMembers([])
    setIsLoading(false)

    return { pool: newPool }
  }

  async function joinPool(inviteCode) {
    const { data: pools } = await supabase.rpc('get_pool_by_invite_code', { code: inviteCode.trim().toUpperCase() })
    const target = pools?.[0]
    if (!target) return { error: 'Invalid invite code' }

    // Check if already a member
    const { data: existing } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('pool_id', target.id)
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!existing) {
      await supabase.from('pool_members').insert({
        pool_id: target.id,
        user_id: session.user.id,
      })
    }

    localStorage.setItem(ACTIVE_KEY, target.id)

    // Set state directly — do not call loadPools() here for the same reason as createPool.
    setPool(target)
    setAllPools(prev => prev.find(p => p.id === target.id) ? prev : [target, ...prev])
    setIsLoading(false)

    return { pool: target }
  }

  async function switchPool(poolId) {
    localStorage.setItem(ACTIVE_KEY, poolId)
    const nextPool = allPools.find(p => p.id === poolId) ?? null
    setPool(nextPool)
    if (nextPool) await loadMembers(nextPool.id)
  }

  async function updatePoolSettings(settingsPatch) {
    if (!pool) return
    const nextSettings = { ...(pool.settings ?? {}), ...settingsPatch }
    await supabase.from('pools').update({ settings: nextSettings }).eq('id', pool.id)
    setPool(prev => prev ? { ...prev, settings: nextSettings } : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? { ...p, settings: nextSettings } : p))
  }

  async function updatePoolMeta(patch) {
    if (!pool) return
    await supabase.from('pools').update(patch).eq('id', pool.id)
    setPool(prev => prev ? { ...prev, ...patch } : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? { ...p, ...patch } : p))
  }

  const value = useMemo(() => ({
    pool,
    allPools,
    members,
    memberList,
    isLoading,
    settingsForPool,
    createPool,
    joinPool,
    switchPool,
    updatePoolSettings,
    updatePoolMeta,
    loadPools,
  }), [pool, allPools, members, memberList, isLoading])

  return <PoolContext.Provider value={value}>{children}</PoolContext.Provider>
}
