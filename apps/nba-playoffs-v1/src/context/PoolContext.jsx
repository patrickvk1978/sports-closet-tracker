import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export const PoolContext = createContext(null)

const ACTIVE_KEY = 'nba_playoffs_active_pool_id'
const NBA_PRODUCT_KEY = 'nba_playoffs'
const KNOWN_POOLS_KEY = 'nba_playoffs_known_pool_ids'

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

const SERIES_SETTINGS_DEFAULTS = {
  scoring_model: 'round_weighted_series_v1',
  round_scoring: {
    round_1: { exactBase: 5, edgeBonus: 1, offBy1: 3, offBy2: 1 },
    semifinals: { exactBase: 7, edgeBonus: 1, offBy1: 4, offBy2: 1 },
    finals: { exactBase: 9, edgeBonus: 1, offBy1: 5, offBy2: 2 },
    nba_finals: { exactBase: 11, edgeBonus: 1, offBy1: 6, offBy2: 2 },
  },
  allow_edits_until_tipoff: true,
}

function normalizeNbaPool(pool) {
  if (!pool) return pool
  return {
    ...pool,
    game_mode: 'series_pickem',
    settings: {
      ...SERIES_SETTINGS_DEFAULTS,
      ...(pool.settings ?? {}),
      product_key: NBA_PRODUCT_KEY,
    },
  }
}

function isNbaPool(pool) {
  const productKey = pool?.settings?.product_key ?? pool?.settings?.productKey
  return productKey === NBA_PRODUCT_KEY || ['bracket_pool', 'series_pickem'].includes(pool?.game_mode)
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
    const ownedPools = (pools ?? []).filter((candidate) => isNbaPool(candidate) || knownPoolIds.has(candidate.id))
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
    return members.map(m => {
      const fallbackName = m.username?.trim() || m.email?.trim() || `Member ${String(m.user_id ?? "").slice(0, 8)}`;
      return ({
      id: m.user_id,
      name: fallbackName,
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
    })})
  }, [members, pool?.admin_id, session?.user?.id])

  function settingsForPool(targetPool = pool) {
    if (!targetPool) return SERIES_SETTINGS_DEFAULTS
    return { ...SERIES_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
  }

  async function createPool({ name, gameMode, settings }) {
    const inviteCode = generateInviteCode()
    const productSettings = {
      ...SERIES_SETTINGS_DEFAULTS,
      ...(settings ?? {}),
      product_key: NBA_PRODUCT_KEY,
    }

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        game_mode: 'series_pickem',
        settings: productSettings,
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
    const normalizedPool = normalizeNbaPool(newPool)
    setPool(normalizedPool)
    setAllPools(prev => [normalizedPool, ...prev.map(normalizeNbaPool)])
    setMembers([])
    setIsLoading(false)

    return { pool: newPool }
  }

  async function joinPool(inviteCode) {
    const { data: pools } = await supabase.rpc('get_pool_by_invite_code', { code: inviteCode.trim().toUpperCase() })
    const target = normalizeNbaPool(pools?.[0])
    if (!target) return { error: 'Invalid invite code' }
    if (!isNbaPool(target)) return { error: 'That invite code belongs to a different Sports Closet product.' }

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
    setAllPools(prev => prev.find(p => p.id === target.id) ? prev.map(normalizeNbaPool) : [target, ...prev.map(normalizeNbaPool)])
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
    setPool(prev => prev ? normalizeNbaPool({ ...prev, settings: nextSettings }) : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? normalizeNbaPool({ ...p, settings: nextSettings }) : p))
  }

  async function updatePoolMeta(patch) {
    if (!pool) return
    await supabase.from('pools').update(patch).eq('id', pool.id)
    setPool(prev => prev ? normalizeNbaPool({ ...prev, ...patch }) : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? normalizeNbaPool({ ...p, ...patch }) : p))
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
