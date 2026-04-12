import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export const PoolContext = createContext(null)

const ACTIVE_KEY = 'nfl_survivor_active_pool_id'
const SURVIVOR_PRODUCT_KEY = 'nfl_survivor'
const KNOWN_POOLS_KEY = 'nfl_survivor_known_pool_ids'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const SURVIVOR_SETTINGS_DEFAULTS = {
  product_key: SURVIVOR_PRODUCT_KEY,
  season: 2026,
  missed_pick_behavior: 'eliminate',
  tie_behavior: 'eliminate',
  lock_behavior: 'game_kickoff',
}

function normalizeSurvivorPool(pool) {
  if (!pool) return pool
  return {
    ...pool,
    game_mode: 'survivor_pool',
    settings: {
      ...SURVIVOR_SETTINGS_DEFAULTS,
      ...(pool.settings ?? {}),
      product_key: SURVIVOR_PRODUCT_KEY,
    },
  }
}

function isSurvivorPool(pool) {
  const productKey = pool?.settings?.product_key ?? pool?.settings?.productKey
  return productKey === SURVIVOR_PRODUCT_KEY || pool?.game_mode === 'survivor_pool'
}

function getKnownPoolIds() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KNOWN_POOLS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function rememberKnownPoolId(poolId) {
  if (typeof window === 'undefined' || !poolId) return
  const next = Array.from(new Set([...getKnownPoolIds(), poolId]))
  window.localStorage.setItem(KNOWN_POOLS_KEY, JSON.stringify(next))
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

    const activeId = localStorage.getItem(ACTIVE_KEY) ?? null
    if (activeId) rememberKnownPoolId(activeId)
    const knownPoolIds = new Set(getKnownPoolIds())
    const ownedPools = (pools ?? []).filter((candidate) => isSurvivorPool(candidate) || knownPoolIds.has(candidate.id)).map(normalizeSurvivorPool)
    setAllPools(ownedPools)

    // Restore active pool from localStorage
    const restoredActiveId = activeId ?? ownedPools[0]?.id ?? null
    const activePool = ownedPools.find(p => p.id === restoredActiveId) ?? ownedPools[0] ?? null
    setPool(activePool)

    if (activePool) {
      localStorage.setItem(ACTIVE_KEY, activePool.id)
      rememberKnownPoolId(activePool.id)
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
      isAdmin: m.is_admin,
      isCurrentUser: m.user_id === session?.user?.id,
    }))
  }, [members, session?.user?.id])

  function settingsForPool(targetPool = pool) {
    if (!targetPool) return SURVIVOR_SETTINGS_DEFAULTS
    return { ...SURVIVOR_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
  }

  async function createPool({ name, gameMode, settings }) {
    const inviteCode = generateInviteCode()
    const defaultSettings = {
      ...SURVIVOR_SETTINGS_DEFAULTS,
      ...(settings ?? {}),
      product_key: SURVIVOR_PRODUCT_KEY,
    }

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        game_mode: gameMode ?? 'survivor_pool',
        settings: defaultSettings,
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
    rememberKnownPoolId(newPool.id)

    // Set state directly — do not call loadPools() here, as its async
    // re-fetch can transiently set pool=null and bounce PoolGuard to /join.
    const normalizedPool = normalizeSurvivorPool(newPool)
    setPool(normalizedPool)
    setAllPools(prev => [normalizedPool, ...prev.map(normalizeSurvivorPool)])
    setMembers([])
    setIsLoading(false)

    return { pool: newPool }
  }

  async function joinPool(inviteCode) {
    const { data: pools } = await supabase.rpc('get_pool_by_invite_code', { code: inviteCode.trim().toUpperCase() })
    const target = normalizeSurvivorPool(pools?.[0])
    if (!target) return { error: 'Invalid invite code' }
    if (!isSurvivorPool(target)) return { error: 'That invite code belongs to a different Sports Closet product.' }

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
    rememberKnownPoolId(target.id)

    // Set state directly — do not call loadPools() here for the same reason as createPool.
    setPool(target)
    setAllPools(prev => prev.find(p => p.id === target.id) ? prev.map(normalizeSurvivorPool) : [target, ...prev.map(normalizeSurvivorPool)])
    setIsLoading(false)

    return { pool: target }
  }

  async function switchPool(poolId) {
    localStorage.setItem(ACTIVE_KEY, poolId)
    rememberKnownPoolId(poolId)
    const nextPool = allPools.find(p => p.id === poolId) ?? null
    setPool(nextPool)
    if (nextPool) await loadMembers(nextPool.id)
  }

  async function updatePoolSettings(settingsPatch) {
    if (!pool) return
    const nextSettings = { ...(pool.settings ?? {}), ...settingsPatch }
    await supabase.from('pools').update({ settings: nextSettings }).eq('id', pool.id)
    setPool(prev => prev ? normalizeSurvivorPool({ ...prev, settings: nextSettings }) : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? normalizeSurvivorPool({ ...p, settings: nextSettings }) : p))
  }

  async function updatePoolMeta(patch) {
    if (!pool) return
    await supabase.from('pools').update(patch).eq('id', pool.id)
    setPool(prev => prev ? normalizeSurvivorPool({ ...prev, ...patch }) : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? normalizeSurvivorPool({ ...p, ...patch }) : p))
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
