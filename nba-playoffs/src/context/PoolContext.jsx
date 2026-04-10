import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getDemoStorageKeys, isDemoModeEnabled, readJson, writeJson } from '../lib/demoMode'

export const PoolContext = createContext(null)

const ACTIVE_KEY = 'nba_playoffs_active_pool_id'
const NBA_PRODUCT_KEY = 'nba_playoffs'
const KNOWN_POOLS_KEY = 'nba_playoffs_known_pool_ids'
const { pools: DEMO_POOLS_KEY, members: DEMO_MEMBERS_KEY, activePool: DEMO_ACTIVE_KEY } = getDemoStorageKeys()

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

function demoEnabled() {
  return !isSupabaseConfigured || isDemoModeEnabled()
}

function seedDemoStateForUser(user) {
  const pools = readJson(DEMO_POOLS_KEY, [])
  const members = readJson(DEMO_MEMBERS_KEY, [])
  if (pools.length > 0) return { pools, members }

  const now = new Date().toISOString()
  const demoPools = [
    {
      id: crypto.randomUUID(),
      name: "Demo Bracket Room",
      admin_id: user.id,
      invite_code: generateInviteCode(),
      game_mode: "bracket_pool",
      settings: { ...BRACKET_SETTINGS_DEFAULTS, product_key: NBA_PRODUCT_KEY },
      created_at: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Demo Series Pick'em",
      admin_id: user.id,
      invite_code: generateInviteCode(),
      game_mode: "series_pickem",
      settings: { ...SERIES_SETTINGS_DEFAULTS, product_key: NBA_PRODUCT_KEY },
      created_at: now,
    },
  ]

  const demoMembers = [
    { pool_id: demoPools[0].id, user_id: user.id, username: user.username, is_admin: Boolean(user.is_admin), joined_at: now },
    { pool_id: demoPools[1].id, user_id: user.id, username: user.username, is_admin: Boolean(user.is_admin), joined_at: now },
    { pool_id: demoPools[0].id, user_id: `${demoPools[0].id}:friend-1`, username: "Sarah", is_admin: false, joined_at: now },
    { pool_id: demoPools[0].id, user_id: `${demoPools[0].id}:friend-2`, username: "Davin", is_admin: false, joined_at: now },
    { pool_id: demoPools[1].id, user_id: `${demoPools[1].id}:friend-1`, username: "Maya", is_admin: false, joined_at: now },
    { pool_id: demoPools[1].id, user_id: `${demoPools[1].id}:friend-2`, username: "Jordan", is_admin: false, joined_at: now },
  ]

  writeJson(DEMO_POOLS_KEY, demoPools)
  writeJson(DEMO_MEMBERS_KEY, demoMembers)
  window.localStorage.setItem(DEMO_ACTIVE_KEY, demoPools[0].id)
  return { pools: demoPools, members: demoMembers }
}

