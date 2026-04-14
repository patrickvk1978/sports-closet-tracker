import { useContext } from 'react'
import { PoolContext } from './PoolContext.jsx'

export function usePool() {
  const ctx = useContext(PoolContext)
  if (!ctx) throw new Error('usePool must be used within a PoolProvider')
  return ctx
}
