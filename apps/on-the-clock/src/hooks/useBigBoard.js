import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { usePool } from './usePool'
import { draftDb } from '../lib/supabase'
import { useReferenceData } from './useReferenceData'

function normalizeBoardOrder(savedBoardIds, defaultBigBoardIds) {
  const validIds = new Set(defaultBigBoardIds)
  const next = []
  const seen = new Set()

  for (const id of savedBoardIds ?? []) {
    if (!validIds.has(id) || seen.has(id)) continue
    next.push(id)
    seen.add(id)
  }

  for (const id of defaultBigBoardIds) {
    if (seen.has(id)) continue
    next.push(id)
    seen.add(id)
  }

  return next
}

export function useBigBoard() {
  const { session } = useAuth()
  const { pool } = usePool()
  const { defaultBigBoardIds } = useReferenceData()
  const [bigBoardIds, setBigBoardIds] = useState([])
  const [loading, setLoading] = useState(true)

  const poolId = pool?.id
  const userId = session?.user?.id

  const load = useCallback(async () => {
    if (!poolId || !userId) {
      setBigBoardIds(defaultBigBoardIds)
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await draftDb
      .from('big_boards')
      .select('board_order')
      .eq('pool_id', poolId)
      .eq('user_id', userId)
      .maybeSingle()

    if (data?.board_order?.length > 0) {
      const normalizedOrder = normalizeBoardOrder(data.board_order, defaultBigBoardIds)
      setBigBoardIds(normalizedOrder)
      if (normalizedOrder.length !== data.board_order.length || normalizedOrder.some((id, index) => id !== data.board_order[index])) {
        await draftDb.from('big_boards').upsert({
          pool_id: poolId,
          user_id: userId,
          board_order: normalizedOrder,
          updated_at: new Date().toISOString(),
        })
      }
    } else {
      // Seed default board on first load
      const defaultOrder = [...defaultBigBoardIds]
      await draftDb.from('big_boards').upsert({
        pool_id: poolId,
        user_id: userId,
        board_order: defaultOrder,
      })
      setBigBoardIds(defaultOrder)
    }
    setLoading(false)
  }, [poolId, userId, defaultBigBoardIds])

  useEffect(() => { load() }, [load])

  async function saveBigBoard(nextBoardIds) {
    const normalizedBoardIds = normalizeBoardOrder(nextBoardIds, defaultBigBoardIds)
    setBigBoardIds(normalizedBoardIds) // optimistic
    if (!poolId || !userId) return
    await draftDb.from('big_boards').upsert({
      pool_id: poolId,
      user_id: userId,
      board_order: normalizedBoardIds,
      updated_at: new Date().toISOString(),
    })
  }

  function moveBigBoardItem(prospectId, direction) {
    const index = bigBoardIds.indexOf(prospectId)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= bigBoardIds.length) return
    const next = [...bigBoardIds]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    saveBigBoard(next)
  }

  // Fetch another member's board (for scoring/resolution)
  async function getMemberBigBoard(targetPoolId, targetUserId) {
    const { data } = await draftDb
      .from('big_boards')
      .select('board_order')
      .eq('pool_id', targetPoolId)
      .eq('user_id', targetUserId)
      .maybeSingle()
    return normalizeBoardOrder(data?.board_order ?? [], defaultBigBoardIds)
  }

  return {
    bigBoardIds,
    loading,
    saveBigBoard,
    moveBigBoardItem,
    getMemberBigBoard,
  }
}