export function PoolProvider({ children }) {
  const { session, profile, isDemoMode } = useAuth()
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

    if (demoEnabled() || isDemoMode) {
      setIsLoading(true)
      const seeded = seedDemoStateForUser(session.user)
      const ownedPools = seeded.pools.filter((candidate) => isNbaPool(candidate))
      const activeId = window.localStorage.getItem(DEMO_ACTIVE_KEY) ?? ownedPools[0]?.id ?? null
      const activePool = ownedPools.find((candidate) => candidate.id === activeId) ?? ownedPools[0] ?? null
      setAllPools(ownedPools)
      setPool(activePool)
      setMembers(seeded.members.filter((member) => member.pool_id === activePool?.id))
      setIsLoading(false)
      return
    }

    setIsLoading(true)

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
  }, [session?.user, isDemoMode])

  async function loadMembers(poolId) {
    if (demoEnabled() || isDemoMode) {
      const demoMembers = readJson(DEMO_MEMBERS_KEY, []).filter((member) => member.pool_id === poolId)
      setMembers(demoMembers)
      return
    }
    const { data } = await supabase.rpc('get_pool_members', { p_pool_id: poolId })
    setMembers(data ?? [])
  }

  useEffect(() => {
    loadPools()
  }, [loadPools])

  const memberList = useMemo(() => {
    return members.map(m => ({
      id: m.user_id,
      name: m.username,
      isSiteAdmin: Boolean(m.is_admin),
      isCommissioner: pool?.admin_id === m.user_id,
      isCurrentUser: m.user_id === session?.user?.id,
      roleLabel:
        m.user_id === session?.user?.id && (profile?.is_admin || m.is_admin)
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
  }, [members, pool?.admin_id, session?.user?.id, profile?.is_admin])

  function settingsForPool(targetPool = pool) {
    if (!targetPool) return BRACKET_SETTINGS_DEFAULTS
    return targetPool.game_mode === 'series_pickem'
      ? { ...SERIES_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
      : { ...BRACKET_SETTINGS_DEFAULTS, ...(targetPool.settings ?? {}) }
  }

  async function createPool({ name, gameMode, settings }) {
    const inviteCode = generateInviteCode()
    const defaultSettings = gameMode === 'series_pickem' ? SERIES_SETTINGS_DEFAULTS : BRACKET_SETTINGS_DEFAULTS
    const productSettings = {
      ...defaultSettings,
      ...(settings ?? {}),
      product_key: NBA_PRODUCT_KEY,
    }

    if (demoEnabled() || isDemoMode) {
      const demoPools = readJson(DEMO_POOLS_KEY, [])
      const demoMembers = readJson(DEMO_MEMBERS_KEY, [])
      const newPool = {
        id: crypto.randomUUID(),
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        game_mode: gameMode,
        settings: productSettings,
        created_at: new Date().toISOString(),
      }
      demoPools.unshift(newPool)
      demoMembers.push({
        pool_id: newPool.id,
        user_id: session.user.id,
        username: session.user.username,
        is_admin: Boolean(session.user.is_admin),
        joined_at: new Date().toISOString(),
      })
      writeJson(DEMO_POOLS_KEY, demoPools)
      writeJson(DEMO_MEMBERS_KEY, demoMembers)
      window.localStorage.setItem(DEMO_ACTIVE_KEY, newPool.id)
      setPool(newPool)
      setAllPools(demoPools)
      setMembers(demoMembers.filter((member) => member.pool_id === newPool.id))
      setIsLoading(false)
      return { pool: newPool }
    }

    const { data: newPool, error } = await supabase
      .from('pools')
      .insert({
        name,
        admin_id: session.user.id,
        invite_code: inviteCode,
        game_mode: gameMode,
        settings: productSettings,
      })
      .select()
      .single()

    if (error) return { error: error.message }

    await supabase.from('pool_members').insert({
      pool_id: newPool.id,
      user_id: session.user.id,
    })

    localStorage.setItem(ACTIVE_KEY, newPool.id)
    rememberKnownPoolId(newPool.id)
    setPool(newPool)
    setAllPools(prev => [newPool, ...prev])
    setMembers([])
    setIsLoading(false)

    return { pool: newPool }
  }

  async function joinPool(inviteCode) {
    if (demoEnabled() || isDemoMode) {
      const code = inviteCode.trim().toUpperCase()
      const demoPools = readJson(DEMO_POOLS_KEY, [])
      const demoMembers = readJson(DEMO_MEMBERS_KEY, [])
      const target = demoPools.find((candidate) => candidate.invite_code === code)
      if (!target) return { error: 'Invalid invite code' }

      const existing = demoMembers.find((member) => member.pool_id === target.id && member.user_id === session.user.id)
      if (!existing) {
        demoMembers.push({
          pool_id: target.id,
          user_id: session.user.id,
          username: session.user.username,
          is_admin: Boolean(session.user.is_admin),
          joined_at: new Date().toISOString(),
        })
        writeJson(DEMO_MEMBERS_KEY, demoMembers)
      }

      window.localStorage.setItem(DEMO_ACTIVE_KEY, target.id)
      setPool(target)
      setAllPools(demoPools)
      setMembers(demoMembers.filter((member) => member.pool_id === target.id))
      setIsLoading(false)
      return { pool: target }
    }

    const { data: pools } = await supabase.rpc('get_pool_by_invite_code', { code: inviteCode.trim().toUpperCase() })
    const target = pools?.[0]
    if (!target) return { error: 'Invalid invite code' }
    if (!isNbaPool(target)) return { error: 'That invite code belongs to a different Sports Closet product.' }

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
    setPool(target)
    setAllPools(prev => prev.find(p => p.id === target.id) ? prev : [target, ...prev])
    setIsLoading(false)

    return { pool: target }
  }

  async function switchPool(poolId) {
    if (demoEnabled() || isDemoMode) {
      window.localStorage.setItem(DEMO_ACTIVE_KEY, poolId)
      const demoPools = readJson(DEMO_POOLS_KEY, [])
      const demoMembers = readJson(DEMO_MEMBERS_KEY, [])
      const nextPool = demoPools.find((pool) => pool.id === poolId) ?? null
      setPool(nextPool)
      setAllPools(demoPools)
      setMembers(demoMembers.filter((member) => member.pool_id === poolId))
      return
    }

    localStorage.setItem(ACTIVE_KEY, poolId)
    rememberKnownPoolId(poolId)
    const nextPool = allPools.find(p => p.id === poolId) ?? null
    setPool(nextPool)
    if (nextPool) await loadMembers(nextPool.id)
  }

  async function updatePoolSettings(settingsPatch) {
    if (!pool) return
    const nextSettings = { ...(pool.settings ?? {}), ...settingsPatch }

    if (demoEnabled() || isDemoMode) {
      const demoPools = readJson(DEMO_POOLS_KEY, [])
      const nextPools = demoPools.map((candidate) => candidate.id === pool.id ? { ...candidate, settings: nextSettings } : candidate)
      writeJson(DEMO_POOLS_KEY, nextPools)
      setPool(prev => prev ? { ...prev, settings: nextSettings } : prev)
      setAllPools(nextPools)
      return
    }

    await supabase.from('pools').update({ settings: nextSettings }).eq('id', pool.id)
    setPool(prev => prev ? { ...prev, settings: nextSettings } : prev)
    setAllPools(prev => prev.map(p => p.id === pool.id ? { ...p, settings: nextSettings } : p))
  }

  async function updatePoolMeta(patch) {
    if (!pool) return

    if (demoEnabled() || isDemoMode) {
      const demoPools = readJson(DEMO_POOLS_KEY, [])
      const nextPools = demoPools.map((candidate) => candidate.id === pool.id ? { ...candidate, ...patch } : candidate)
      writeJson(DEMO_POOLS_KEY, nextPools)
      setPool(prev => prev ? { ...prev, ...patch } : prev)
      setAllPools(nextPools)
      return
    }

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
