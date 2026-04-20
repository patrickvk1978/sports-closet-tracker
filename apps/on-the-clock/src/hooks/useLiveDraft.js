import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { usePool } from './usePool'
import { supabase, draftDb } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

// ── Scoring helpers ───────────────────────────────────────────────────────

const DEFAULT_SCORING = { tier_1: 100, tier_2: 120, tier_3: 150, tier_4: 180, streak_threshold: 5, streak_multiplier: 1.5 }

function pickTierPoints(pickNumber, sc) {
  if (pickNumber <= 8)  return sc.tier_1  ?? DEFAULT_SCORING.tier_1
  if (pickNumber <= 16) return sc.tier_2  ?? DEFAULT_SCORING.tier_2
  if (pickNumber <= 24) return sc.tier_3  ?? DEFAULT_SCORING.tier_3
  return                       sc.tier_4  ?? DEFAULT_SCORING.tier_4
}

// Returns points earned for a pick given current streak (BEFORE this pick).
// Streak bonus kicks in after streak_threshold consecutive hits.
function scoreForHit(pickNumber, streakBefore, sc) {
  const base      = pickTierPoints(pickNumber, sc)
  const threshold = sc.streak_threshold ?? DEFAULT_SCORING.streak_threshold
  const mult      = sc.streak_multiplier ?? DEFAULT_SCORING.streak_multiplier
  return Math.round(base * (streakBefore >= threshold ? mult : 1))
}

