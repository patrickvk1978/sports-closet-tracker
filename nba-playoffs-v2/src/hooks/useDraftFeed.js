import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

export function useDraftFeed() {
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
      supabase.from('draft_feed').select('*').eq('id', 1).single(),
      supabase.from('draft_actual_picks').select('*'),
      supabase.from('draft_team_overrides').select('*'),
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

    // Realtime subscriptions
    const channel = supabase
      .channel('draft-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_feed' }, (payload) => {
        if (payload.new) setDraftFeed(payload.new)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_actual_picks' }, (payload) => {
        setActualPicks(prev => ({ ...prev, [payload.new.pick_number]: payload.new.prospect_id }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'draft_actual_picks' }, (payload) => {
        setActualPicks(prev => {
          const next = { ...prev }
          delete next[payload.old.pick_number]
          return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_team_overrides' }, (payload) => {
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

  function teamCodeForPick(pickNumber) {
    if (teamOverrides[pickNumber]) return teamOverrides[pickNumber]
    const pick = picks.find(p => p.number === pickNumber)
    return pick?.currentTeam ?? null
  }

  // Build a combined draftFeed-like object for backward compatibility with views
  const combinedFeed = {
    ...draftFeed,
    actual_picks: actualPicks,
    team_overrides: teamOverrides,
  }

  const totalPicks = picks.length || 32

  // ── Admin controls ──

  async function setDraftPhase(phase) {
    await supabase.from('draft_feed').update({ phase, updated_at: new Date().toISOString() }).eq('id', 1)
  }

  async function setCurrentPickNumber(pickNumber) {
    const clamped = Math.max(1, Math.min(Number(pickNumber), totalPicks))
    await supabase.from('draft_feed').update({
      current_pick_number: clamped,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function setPickStatus(status) {
    await supabase.from('draft_feed').update({
      current_status: status,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function startDraftNight() {
    await supabase.from('draft_feed').update({
      phase: 'live',
      current_pick_number: 1,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function overrideTeamOnClock(teamCode, pickNumber = draftFeed.current_pick_number) {
    await supabase.from('draft_team_overrides').upsert({
      pick_number: pickNumber,
      team_code: teamCode,
    })
  }

  async function clearTeamOverride(pickNumber = draftFeed.current_pick_number) {
    await supabase.from('draft_team_overrides').delete().eq('pick_number', pickNumber)
  }

  async function revealCurrentPick(prospectId, pickNumber = draftFeed.current_pick_number) {
    if (!prospectId) return
    await supabase.from('draft_actual_picks').upsert({
      pick_number: pickNumber,
      prospect_id: prospectId,
    })
    await supabase.from('draft_feed').update({
      current_status: 'revealed',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function rollbackPick(pickNumber = draftFeed.current_pick_number) {
    await supabase.from('draft_actual_picks').delete().eq('pick_number', pickNumber)
    await supabase.from('draft_feed').update({
      current_pick_number: pickNumber,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function advanceDraft() {
    const next = Math.min(draftFeed.current_pick_number + 1, totalPicks)
    await supabase.from('draft_feed').update({
      phase: 'live',
      current_pick_number: next,
      current_status: 'on_clock',
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
  }

  async function resetDraftFeed() {
    await supabase.from('draft_actual_picks').delete().gte('pick_number', 1)
    await supabase.from('draft_team_overrides').delete().gte('pick_number', 1)
    await supabase.from('draft_feed').update({
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
  }
}
