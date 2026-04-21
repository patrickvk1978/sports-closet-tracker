import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribes to the games table in real-time.
 * Returns the full 63-slot games array, kept live via Supabase Realtime.
 */
export function useGames() {
  const [games, setGames] = useState([])

  useEffect(() => {
    // Initial load
    supabase
      .from('games')
      .select('*')
      .order('slot_index')
      .then(({ data }) => setGames(data ?? []))

    // Realtime subscription — handles INSERT / UPDATE / DELETE
    const channel = supabase
      .channel('public:games')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        (payload) => {
          setGames((current) => {
            if (payload.eventType === 'DELETE') {
              return current.filter((g) => g.id !== payload.old.id)
            }
            const idx = current.findIndex((g) => g.id === payload.new.id)
            if (idx >= 0) {
              const updated = [...current]
              updated[idx] = payload.new
              return updated
            }
            return [...current, payload.new].sort((a, b) => a.slot_index - b.slot_index)
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return games
}
