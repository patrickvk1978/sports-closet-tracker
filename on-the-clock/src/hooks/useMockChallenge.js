import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { usePool } from './usePool'
import { supabase } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

const MOCK_SETTINGS_DEFAULTS = {
  exact_hit_points: 3,
  one_away_points: 2,
  two_away_points: 1,
}

export function useMockChallenge({ draftFeed }) {
  const { session } = useAuth()
  const { pool, memberList } = usePool()
  const { picks, getProspectById } = useReferenceData()
  const [mockPredictions, setMockPredictions] = useState({})
  const [hasSubmittedMock, setHasSubmittedMock] = useState(false)
  const [allMemberPredictions, setAllMemberPredictions] = useState({}) // { `userId:pickNumber`: prospectId }
  const [loading, setLoading] = useState(true)

  const poolId = pool?.id
  const userId = session?.user?.id
  const settings = { ...MOCK_SETTINGS_DEFAULTS, ...(pool?.settings ?? {}) }

  const load = useCallback(async () => {
    if (!poolId || !userId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const [predRes, subRes, allPredsRes] = await Promise.all([
      supabase.from('user_predictions').select('pick_number, prospect_id').eq('pool_id', poolId).eq('user_id', userId),
      supabase.from('mock_submissions').select('user_id').eq('pool_id', poolId).eq('user_id', userId).maybeSingle(),
      supabase.from('user_predictions').select('user_id, pick_number, prospect_id').eq('pool_id', poolId),
    ])

    if (predRes.data) {
      const map = {}
      predRes.data.forEach(r => { map[r.pick_number] = r.prospect_id })
      setMockPredictions(map)
    }

    setHasSubmittedMock(Boolean(subRes.data))

    if (allPredsRes.data) {
      const map = {}
      allPredsRes.data.forEach(r => { map[`${r.user_id}:${r.pick_number}`] = r.prospect_id })
      setAllMemberPredictions(map)
    }

    setLoading(false)
  }, [poolId, userId])

  useEffect(() => { load() }, [load])

  async function saveMockPrediction(pickNumber, prospectId) {
    // Find if this prospect is already assigned to another pick and clear it
    const existingPickNum = Object.entries(mockPredictions).find(
      ([num, id]) => id === prospectId && Number(num) !== pickNumber
    )?.[0]

    setMockPredictions(prev => {
      const next = { ...prev }
      if (existingPickNum) delete next[existingPickNum]
      next[pickNumber] = prospectId
      return next
    })
    setAllMemberPredictions(prev => {
      const next = { ...prev }
      if (existingPickNum) delete next[`${userId}:${existingPickNum}`]
      next[`${userId}:${pickNumber}`] = prospectId
      return next
    })

    if (!poolId || !userId) return

    // Clear old slot in DB if needed
    if (existingPickNum) {
      await supabase.from('user_predictions')
        .delete()
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .eq('pick_number', Number(existingPickNum))
    }

    await supabase.from('user_predictions').upsert({
      pool_id: poolId,
      user_id: userId,
      pick_number: pickNumber,
      prospect_id: prospectId,
      updated_at: new Date().toISOString(),
    })
  }

  async function submitMockPredictions() {
    if (!poolId || !userId) return
    setHasSubmittedMock(true)
    await supabase.from('mock_submissions').upsert({
      pool_id: poolId,
      user_id: userId,
    })
  }

  async function resetMockPredictions() {
    if (!poolId || !userId) return
    setHasSubmittedMock(false)
    await supabase.from('mock_submissions').delete().eq('pool_id', poolId).eq('user_id', userId)
  }

  function getMemberMockPredictions(targetUserId) {
    const preds = {}
    picks.forEach(pick => {
      const key = `${targetUserId}:${pick.number}`
      if (allMemberPredictions[key]) preds[pick.number] = allMemberPredictions[key]
    })
    return preds
  }

  // Computed: standings
  const mockStandings = useMemo(() => {
    if (!pool || !memberList.length) return []
    const actualPicks = draftFeed?.actual_picks ?? {}

    return memberList
      .map(member => {
        const predictions = getMemberMockPredictions(member.id)
        let points = 0

        Object.entries(actualPicks).forEach(([pickNumStr, prospectId]) => {
          const pickNumber = Number(pickNumStr)
          const predictedSlot = Object.entries(predictions).find(([, id]) => id === prospectId)?.[0]
          if (!predictedSlot) return
          const distance = Math.abs(Number(predictedSlot) - pickNumber)
          if (distance === 0) points += settings.exact_hit_points
          else if (distance === 1) points += settings.one_away_points
          else if (distance === 2) points += settings.two_away_points
        })

        return { id: member.id, name: member.name, points }
      })
      .sort((a, b) => b.points - a.points)
  }, [draftFeed?.actual_picks, memberList, allMemberPredictions, pool])

  // Computed: tracking rows
  const mockTrackingRows = useMemo(() => {
    if (!pool || !picks.length) return []
    const actualPicks = draftFeed?.actual_picks ?? {}
    const opponentMembers = memberList.filter(m => !m.isCurrentUser)

    return picks.map(pick => {
      const actualProspectId = actualPicks[pick.number] ?? null
      const myProspectId = mockPredictions[pick.number] ?? null

      function computeState(prospectId) {
        if (!prospectId) return 'out-of-range'
        const actualPickNum = Number(Object.entries(actualPicks).find(([, id]) => id === prospectId)?.[0] ?? 0)
        if (actualPickNum) {
          const distance = Math.abs(pick.number - actualPickNum)
          if (distance === 0) return 'exact'
          if (distance === 1) return 'one-away'
          if (distance === 2) return 'two-away'
          return 'out-of-range'
        }
        if (Object.values(actualPicks).includes(prospectId)) return 'out-of-range'
        if (draftFeed.current_pick_number >= pick.number + 3) return 'out-of-range'
        return 'in-play'
      }

      return {
        pick,
        actualProspect: actualProspectId ? getProspectById(actualProspectId) : null,
        myProspect: myProspectId ? getProspectById(myProspectId) : null,
        myState: computeState(myProspectId),
        opponents: opponentMembers.map(member => {
          const predictions = getMemberMockPredictions(member.id)
          const prospectId = predictions[pick.number] ?? null
          return {
            id: member.id,
            name: member.name,
            prospect: prospectId ? getProspectById(prospectId) : null,
            state: computeState(prospectId),
          }
        }),
      }
    })
  }, [draftFeed?.actual_picks, draftFeed?.current_pick_number, memberList, mockPredictions, allMemberPredictions, pool, picks])

  return {
    mockPredictions,
    hasSubmittedMock,
    mockStandings,
    mockTrackingRows,
    loading,
    saveMockPrediction,
    submitMockPredictions,
    resetMockPredictions,
  }
}
