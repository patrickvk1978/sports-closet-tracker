import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, draftDb } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

const DraftFeedContext = createContext(null)

export function DraftFeedProvider({ children }) {
  const { picks } = useReferenceData()
  const [draftFeed, setDraftFeed] = useState({
    phase: 'pre_draft',
    current_pick_number: 1,
    current_status: 'on_clock',
  })
  const [actualPicks, setActualPicks] = useState({})   // { pickNumber: prospectId }
  const [teamOverrides, setTeamOverrides] = useState({}) // { pickNumber: teamCode }
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const [feedRes, picksRes, overridesRes] = await Promise.all([
      draftDb.from('feed').select('*').eq('id', 1).single(),
      draftDb.from('actual_picks').select('*'),
      draftDb.from('team_overrides').select('*'),
    ])

    if (feedRes.data) {
      setDraftFeed(feedRes.data)
    }

    if (picksRes.data) {
      const map = {}
      picksRes.data.forEach(row => { map[row.pick_number] = row.prospect_id })
      setActualPicks(map)
    }

    if (overridesRes.data) {
      const map = {}
      overridesRes.data.forEach(row => { map[row.pick_number] = row.team_code })
      setTeamOverrides(map)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    load()

    // Realtime subscriptions — note schema: 'draft'
    const channel = supabase
      .channel('draft-state')
      .on('postgres_changes', { event: '*', schema: 'draft', table: 'feed' }, (payload) => {
        if (payload.new) setDraftFeed(payload.new)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'draft', table: 'actual_picks' }, (payload) => {
        setActualPicks(prev => ({ ...prev, [payload.new.pick_number]: payload.new.prospect_id }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'draft', table: 'actual_picks' }, (payload) => {
        setActualPicks(prev => {
          const next = { ...prev }
          delete next[payload.old.pick_number]
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'draft', table: 'team_overrides' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setTeamOverrides(prev => {
            const next = { ...prev }
            delete next[payload.old.pick_number]
            return next
          })
        } else {
          setTeamOverrides(prev => ({ ...prev, [payload.new.pick_number]: payload.new.team_code }))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [load])

  useEffect(() => {
    // Realtime is the primary source of truth, but during the live draft we
    // also poll as a safety net so stale tabs recover if a websocket update is
    // missed.
    const intervalId = setInterval(() => {
      void load()
    }, draftFeed.phase === 'live' ? 5000 : 15000)

    return () => clearInterval(intervalId)
  }, [draftFeed.phase, load])

  function teamCodeForPick(pickNumber) {
    if (teamOverrides[pickNumber]) return teamOverrides[pickNumber]
    const pick = picks.find(p => p.number === pickNumber)
    return pick?.currentTeam ?? null
  }

  const combinedFeed = {
    ...draftFeed,
    actual_picks: actualPicks,
    team_overrides: teamOverrides,
  }

  const totalPicks = picks.length || 32

  async function clearPickStateArtifacts(pickNumber) {
    const operations = [
      draftDb.from('live_cards').delete().eq('pick_number', pickNumber),
      draftDb.from('queues').delete().eq('pick_number', pickNumber),
      draftDb.from('actual_picks').delete().eq('pick_number', pickNumber),
      draftDb.from('finalized_picks').delete().eq('pick_number', pickNumber),
    ]

    const results = await Promise.allSettled(operations)
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value?.error) {
        const message = result.value.error.message ?? ''
        if (!message.includes('finalized_picks')) {
          console.warn('clearPickStateArtifacts:', message)
        }
      }
    })
  }

  // ── Admin controls ──

  async function setDraftPhase(phase) {
    await draftDb.from('feed').update({ phase, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  async function setCurrentPickNumber(pickNumber) {
    const clamped = Math.max(1, Math.min(Number(pickNumber), totalPicks))
    await draftDb.from('feed').update({
      current_pick_number: clamped,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function setPickStatus(status) {
    const now = new Date().toISOString()
    const payload = {
      current_status: status,
      updated_at: now,
    }

    if (status === 'pick_is_in') {
      payload.pick_is_in_at = now
      payload.provider_expires_at = null
    } else if (status === 'on_clock') {
      payload.pick_is_in_at = null
    } else if (status === 'awaiting_reveal' || status === 'revealed') {
      payload.provider_expires_at = null
    }

    await draftDb.from('feed').update(payload).eq('id', 1)
  }

  async function startDraftNight() {
    await draftDb.from('feed').update({
      phase: 'live',
      current_pick_number: 1,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function overrideTeamOnClock(teamCode, pickNumber = draftFeed.current_pick_number) {
    await clearPickStateArtifacts(pickNumber)
    await draftDb.from('team_overrides').upsert({
      pick_number: pickNumber,
      team_code: teamCode,
    })
    await draftDb.from('feed').update({
      current_pick_number: pickNumber,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function clearTeamOverride(pickNumber = draftFeed.current_pick_number) {
    await clearPickStateArtifacts(pickNumber)
    await draftDb.from('team_overrides').delete().eq('pick_number', pickNumber)
    await draftDb.from('feed').update({
      current_pick_number: pickNumber,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function revealCurrentPick(prospectId, pickNumber = draftFeed.current_pick_number) {
    if (!prospectId) return
    // Ensure finalized_picks rows exist before flipping to revealed so scoring
    // doesn't silently fall through to resolvePreviewPickForUser. Idempotent.
    try {
      await supabase.rpc('finalize_pick', { p_pick_number: pickNumber })
    } catch (err) {
      console.warn('revealCurrentPick finalize_pick:', err?.message)
    }
    await draftDb.from('actual_picks').upsert({
      pick_number: pickNumber,
      prospect_id: prospectId,
    })
    await draftDb.from('feed').update({
      current_status: 'revealed',
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function rollbackPick(pickNumber = draftFeed.current_pick_number) {
    await clearPickStateArtifacts(pickNumber)
    await draftDb.from('feed').update({
      current_pick_number: pickNumber,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function advanceDraft() {
    const next = Math.min(draftFeed.current_pick_number + 1, totalPicks)
    await draftDb.from('feed').update({
      phase: 'live',
      current_pick_number: next,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1).eq('current_pick_number', draftFeed.current_pick_number).eq('current_status', 'revealed')
  }

  async function setScoringConfig(config) {
    await draftDb.from('feed').update({
      scoring_config: config,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function resetDraftFeed() {
    await draftDb.from('actual_picks').delete().gte('pick_number', 1)
    await draftDb.from('team_overrides').delete().gte('pick_number', 1)
    await draftDb.from('live_cards').delete().gte('pick_number', 1)
    await draftDb.from('queues').delete().gte('pick_number', 1)
    await draftDb.from('finalized_picks').delete().gte('pick_number', 1)
    await draftDb.from('feed').update({
      phase: 'pre_draft',
      current_pick_number: 1,
      current_status: 'on_clock',
      pick_is_in_at: null,
      provider_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  const value = {
    draftFeed: combinedFeed,
    actualPicks,
    teamOverrides,
    loading,
    teamCodeForPick,
    setDraftPhase,
    setCurrentPickNumber,
    setPickStatus,
    startDraftNight,
    overrideTeamOnClock,
    clearTeamOverride,
    revealCurrentPick,
    rollbackPick,
    advanceDraft,
    resetDraftFeed,
    setScoringConfig,
  }

  return createElement(DraftFeedContext.Provider, { value }, children)
}

export function useDraftFeed() {
  const ctx = useContext(DraftFeedContext)
  if (!ctx) throw new Error('useDraftFeed must be used inside DraftFeedProvider')
  return ctx
}
