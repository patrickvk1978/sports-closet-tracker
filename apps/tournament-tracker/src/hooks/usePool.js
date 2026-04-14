import { useContext } from 'react'
import { PoolContext } from '../context/PoolContext'

export function usePool() {
  const ctx = useContext(PoolContext)
  if (!ctx) throw new Error('usePool must be used inside <PoolProvider>')
  return ctx
}