export function useLiveDraft({ draftFeed, teamCodeForPick }) {
  const { session } = useAuth()
  const { pool, memberList } = usePool()
  const { teams, picks, getProspectById, defaultBigBoardIds } = useReferenceData()
  const [livePredictions, setLivePredictions] = useState({})
  const [liveSelections, setLiveSelections] = useState({})
  const [liveCards, setLiveCards] = useState({})
  const [allMemberCards, setAllMemberCards] = useState({}) // { `userId:pickNumber`: prospectId }
  const [allMemberPredictions, setAllMemberPredictions] = useState({}) // { `userId:pickNumber`: prospectId }
  const [allMemberBoards, setAllMemberBoards] = useState({}) // { userId: boardOrder[] }
  const [loading, setLoading] = useState(true)

  const poolId = pool?.id
  const userId = session?.user?.id
  const settings = pool?.game_mode === 'live_draft'
    ? { fallback_method: 'queue_plus_team_need', ...(pool?.settings ?? {}) }
    : {}

  // Load current user's predictions and cards + all members' data for scoring
  const load = useCallback(async () => {
    if (!poolId || !userId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const [predRes, cardsRes, allCardsRes, allPredsRes, allBoardsRes] = await Promise.all([
      draftDb.from('queues').select('pick_number, prospect_id').eq('pool_id', poolId).eq('user_id', userId),
      draftDb.from('live_cards').select('pick_number, prospect_id').eq('pool_id', poolId).eq('user_id', userId),
      draftDb.from('live_cards').select('user_id, pick_number, prospect_id').eq('pool_id', poolId),
      draftDb.from('queues').select('user_id, pick_number, prospect_id').eq('pool_id', poolId),
      draftDb.from('big_boards').select('user_id, board_order').eq('pool_id', poolId),
    ])

    if (predRes.data) {
      const map = {}
      predRes.data.forEach(r => { map[r.pick_number] = r.prospect_id })
      setLivePredictions(map)
    }

    if (cardsRes.data) {
      const map = {}
      cardsRes.data.forEach(r => { map[r.pick_number] = r.prospect_id })
      setLiveCards(map)
    }

    if (allCardsRes.data) {
      const map = {}
      allCardsRes.data.forEach(r => { map[`${r.user_id}:${r.pick_number}`] = r.prospect_id })
      setAllMemberCards(map)
    }

    if (allPredsRes.data) {
      const map = {}
      allPredsRes.data.forEach(r => { map[`${r.user_id}:${r.pick_number}`] = r.prospect_id })
      setAllMemberPredictions(map)
    }

    if (allBoardsRes.data) {
      const map = {}
      allBoardsRes.data.forEach(r => { map[r.user_id] = r.board_order })
      setAllMemberBoards(map)
    }

    setLoading(false)
  }, [poolId, userId])

  useEffect(() => { load() }, [load])

  // Realtime: watch for other members' card submissions
  useEffect(() => {
    if (!poolId) return
    const channel = supabase
      .channel(`live-cards-${poolId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'draft',
        table: 'live_cards',
        filter: `pool_id=eq.${poolId}`,
      }, (payload) => {
        const r = payload.new
        setAllMemberCards(prev => ({ ...prev, [`${r.user_id}:${r.pick_number}`]: r.prospect_id }))
        if (r.user_id === userId) {
          setLiveCards(prev => ({ ...prev, [r.pick_number]: r.prospect_id }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [poolId, userId])

  function buildFallback({ boardIds, teamCode, fallbackMethod, draftedIds }) {
    const available = boardIds
      .filter(id => !draftedIds.has(id))
      .map(getProspectById)
      .filter(Boolean)
    if (available.length === 0) return null
    if (fallbackMethod !== 'queue_plus_team_need') return available[0]
    const teamNeeds = new Set(teams[teamCode]?.needs ?? [])
    return (
      available.find(p => p.position.split('/').some(pos => teamNeeds.has(pos))) ?? available[0]
    )
  }

  function resolveLivePickForUser(targetUserId, pickNumber) {
    // 1. Submitted card
    const cardKey = `${targetUserId}:${pickNumber}`
    if (allMemberCards[cardKey]) return allMemberCards[cardKey]

    // 2. Prediction
    if (allMemberPredictions[cardKey]) return allMemberPredictions[cardKey]

    // 3. Fallback from big board
    const boardIds = allMemberBoards[targetUserId] ?? defaultBigBoardIds
    const draftedIds = new Set(Object.values(draftFeed?.actual_picks ?? {}))
    const fallback = buildFallback({
      boardIds,
      teamCode: teamCodeForPick(pickNumber),
      fallbackMethod: settings.fallback_method,
      draftedIds,
    })
    return fallback?.id ?? null
  }

  function liveResultForPick(prospectId, actualProspectId) {
    if (!actualProspectId || !prospectId) return 'waiting'
    return prospectId === actualProspectId ? 'exact' : 'miss'
  }

  async function saveLivePrediction(pickNumber, prospectId) {
    if (!prospectId) {
      setLivePredictions(prev => {
        const next = { ...prev }
        delete next[pickNumber]
        return next
      })
      setAllMemberPredictions(prev => {
        const next = { ...prev }
        delete next[`${userId}:${pickNumber}`]
        return next
      })

      if (!poolId || !userId) return

      await draftDb.from('queues')
        .delete()
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .eq('pick_number', pickNumber)
      return
    }

    // Find if this prospect is already assigned to another pick and clear it
    const existingPickNum = Object.entries(livePredictions).find(
      ([num, id]) => id === prospectId && Number(num) !== pickNumber
    )?.[0]

    setLivePredictions(prev => {
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
      await draftDb.from('queues')
        .delete()
        .eq('pool_id', poolId)
        .eq('user_id', userId)
        .eq('pick_number', Number(existingPickNum))
    }

    await draftDb.from('queues').upsert({
      pool_id: poolId,
      user_id: userId,
      pick_number: pickNumber,
      prospect_id: prospectId,
      updated_at: new Date().toISOString(),
    })
  }

  function setLiveCurrentSelection(pickNumber, prospectId) {
    setLiveSelections(prev => ({ ...prev, [pickNumber]: prospectId }))
  }

  async function resetLiveCard(pickNumber) {
    setLiveCards(prev => { const next = { ...prev }; delete next[pickNumber]; return next })
    setAllMemberCards(prev => { const next = { ...prev }; delete next[`${userId}:${pickNumber}`]; return next })
    setLiveSelections(prev => { const next = { ...prev }; delete next[pickNumber]; return next })
    if (!poolId || !userId) return
    await draftDb.from('live_cards').delete()
      .eq('pool_id', poolId)
      .eq('user_id', userId)
      .eq('pick_number', pickNumber)
  }

  // prospectIdOverride lets the caller lock in a specific prospect (e.g. from
  // inline search) without a separate setLiveCurrentSelection call.
  async function submitLiveCard(pickNumber, prospectIdOverride = null) {
    if (!poolId || !userId) return null
    const pick = picks.find(p => p.number === pickNumber)
    if (!pick) return null

    const draftedIds = new Set(Object.values(draftFeed?.actual_picks ?? {}))
    const selectedProspectId =
      prospectIdOverride ??
      liveSelections[pickNumber] ??
      livePredictions[pickNumber] ??
      buildFallback({
        boardIds: allMemberBoards[userId] ?? defaultBigBoardIds,
        teamCode: teamCodeForPick(pickNumber),
        fallbackMethod: settings.fallback_method,
        draftedIds,
      })?.id ??
      null

    if (!selectedProspectId) return null

    // Optimistic update
    setLiveCards(prev => ({ ...prev, [pickNumber]: selectedProspectId }))
    setAllMemberCards(prev => ({ ...prev, [`${userId}:${pickNumber}`]: selectedProspectId }))
    setLiveSelections(prev => ({ ...prev, [pickNumber]: selectedProspectId }))

    await draftDb.from('live_cards').upsert({
      pool_id: poolId,
      user_id: userId,
      pick_number: pickNumber,
      prospect_id: selectedProspectId,
    })

    return selectedProspectId
  }

  // Computed: standings — tiered pick points + streak bonus after N in a row
  const liveStandings = useMemo(() => {
    if (!pool || !memberList.length) return []

    const sc = draftFeed?.scoring_config ?? DEFAULT_SCORING
    const sortedPickNums = Object.keys(draftFeed?.actual_picks ?? {})
      .map(Number)
      .sort((a, b) => a - b)

    return memberList
      .map(member => {
        let points = 0
        let streak = 0

        for (const pickNumber of sortedPickNums) {
          const actualProspectId = draftFeed.actual_picks[pickNumber]
          const prospectId = resolveLivePickForUser(member.id, pickNumber)
          const result = liveResultForPick(prospectId, actualProspectId)
          if (result === 'exact') {
            points += scoreForHit(pickNumber, streak, sc)
            streak++
          } else {
            streak = 0
          }
        }

        return { id: member.id, name: member.name, points, streak }
      })
      .sort((a, b) => b.points - a.points)
  }, [draftFeed?.actual_picks, draftFeed?.scoring_config, memberList, allMemberCards, allMemberPredictions, allMemberBoards, pool])

  // Computed: current pick pool state (includes streakCount entering this pick)
  const currentLivePoolState = useMemo(() => {
    if (!pool || !memberList.length) return []
    const currentPickNum = draftFeed.current_pick_number
    const actualProspectId = draftFeed?.actual_picks?.[currentPickNum] ?? null

    // Prior picks in order — used to compute each member's streak entering this pick
    const priorPickNums = Object.keys(draftFeed?.actual_picks ?? {})
      .map(Number)
      .filter(n => n < currentPickNum)
      .sort((a, b) => a - b)

    return memberList.map(member => {
      // Streak entering the current pick
      let streak = 0
      for (const pickNumber of priorPickNums) {
        const actualId = draftFeed.actual_picks[pickNumber]
        const prospectId = resolveLivePickForUser(member.id, pickNumber)
        if (liveResultForPick(prospectId, actualId) === 'exact') streak++
        else streak = 0
      }

      const lockedProspectId = allMemberCards[`${member.id}:${currentPickNum}`] ?? null
      const effectiveProspectId = resolveLivePickForUser(member.id, currentPickNum)
      const result = liveResultForPick(effectiveProspectId, actualProspectId)
      return {
        id: member.id,
        name: member.name,
        isCurrentUser: member.isCurrentUser,
        locked: Boolean(lockedProspectId),
        prospect: getProspectById(effectiveProspectId),
        result,
        streakCount: streak, // consecutive exact hits BEFORE this pick
      }
    })
  }, [draftFeed?.actual_picks, draftFeed?.current_pick_number, memberList, allMemberCards, allMemberPredictions, allMemberBoards, pool])

  const scoringConfig = draftFeed?.scoring_config ?? DEFAULT_SCORING

  return {
    livePredictions,
    liveSelections,
    liveCards,
    liveStandings,
    currentLivePoolState,
    scoringConfig,
    loading,
    saveLivePrediction,
    setLiveCurrentSelection,
    submitLiveCard,
    resetLiveCard,
    resolveLivePickForUser,
    liveResultForPick,
  }
}
