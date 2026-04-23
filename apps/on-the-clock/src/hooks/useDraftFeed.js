import { useCallback, useEffect, useId, useState } from 'react'
import { supabase, draftDb } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

export function useDraftFeed() {
  const { picks } = useReferenceData()
  const channelId = useId()
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
      .channel(`draft-state-${channelId}`)
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
  }, [load, channelId])

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

  // ── Admin controls ──

  async function setDraftPhase(phase) {
    await draftDb.from('feed').update({ phase, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  async function setCurrentPickNumber(pickNumber) {
    const clamped = Math.max(1, Math.min(Number(pickNumber), totalPicks))
    await draftDb.from('feed').update({
      current_pick_number: clamped,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function setPickStatus(status) {
    await draftDb.from('feed').update({
      current_status: status,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function startDraftNight() {
    await draftDb.from('feed').update({
      phase: 'live',
      current_pick_number: 1,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function overrideTeamOnClock(teamCode, pickNumber = draftFeed.current_pick_number) {
    await draftDb.from('team_overrides').upsert({
      pick_number: pickNumber,
      team_code: teamCode,
    })
  }

  async function clearTeamOverride(pickNumber = draftFeed.current_pick_number) {
    await draftDb.from('team_overrides').delete().eq('pick_number', pickNumber)
  }

  async function revealCurrentPick(prospectId, pickNumber = draftFeed.current_pick_number) {
    if (!prospectId) return
    await draftDb.from('actual_picks').upsert({
      pick_number: pickNumber,
      prospect_id: prospectId,
    })
    await draftDb.from('feed').update({
      current_status: 'revealed',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function rollbackPick(pickNumber = draftFeed.current_pick_number) {
    await draftDb.from('actual_picks').delete().eq('pick_number', pickNumber)
    await draftDb.from('feed').update({
      current_pick_number: pickNumber,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function advanceDraft() {
    const next = Math.min(draftFeed.current_pick_number + 1, totalPicks)
    await draftDb.from('feed').update({
      phase: 'live',
      current_pick_number: next,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
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
    await draftDb.from('feed').update({
      phase: 'pre_draft',
      current_pick_number: 1,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  return {
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
}
